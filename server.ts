import cors from 'cors';
import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { ensureStorageDirectories, getServerConfig, resolveConfinedPath } from './server/config';
import { getDb, JobRecord } from './server/database';
import {
  extractThumbnailFrame,
  probeVideoFile,
  renderClipWithFFmpeg,
  runPythonEngine,
} from './server/ffmpegPipeline';
import { runStartupHealthCheck } from './server/startupCheck';
import {
  ClipSettings,
  CropKeyframe,
  GeneratedClip,
  Project,
  SourceVideo,
} from './src/types/video';
import { getDefaultSubtitleStyle } from './src/utils/formatters';
import { startEmbeddedWorkerLoop } from './worker';

dotenv.config();

const cfg = getServerConfig();
ensureStorageDirectories(cfg);

const ALLOWED_VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm']);
const WORKSPACE_TOKEN_RE = /^[a-zA-Z0-9_-]{16,128}$/;

interface WorkspaceRequest extends Request {
  workspaceId?: string;
}

function signMediaPath(urlPath: string, workspaceId: string, ttlSeconds = 86400): string {
  const cleanPath = urlPath.split('?')[0];
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${cleanPath}|${workspaceId}|${exp}`;
  const sig = crypto
    .createHmac('sha256', cfg.mediaSigningSecret)
    .update(payload)
    .digest('hex');
  return `${cleanPath}?ws=${encodeURIComponent(workspaceId)}&exp=${exp}&sig=${sig}`;
}

function verifyMediaQuery(urlPath: string, query: Request['query']): string | null {
  const ws = typeof query.ws === 'string' ? query.ws : '';
  const expStr = typeof query.exp === 'string' ? query.exp : '';
  const sig = typeof query.sig === 'string' ? query.sig : '';

  if (!WORKSPACE_TOKEN_RE.test(ws) || !expStr || !sig) {
    return null;
  }

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  const cleanPath = urlPath.split('?')[0];
  const expectedSig = crypto
    .createHmac('sha256', cfg.mediaSigningSecret)
    .update(`${cleanPath}|${ws}|${exp}`)
    .digest('hex');

  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length) {
    return null;
  }

  return crypto.timingSafeEqual(sigBuf, expectedBuf) ? ws : null;
}

function withSignedSource(
  source: Omit<SourceVideo, 'objectUrl'>,
  workspaceId: string
): Omit<SourceVideo, 'objectUrl'> {
  return {
    ...source,
    streamUrl: source.streamUrl ? signMediaPath(source.streamUrl, workspaceId) : undefined,
    posterUrl: source.posterUrl ? signMediaPath(source.posterUrl, workspaceId) : undefined,
  };
}

function withSignedProject(project: Project, workspaceId: string): Project {
  return {
    ...project,
    sourceVideo: withSignedSource(project.sourceVideo, workspaceId),
  };
}

function withSignedClip(clip: GeneratedClip, workspaceId: string): GeneratedClip {
  return {
    ...clip,
    previewImageUrl: clip.previewImageUrl
      ? signMediaPath(clip.previewImageUrl, workspaceId)
      : clip.previewImageUrl,
    renderedUrl: clip.renderedUrl ? signMediaPath(clip.renderedUrl, workspaceId) : clip.renderedUrl,
  };
}

function requireWorkspace(req: WorkspaceRequest, res: Response, next: NextFunction): void {
  const rawToken = req.header('X-Workspace-Token')?.trim() || '';
  if (!WORKSPACE_TOKEN_RE.test(rawToken)) {
    res.status(401).json({
      error: 'Missing or invalid X-Workspace-Token header (16-128 URL-safe characters required).',
    });
    return;
  }
  req.workspaceId = rawToken;
  next();
}

function safeUnlink(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // Ignore file removal error
  }
}

function isFilenameOwnedByWorkspace(
  kind: 'uploads' | 'renders' | 'thumbs',
  filename: string,
  workspaceId: string
): boolean {
  const db = getDb();
  const projects = db.listProjects(workspaceId);
  for (const proj of projects) {
    if (kind === 'uploads' && proj.sourceVideo.id === filename) {
      return true;
    }
    if (kind === 'thumbs' && proj.sourceVideo.posterUrl?.split('?')[0].endsWith(`/${filename}`)) {
      return true;
    }
    const clips = db.listClips(proj.id, workspaceId);
    for (const c of clips) {
      if (kind === 'renders' && c.renderedUrl?.split('?')[0].endsWith(`/${filename}`)) {
        return true;
      }
      if (kind === 'thumbs' && c.previewImageUrl?.split('?')[0].endsWith(`/${filename}`)) {
        return true;
      }
    }
  }
  return false;
}

const fullUploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, cfg.uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ALLOWED_VIDEO_EXTS.has(ext) ? ext : '.mp4';
    cb(null, `src-${Date.now()}-${crypto.randomUUID().slice(0, 8)}${safeExt}`);
  },
});

const uploadSingleVideo = multer({
  storage: fullUploadStorage,
  limits: { fileSize: cfg.maxUploadMb * 1024 * 1024 },
});

const chunkUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024 }, // max 16 MB per individual chunk
});

async function startServer() {
  const db = getDb();
  const app = express();

  app.set('trust proxy', 1);

  // Strict CORS allowlist
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          // Same-origin / server-to-server / curl
          callback(null, true);
          return;
        }
        if (cfg.corsAllowedOrigins.length > 0) {
          if (cfg.corsAllowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error(`Origin ${origin} is not allowed by CORS_ALLOWED_ORIGINS.`));
          }
          return;
        }
        if (cfg.nodeEnv !== 'production') {
          callback(null, true);
          return;
        }
        callback(new Error('Cross-origin requests require CORS_ALLOWED_ORIGINS in production.'));
      },
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-Workspace-Token'],
      credentials: false,
      maxAge: 600,
    })
  );

  app.use(express.json({ limit: '5mb' }));

  const generalApiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1800,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many API requests from this IP. Please slow down.' },
  });

  const heavyOperationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Upload/render rate limit exceeded. Please wait before submitting more jobs.' },
  });

  app.use('/api', generalApiLimiter);

  // ---- Health & Capabilities ----
  app.get('/api/health', async (_req, res) => {
    try {
      const caps = await runStartupHealthCheck(false);
      res.json(caps);
    } catch (err) {
      res.status(500).json({
        backendOnline: false,
        error: err instanceof Error ? err.message : 'Health check failed',
      });
    }
  });

  app.get('/api/health/deep', async (_req, res) => {
    try {
      const caps = await runStartupHealthCheck(true);
      res.json(caps);
    } catch (err) {
      res.status(500).json({
        backendOnline: false,
        error: err instanceof Error ? err.message : 'Deep health check failed',
      });
    }
  });

  // ---- Signed & Workspace-Scoped Media Delivery ----
  const serveMedia = (kind: 'uploads' | 'renders' | 'thumbs', baseDir: string) => {
    return (req: WorkspaceRequest, res: Response) => {
      const rawFilename = String(req.params.filename || '');
      const fullPathUrl = `/api/media/${kind}/${rawFilename}`;
      const signedWs = verifyMediaQuery(fullPathUrl, req.query);
      const headerWs = req.header('X-Workspace-Token')?.trim() || '';

      let authorized = Boolean(signedWs);
      if (!authorized && WORKSPACE_TOKEN_RE.test(headerWs)) {
        authorized = isFilenameOwnedByWorkspace(kind, path.basename(rawFilename), headerWs);
      }

      if (!authorized) {
        res.status(403).json({ error: 'Valid signed media token or workspace ownership required.' });
        return;
      }

      try {
        const filePath = resolveConfinedPath(baseDir, rawFilename);
        if (!fs.existsSync(filePath)) {
          res.status(404).json({ error: 'Media file not found on storage.' });
          return;
        }
        res.sendFile(filePath, {
          acceptRanges: true,
          cacheControl: true,
          maxAge: '1h',
        });
      } catch {
        res.status(400).json({ error: 'Invalid media identifier.' });
      }
    };
  };

  app.get('/api/media/uploads/:filename', serveMedia('uploads', cfg.uploadsDir));
  app.get('/api/media/renders/:filename', serveMedia('renders', cfg.rendersDir));
  app.get('/api/media/thumbs/:filename', serveMedia('thumbs', cfg.thumbsDir));

  // Download endpoint accepting either signed query string or X-Workspace-Token
  app.get('/api/clips/:clipId/download', (req, res) => {
    const clipId = String(req.params.clipId || '');
    const signedWs = verifyMediaQuery(`/api/clips/${clipId}/download`, req.query);
    const headerWs = req.header('X-Workspace-Token')?.trim() || '';
    const workspaceId = signedWs || (WORKSPACE_TOKEN_RE.test(headerWs) ? headerWs : '');

    if (!workspaceId) {
      res.status(401).json({ error: 'Missing workspace authorization for clip download.' });
      return;
    }

    const clip = db.getClip(clipId, workspaceId);
    if (!clip || !clip.renderedUrl) {
      res.status(404).json({ error: 'Rendered MP4 not found for this clip.' });
      return;
    }

    try {
      const cleanUrl = clip.renderedUrl.split('?')[0];
      const filename = path.basename(cleanUrl);
      const mp4Path = resolveConfinedPath(cfg.rendersDir, filename);
      if (!fs.existsSync(mp4Path)) {
        res.status(404).json({ error: 'Rendered file missing from disk.' });
        return;
      }
      const slug =
        clip.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || 'ytclip-short';
      res.download(mp4Path, `${slug}-${clip.exportSettings.quality}.mp4`);
    } catch {
      res.status(400).json({ error: 'Invalid clip file reference.' });
    }
  });

  // All remaining /api routes require X-Workspace-Token isolation
  app.use('/api', requireWorkspace);

  // ---- Video Validation ----
  app.post('/api/videos/validate', (req: WorkspaceRequest, res) => {
    const workspaceId = req.workspaceId!;
    const { filename = '', sizeBytes = 0, maxFileSizeMb = cfg.maxUploadMb } = req.body as {
      filename?: string;
      sizeBytes?: number;
      maxFileSizeMb?: number;
    };

    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_VIDEO_EXTS.has(ext)) {
      res.json({
        valid: false,
        error: 'Unsupported format. Upload an MP4, MOV, or WebM video file.',
      });
      return;
    }

    const effectiveLimitMb = Math.min(cfg.maxUploadMb, maxFileSizeMb || cfg.maxUploadMb);
    if (sizeBytes > effectiveLimitMb * 1024 * 1024) {
      res.json({
        valid: false,
        error: `File exceeds the server upload limit of ${effectiveLimitMb} MB.`,
      });
      return;
    }

    const usedBytes = db.getWorkspaceStorageBytes(workspaceId);
    const quotaBytes = cfg.maxWorkspaceStorageMb * 1024 * 1024;
    if (usedBytes + sizeBytes > quotaBytes) {
      res.json({
        valid: false,
        error: `Workspace storage quota (${cfg.maxWorkspaceStorageMb} MB) would be exceeded. Delete old projects first.`,
      });
      return;
    }

    res.json({ valid: true });
  });

  // ---- Chunked Streaming Upload (Preferred for Production / Large Files) ----
  app.post('/api/videos/upload/init', heavyOperationLimiter, (req: WorkspaceRequest, res) => {
    const workspaceId = req.workspaceId!;
    const { filename = '', mimeType = 'video/mp4', totalSizeBytes = 0, totalChunks = 0 } =
      req.body as {
        filename?: string;
        mimeType?: string;
        totalSizeBytes?: number;
        totalChunks?: number;
      };

    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_VIDEO_EXTS.has(ext)) {
      res.status(400).json({ error: 'Unsupported format. Only MP4, MOV, or WebM are allowed.' });
      return;
    }

    if (!Number.isFinite(totalSizeBytes) || totalSizeBytes <= 0) {
      res.status(400).json({ error: 'Invalid totalSizeBytes.' });
      return;
    }

    if (totalSizeBytes > cfg.maxUploadMb * 1024 * 1024) {
      res.status(413).json({ error: `Video exceeds ${cfg.maxUploadMb} MB server limit.` });
      return;
    }

    if (!Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > 2000) {
      res.status(400).json({ error: 'totalChunks must be an integer between 1 and 2000.' });
      return;
    }

    const usedBytes = db.getWorkspaceStorageBytes(workspaceId);
    if (usedBytes + totalSizeBytes > cfg.maxWorkspaceStorageMb * 1024 * 1024) {
      res.status(507).json({
        error: `Workspace storage quota (${cfg.maxWorkspaceStorageMb} MB) exceeded. Delete old projects first.`,
      });
      return;
    }

    const uploadId = `up-${crypto.randomUUID()}`;
    const sessionDir = resolveConfinedPath(cfg.chunksDir, uploadId);
    fs.mkdirSync(sessionDir, { recursive: true });

    db.createUploadSession({
      id: uploadId,
      workspaceId,
      filename: path.basename(filename),
      mimeType,
      totalSizeBytes,
      totalChunks,
      receivedChunks: 0,
      status: 'uploading',
      createdAt: new Date().toISOString(),
    });

    res.json({ uploadId, chunkSizeLimitMb: 10 });
  });

  app.put(
    '/api/videos/upload/chunk',
    chunkUploadMiddleware.single('chunk'),
    (req: WorkspaceRequest, res) => {
      const workspaceId = req.workspaceId!;
      const uploadId = String(req.query.uploadId || '');
      const chunkIndex = Number(req.query.chunkIndex);

      if (!uploadId || !Number.isInteger(chunkIndex) || chunkIndex < 0) {
        res.status(400).json({ error: 'Valid uploadId and chunkIndex query parameters required.' });
        return;
      }

      const session = db.getUploadSession(uploadId, workspaceId);
      if (!session || session.status !== 'uploading') {
        res.status(404).json({ error: 'Active upload session not found for this workspace.' });
        return;
      }

      if (chunkIndex >= session.totalChunks) {
        res.status(400).json({ error: 'chunkIndex out of bounds for upload session.' });
        return;
      }

      if (!req.file || !req.file.buffer) {
        res.status(400).json({ error: 'Missing binary "chunk" form field.' });
        return;
      }

      const sessionDir = resolveConfinedPath(cfg.chunksDir, uploadId);
      const partPath = resolveConfinedPath(sessionDir, `chunk-${chunkIndex}.part`);
      fs.writeFileSync(partPath, req.file.buffer);
      db.markUploadChunkReceived(uploadId, chunkIndex);

      res.json({
        uploadId,
        chunkIndex,
        bytesWritten: req.file.size,
      });
    }
  );

  app.post(
    '/api/videos/upload/complete',
    heavyOperationLimiter,
    async (req: WorkspaceRequest, res) => {
      const workspaceId = req.workspaceId!;
      const { uploadId = '' } = req.body as { uploadId?: string };

      const session = db.getUploadSession(uploadId, workspaceId);
      if (!session || session.status !== 'uploading') {
        res.status(404).json({ error: 'Upload session not found or already completed.' });
        return;
      }

      const sessionDir = resolveConfinedPath(cfg.chunksDir, uploadId);
      const ext = path.extname(session.filename).toLowerCase();
      const safeExt = ALLOWED_VIDEO_EXTS.has(ext) ? ext : '.mp4';
      const targetFilename = `src-${Date.now()}-${crypto.randomUUID().slice(0, 8)}${safeExt}`;
      const targetPath = resolveConfinedPath(cfg.uploadsDir, targetFilename);

      try {
        for (let i = 0; i < session.totalChunks; i++) {
          const partPath = resolveConfinedPath(sessionDir, `chunk-${i}.part`);
          if (!fs.existsSync(partPath)) {
            res.status(400).json({ error: `Missing chunk ${i} of ${session.totalChunks}.` });
            return;
          }
        }

        // Assemble sequentially using file streams (zero full-file RAM buffering)
        const outStream = fs.createWriteStream(targetPath);
        for (let i = 0; i < session.totalChunks; i++) {
          const partPath = resolveConfinedPath(sessionDir, `chunk-${i}.part`);
          await new Promise<void>((resolve, reject) => {
            const inStream = fs.createReadStream(partPath);
            inStream.on('error', reject);
            inStream.on('end', resolve);
            inStream.pipe(outStream, { end: false });
          });
        }
        await new Promise<void>((resolve, reject) => {
          outStream.on('error', reject);
          outStream.end(() => resolve());
        });

        const stat = fs.statSync(targetPath);
        const probe = await probeVideoFile(targetPath);
        if (probe.durationSeconds > cfg.maxDurationSeconds) {
          safeUnlink(targetPath);
          res.status(400).json({
            error: `Video duration exceeds the ${Math.round(cfg.maxDurationSeconds / 60)}-minute maximum limit.`,
          });
          return;
        }

        const thumbName = `${targetFilename}.jpg`;
        const thumbPath = resolveConfinedPath(cfg.thumbsDir, thumbName);
        await extractThumbnailFrame(
          targetPath,
          Math.min(2, probe.durationSeconds * 0.2),
          thumbPath
        ).catch(() => {});

        db.completeUploadSession(uploadId);

        const sourceVideo: Omit<SourceVideo, 'objectUrl'> = withSignedSource(
          {
            id: targetFilename,
            filename: session.filename,
            fileSizeBytes: stat.size,
            mimeType: session.mimeType || 'video/mp4',
            durationSeconds: probe.durationSeconds,
            width: probe.width,
            height: probe.height,
            isDemoSample: false,
            streamUrl: `/api/media/uploads/${targetFilename}`,
            posterUrl: `/api/media/thumbs/${thumbName}`,
            uploadedAt: new Date().toISOString(),
          },
          workspaceId
        );

        res.json(sourceVideo);
      } catch (err) {
        safeUnlink(targetPath);
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Failed to finalize uploaded video.',
        });
      } finally {
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        } catch {
          // ignore cleanup error
        }
      }
    }
  );

  // ---- Direct Single-Request Streaming Disk Upload ----
  app.post(
    '/api/videos/upload',
    heavyOperationLimiter,
    uploadSingleVideo.single('video'),
    async (req: WorkspaceRequest, res) => {
      const workspaceId = req.workspaceId!;
      try {
        if (!req.file) {
          res.status(400).json({ error: 'No video file provided in "video" field.' });
          return;
        }

        const usedBytes = db.getWorkspaceStorageBytes(workspaceId);
        if (usedBytes + req.file.size > cfg.maxWorkspaceStorageMb * 1024 * 1024) {
          safeUnlink(req.file.path);
          res.status(507).json({
            error: `Workspace storage quota (${cfg.maxWorkspaceStorageMb} MB) exceeded. Delete old projects first.`,
          });
          return;
        }

        const probe = await probeVideoFile(req.file.path);
        if (probe.durationSeconds > cfg.maxDurationSeconds) {
          safeUnlink(req.file.path);
          res.status(400).json({
            error: `Video exceeds the ${Math.round(cfg.maxDurationSeconds / 60)}-minute maximum duration limit.`,
          });
          return;
        }

        const thumbName = `${req.file.filename}.jpg`;
        const thumbPath = resolveConfinedPath(cfg.thumbsDir, thumbName);
        await extractThumbnailFrame(
          req.file.path,
          Math.min(2, probe.durationSeconds * 0.2),
          thumbPath
        ).catch(() => {});

        const sourceVideo = withSignedSource(
          {
            id: req.file.filename,
            filename: path.basename(req.file.originalname),
            fileSizeBytes: req.file.size,
            mimeType: req.file.mimetype || 'video/mp4',
            durationSeconds: probe.durationSeconds,
            width: probe.width,
            height: probe.height,
            isDemoSample: false,
            streamUrl: `/api/media/uploads/${req.file.filename}`,
            posterUrl: `/api/media/thumbs/${thumbName}`,
            uploadedAt: new Date().toISOString(),
          },
          workspaceId
        );

        res.json(sourceVideo);
      } catch (err) {
        if (req.file) safeUnlink(req.file.path);
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Failed to inspect uploaded video.',
        });
      }
    }
  );

  // ---- Projects CRUD (Workspace-Scoped) ----
  app.get('/api/projects', (req: WorkspaceRequest, res) => {
    const workspaceId = req.workspaceId!;
    const list = db.listProjects(workspaceId).map((p) => withSignedProject(p, workspaceId));
    res.json(list);
  });

  app.get('/api/projects/:id', (req: WorkspaceRequest, res) => {
    const workspaceId = req.workspaceId!;
    const proj = db.getProject(String(req.params.id), workspaceId);
    if (!proj) {
      res.json(null);
      return;
    }
    const { workspaceId: _ws, ...publicProj } = proj;
    res.json(withSignedProject(publicProj, workspaceId));
  });

  app.post('/api/projects', (req: WorkspaceRequest, res) => {
    const workspaceId = req.workspaceId!;
    const { title, sourceVideo, clipSettings } = req.body as {
      title?: string;
      sourceVideo?: Omit<SourceVideo, 'objectUrl'>;
      clipSettings?: ClipSettings;
    };

    if (!sourceVideo?.id || !clipSettings) {
      res.status(400).json({ error: 'sourceVideo and clipSettings are required.' });
      return;
    }

    // Verify source file exists inside uploads dir
    try {
      const sourcePath = resolveConfinedPath(cfg.uploadsDir, sourceVideo.id);
      if (!fs.existsSync(sourcePath)) {
        res.status(400).json({ error: 'Uploaded source video could not be found on server.' });
        return;
      }
    } catch {
      res.status(400).json({ error: 'Invalid sourceVideo identifier.' });
      return;
    }

    const now = new Date().toISOString();
    const project: Project = {
      id: `proj-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
      title: (title || sourceVideo.filename).trim().slice(0, 140),
      sourceVideo: {
        ...sourceVideo,
        streamUrl: `/api/media/uploads/${path.basename(sourceVideo.id)}`,
        posterUrl: `/api/media/thumbs/${path.basename(sourceVideo.id)}.jpg`,
      },
      clipSettings,
      status: 'queued',
      clipCount: 0,
      isDemoMode: false,
      createdAt: now,
      updatedAt: now,
    };

    db.createProject(workspaceId, project);
    res.json(withSignedProject(project, workspaceId));
  });

  app.delete('/api/projects/:id', (req: WorkspaceRequest, res) => {
    const workspaceId = req.workspaceId!;
    const projectId = String(req.params.id);
    const proj = db.getProject(projectId, workspaceId);
    if (!proj) {
      res.status(204).end();
      return;
    }

    const clips = db.listClips(projectId, workspaceId);
    try {
      safeUnlink(resolveConfinedPath(cfg.uploadsDir, proj.sourceVideo.id));
      safeUnlink(resolveConfinedPath(cfg.thumbsDir, `${path.basename(proj.sourceVideo.id)}.jpg`));
      for (const c of clips) {
        if (c.renderedUrl) {
          safeUnlink(resolveConfinedPath(cfg.rendersDir, path.basename(c.renderedUrl.split('?')[0])));
        }
        if (c.previewImageUrl) {
          safeUnlink(
            resolveConfinedPath(cfg.thumbsDir, path.basename(c.previewImageUrl.split('?')[0]))
          );
        }
      }
    } catch {
      // ignore path cleanup edge cases
    }

    db.deleteProject(projectId, workspaceId);
    res.status(204).end();
  });

  // ---- Persistent Worker Queue Endpoints ----
  app.post('/api/projects/:id/process', heavyOperationLimiter, (req: WorkspaceRequest, res) => {
    const workspaceId = req.workspaceId!;
    const project = db.getProject(String(req.params.id), workspaceId);
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }

    const existing = db.getLatestJobForProject(project.id, workspaceId);
    if (existing && (existing.status === 'queued' || existing.status === 'processing')) {
      res.json(existing);
      return;
    }

    const job: JobRecord = {
      id: `job-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
      projectId: project.id,
      workspaceId,
      status: 'queued',
      currentStage: 'validating',
      progress: 2,
      message: 'Queued for background AI video worker...',
      attempts: 0,
      maxAttempts: 1 + cfg.maxJobRetries,
      isDemoMode: false,
      canCancel: true,
      startedAt: new Date().toISOString(),
    };

    db.enqueueJob(job);
    db.updateProjectStatus(project.id, 'queued');
    res.json(job);
  });

  app.get('/api/projects/:id/job', (req: WorkspaceRequest, res) => {
    const workspaceId = req.workspaceId!;
    const job = db.getLatestJobForProject(String(req.params.id), workspaceId);
    res.json(job);
  });

  app.get('/api/jobs/:jobId', (req: WorkspaceRequest, res) => {
    const workspaceId = req.workspaceId!;
    const job = db.getJob(String(req.params.jobId), workspaceId);
    if (!job) {
      res.status(404).json({ error: 'Processing job not found.' });
      return;
    }
    res.json(job);
  });

  app.post('/api/jobs/:jobId/cancel', (req: WorkspaceRequest, res) => {
    const workspaceId = req.workspaceId!;
    const job = db.getJob(String(req.params.jobId), workspaceId);
    if (!job) {
      res.status(404).json({ error: 'Processing job not found.' });
      return;
    }

    db.updateJob(job.id, {
      status: 'cancelled',
      canCancel: false,
      message: 'Processing cancelled by user.',
    });
    db.updateProjectStatus(job.projectId, 'cancelled');
    res.json(db.getJob(job.id, workspaceId));
  });

  // ---- Highlights & Clips (Workspace-Scoped) ----
  app.get('/api/projects/:id/highlights', (req: WorkspaceRequest, res) => {
    res.json(db.listHighlights(String(req.params.id), req.workspaceId!));
  });

  app.patch('/api/highlights/:id', (req: WorkspaceRequest, res) => {
    const selected = Boolean((req.body as { selected?: boolean }).selected);
    const updated = db.toggleHighlight(String(req.params.id), req.workspaceId!, selected);
    if (!updated) {
      res.status(404).json({ error: 'Highlight not found.' });
      return;
    }
    res.json(updated);
  });

  app.post(
    '/api/projects/:id/clips/from-highlights',
    heavyOperationLimiter,
    async (req: WorkspaceRequest, res) => {
      const workspaceId = req.workspaceId!;
      try {
        const project = db.getProject(String(req.params.id), workspaceId);
        if (!project) {
          res.status(404).json({ error: 'Project not found.' });
          return;
        }
        const sourcePath = resolveConfinedPath(cfg.uploadsDir, project.sourceVideo.id);
        const probe = await probeVideoFile(sourcePath);
        const highlights = db
          .listHighlights(project.id, workspaceId)
          .filter((h) => h.selected);
        const transcript = db.getTranscript(project.id)?.segments ?? [];

        const rebuilt: GeneratedClip[] = [];
        for (let idx = 0; idx < highlights.length; idx++) {
          const hl = highlights[idx];
          const clipId = `clip-${project.id}-${idx + 1}-${Date.now().toString().slice(-4)}`;
          const trackRes = await runPythonEngine<{
            engine: 'opencv-face' | 'center-fallback' | 'unavailable';
            error?: string;
            keyframes: CropKeyframe[];
          }>([
            'track',
            '--video',
            sourcePath,
            '--start',
            String(hl.startTime),
            '--end',
            String(hl.endTime),
          ]);

          if (trackRes.engine === 'unavailable') {
            res.status(503).json({
              error: trackRes.error || 'OpenCV (cv2) speaker tracking is unavailable on this server.',
            });
            return;
          }

          const segs = transcript.filter(
            (s) => s.endTime >= hl.startTime && s.startTime <= hl.endTime
          );
          const effectiveSegs = segs.length
            ? segs
            : [
                {
                  id: `seg-${clipId}`,
                  startTime: hl.startTime,
                  endTime: hl.endTime,
                  text: hl.suggestedHook,
                },
              ];

          const subtitleStyle = getDefaultSubtitleStyle(project.clipSettings.captionTemplate);
          if (project.clipSettings.includeEmojis !== undefined) {
            subtitleStyle.includeEmojis = project.clipSettings.includeEmojis;
          }

          const thumbName = `${clipId}.jpg`;
          await extractThumbnailFrame(
            sourcePath,
            (hl.startTime + hl.endTime) / 2,
            resolveConfinedPath(cfg.thumbsDir, thumbName)
          );

          const mp4Name = `${clipId}.mp4`;
          const mp4Path = resolveConfinedPath(cfg.rendersDir, mp4Name);
          const assPath = resolveConfinedPath(cfg.workDir, `${clipId}.ass`);

          try {
            const qc = await renderClipWithFFmpeg({
              sourceVideoPath: sourcePath,
              sourceW: probe.width,
              sourceH: probe.height,
              sourceHasAudio: probe.hasAudio,
              clipStart: hl.startTime,
              clipEnd: hl.endTime,
              aspectRatio: project.clipSettings.aspectRatio,
              quality: project.clipSettings.exportQuality,
              keyframes: trackRes.keyframes,
              subtitleStyle,
              transcriptSegments: effectiveSegs,
              outputMp4Path: mp4Path,
              assPath,
              trackingEngine: trackRes.engine,
            });

            rebuilt.push({
              id: clipId,
              projectId: project.id,
              highlightId: hl.id,
              title: `Clip ${idx + 1}: ${hl.suggestedHook.slice(0, 38)}`,
              startTime: hl.startTime,
              endTime: hl.endTime,
              durationSeconds: Math.max(1, Math.round(hl.endTime - hl.startTime)),
              aspectRatio: project.clipSettings.aspectRatio,
              suggestedHook: hl.suggestedHook,
              selectionReason: hl.selectionReason,
              highlightScore: hl.highlightScore,
              suggestedTitle: `${hl.suggestedHook} | YTClip`,
              suggestedHashtags: ['#Shorts', '#Reels', '#YTClip'],
              subtitleStatus: 'auto-generated',
              subtitleStyle,
              transcriptSegments: effectiveSegs,
              cropKeyframes: trackRes.keyframes,
              autoCropKeyframes: trackRes.keyframes,
              trackingEngine: trackRes.engine === 'opencv-face' ? 'opencv-face' : 'center-fallback',
              transcriptionEngine: 'faster-whisper',
              exportSettings: {
                format: 'mp4',
                quality: project.clipSettings.exportQuality,
                aspectRatio: project.clipSettings.aspectRatio,
              },
              previewImageUrl: `/api/media/thumbs/${thumbName}`,
              renderedUrl: `/api/media/renders/${mp4Name}`,
              isDemoSample: false,
              qualityCheck: qc,
              updatedAt: new Date().toISOString(),
            });
          } finally {
            safeUnlink(assPath);
          }
        }

        db.replaceProjectClips(project.id, workspaceId, rebuilt);
        db.updateProjectStatus(project.id, 'completed', rebuilt.length);
        res.json(rebuilt.map((c) => withSignedClip(c, workspaceId)));
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to rebuild clips.' });
      }
    }
  );

  app.get('/api/projects/:id/clips', (req: WorkspaceRequest, res) => {
    const workspaceId = req.workspaceId!;
    const list = db
      .listClips(String(req.params.id), workspaceId)
      .map((c) => withSignedClip(c, workspaceId));
    res.json(list);
  });

  app.get('/api/clips/:clipId', (req: WorkspaceRequest, res) => {
    const workspaceId = req.workspaceId!;
    const clip = db.getClip(String(req.params.clipId), workspaceId);
    if (!clip) {
      res.json(null);
      return;
    }
    const { workspaceId: _ws, ...publicClip } = clip;
    res.json(withSignedClip(publicClip, workspaceId));
  });

  app.patch('/api/clips/:clipId', (req: WorkspaceRequest, res) => {
    const workspaceId = req.workspaceId!;
    const existing = db.getClip(String(req.params.clipId), workspaceId);
    if (!existing) {
      res.status(404).json({ error: 'Clip not found.' });
      return;
    }

    const patch = req.body as Partial<GeneratedClip>;
    const { workspaceId: _ws, ...baseClip } = existing;

    const nextStart =
      typeof patch.startTime === 'number' && Number.isFinite(patch.startTime)
        ? Math.max(0, patch.startTime)
        : baseClip.startTime;
    const nextEnd =
      typeof patch.endTime === 'number' && Number.isFinite(patch.endTime)
        ? Math.max(nextStart + 1, patch.endTime)
        : baseClip.endTime;

    const updated: GeneratedClip = {
      ...baseClip,
      ...patch,
      id: baseClip.id,
      projectId: baseClip.projectId,
      startTime: nextStart,
      endTime: nextEnd,
      durationSeconds: Math.max(1, Math.round(nextEnd - nextStart)),
      // Preserve clean unsigned storage paths
      previewImageUrl: baseClip.previewImageUrl.split('?')[0],
      renderedUrl: baseClip.renderedUrl ? baseClip.renderedUrl.split('?')[0] : baseClip.renderedUrl,
      updatedAt: new Date().toISOString(),
    };

    db.saveClip(workspaceId, updated);
    res.json(withSignedClip(updated, workspaceId));
  });

  app.post('/api/clips/:clipId/retrack', heavyOperationLimiter, async (req: WorkspaceRequest, res) => {
    const workspaceId = req.workspaceId!;
    try {
      const existing = db.getClip(String(req.params.clipId), workspaceId);
      if (!existing) {
        res.status(404).json({ error: 'Clip not found.' });
        return;
      }
      const project = db.getProject(existing.projectId, workspaceId);
      if (!project) {
        res.status(404).json({ error: 'Project not found.' });
        return;
      }

      const sourcePath = resolveConfinedPath(cfg.uploadsDir, project.sourceVideo.id);
      const trackRes = await runPythonEngine<{
        engine: 'opencv-face' | 'center-fallback' | 'unavailable';
        error?: string;
        keyframes: CropKeyframe[];
      }>([
        'track',
        '--video',
        sourcePath,
        '--start',
        String(existing.startTime),
        '--end',
        String(existing.endTime),
      ]);

      if (trackRes.engine === 'unavailable') {
        res.status(503).json({
          error: trackRes.error || 'OpenCV (cv2) speaker tracking is unavailable on this server.',
        });
        return;
      }

      const { workspaceId: _ws, ...baseClip } = existing;
      const updated: GeneratedClip = {
        ...baseClip,
        cropKeyframes: trackRes.keyframes,
        autoCropKeyframes: trackRes.keyframes,
        trackingEngine: trackRes.engine === 'opencv-face' ? 'opencv-face' : 'center-fallback',
        updatedAt: new Date().toISOString(),
      };
      db.saveClip(workspaceId, updated);
      res.json(withSignedClip(updated, workspaceId));
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Retracking failed.' });
    }
  });

  app.post('/api/clips/:clipId/render', heavyOperationLimiter, async (req: WorkspaceRequest, res) => {
    const workspaceId = req.workspaceId!;
    try {
      const existing = db.getClip(String(req.params.clipId), workspaceId);
      if (!existing) {
        res.status(404).json({ error: 'Clip not found.' });
        return;
      }
      const project = db.getProject(existing.projectId, workspaceId);
      if (!project) {
        res.status(404).json({ error: 'Project not found.' });
        return;
      }

      const sourcePath = resolveConfinedPath(cfg.uploadsDir, project.sourceVideo.id);
      const probe = await probeVideoFile(sourcePath);

      const mp4Name = `${existing.id}-v${Date.now().toString().slice(-5)}.mp4`;
      const mp4Path = resolveConfinedPath(cfg.rendersDir, mp4Name);
      const assPath = resolveConfinedPath(cfg.workDir, `${existing.id}-${Date.now()}.ass`);

      let qualityCheck;
      try {
        qualityCheck = await renderClipWithFFmpeg({
          sourceVideoPath: sourcePath,
          sourceW: probe.width,
          sourceH: probe.height,
          sourceHasAudio: probe.hasAudio,
          clipStart: existing.startTime,
          clipEnd: existing.endTime,
          aspectRatio: existing.aspectRatio,
          quality: existing.exportSettings.quality,
          keyframes: existing.cropKeyframes,
          subtitleStyle: existing.subtitleStyle,
          transcriptSegments: existing.transcriptSegments,
          outputMp4Path: mp4Path,
          assPath,
          trackingEngine: existing.trackingEngine,
        });
      } finally {
        safeUnlink(assPath);
      }

      const { workspaceId: _ws, ...baseClip } = existing;
      const cleanRenderedUrl = `/api/media/renders/${mp4Name}`;
      const updated: GeneratedClip = {
        ...baseClip,
        renderedUrl: cleanRenderedUrl,
        qualityCheck,
        updatedAt: new Date().toISOString(),
      };
      db.saveClip(workspaceId, updated);

      const slug =
        existing.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || 'ytclip-short';

      res.json({
        renderedUrl: signMediaPath(`/api/clips/${existing.id}/download`, workspaceId),
        streamUrl: signMediaPath(cleanRenderedUrl, workspaceId),
        filename: `${slug}-${existing.exportSettings.quality}.mp4`,
        qualityCheck,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'FFmpeg render failed.' });
    }
  });

  app.delete('/api/clips/:clipId', (req: WorkspaceRequest, res) => {
    const workspaceId = req.workspaceId!;
    const clip = db.getClip(String(req.params.clipId), workspaceId);
    if (clip) {
      try {
        if (clip.renderedUrl) {
          safeUnlink(resolveConfinedPath(cfg.rendersDir, path.basename(clip.renderedUrl.split('?')[0])));
        }
        if (clip.previewImageUrl) {
          safeUnlink(
            resolveConfinedPath(cfg.thumbsDir, path.basename(clip.previewImageUrl.split('?')[0]))
          );
        }
      } catch {
        // ignore
      }
      db.deleteClip(clip.id, workspaceId);
    }
    res.status(204).end();
  });

  // ---- Frontend Serving (Vite Dev Middleware or Static Dist) ----
  if (cfg.nodeEnv !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    } else {
      app.get('/', (_req, res) => {
        res.json({
          service: 'YTClip Backend API',
          status: 'online',
          note: 'Frontend static bundle served separately.',
        });
      });
    }
  }

  // Run startup capability check cleanly
  const startupCaps = await runStartupHealthCheck(false);
  console.log(`[YTClip API] Startup check: ${startupCaps.modeLabel}`);
  console.log(
    `[YTClip API] Runtime details: python=${startupCaps.pythonPath} | ffmpeg=${startupCaps.ffmpegAvailable} | faster-whisper=${startupCaps.fasterWhisperAvailable} | opencv=${startupCaps.opencvAvailable} | model=${startupCaps.whisperModelName} (cached=${startupCaps.whisperModelReady})`
  );
  if (!startupCaps.readyForAiProcessing) {
    console.warn(
      `[YTClip API] Missing Python AI packages: ${(startupCaps.missingDependencies ?? []).join(', ')}`
    );
  }

  if (cfg.embeddedWorker) {
    console.log('[YTClip API] EMBEDDED_WORKER enabled — running background queue inside API process.');
    startEmbeddedWorkerLoop('api-embedded');
  } else {
    console.log('[YTClip API] EMBEDDED_WORKER=false — background jobs will be processed by worker.ts.');
  }

  app.listen(cfg.port, '0.0.0.0', () => {
    console.log(`YTClip server running on http://0.0.0.0:${cfg.port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start YTClip server:', err);
  process.exit(1);
});
