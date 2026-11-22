import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface ServerConfig {
  port: number;
  nodeEnv: string;
  corsAllowedOrigins: string[];
  dataRoot: string;
  uploadsDir: string;
  chunksDir: string;
  workDir: string;
  rendersDir: string;
  thumbsDir: string;
  dbPath: string;
  pythonBin: string;
  whisperModel: string;
  modelDir: string;
  mediaSigningSecret: string;
  maxUploadMb: number;
  maxDurationSeconds: number;
  maxConcurrentJobs: number;
  maxJobRetries: number;
  jobTimeoutMs: number;
  maxWorkspaceStorageMb: number;
  storageRetentionHours: number;
  embeddedWorker: boolean;
  requireRealAi: boolean;
}

function resolvePythonBin(): string {
  const explicit = process.env.YTCLIP_PYTHON_BIN?.trim();
  if (explicit) return explicit;

  const venvPython = path.resolve(process.cwd(), '.venv', 'bin', 'python3');
  if (fs.existsSync(venvPython)) {
    return venvPython;
  }
  return 'python3';
}

const ephemeralSecret = crypto.randomBytes(32).toString('hex');

export function getServerConfig(): ServerConfig {
  const dataRoot = path.resolve(process.cwd(), process.env.YTCLIP_DATA_DIR || '.ytclip_data');
  const corsRaw = process.env.CORS_ALLOWED_ORIGINS || '';
  const corsAllowedOrigins = corsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    port: Number(process.env.PORT) || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    corsAllowedOrigins,
    dataRoot,
    uploadsDir: path.join(dataRoot, 'uploads'),
    chunksDir: path.join(dataRoot, 'chunks'),
    workDir: path.join(dataRoot, 'work'),
    rendersDir: path.join(dataRoot, 'renders'),
    thumbsDir: path.join(dataRoot, 'thumbs'),
    dbPath: path.join(dataRoot, 'ytclip.sqlite'),
    pythonBin: resolvePythonBin(),
    whisperModel: process.env.YTCLIP_WHISPER_MODEL || 'base.en',
    modelDir: path.resolve(process.cwd(), process.env.YTCLIP_MODEL_DIR || '.ytclip_models'),
    mediaSigningSecret: process.env.MEDIA_SIGNING_SECRET?.trim() || ephemeralSecret,
    maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || 1024,
    maxDurationSeconds: Number(process.env.MAX_DURATION_SECONDS) || 3600,
    maxConcurrentJobs: Math.max(1, Number(process.env.MAX_CONCURRENT_JOBS) || 2),
    maxJobRetries: Math.max(0, Number(process.env.MAX_JOB_RETRIES) || 1),
    jobTimeoutMs: Math.max(60000, Number(process.env.JOB_TIMEOUT_MS) || 15 * 60 * 1000),
    maxWorkspaceStorageMb: Number(process.env.MAX_WORKSPACE_STORAGE_MB) || 2048,
    storageRetentionHours: Number(process.env.STORAGE_RETENTION_HOURS) || 72,
    embeddedWorker: process.env.EMBEDDED_WORKER !== 'false',
    requireRealAi: process.env.YTCLIP_REQUIRE_REAL_AI !== 'false',
  };
}

export function ensureStorageDirectories(cfg: ServerConfig): void {
  for (const dir of [
    cfg.dataRoot,
    cfg.uploadsDir,
    cfg.chunksDir,
    cfg.workDir,
    cfg.rendersDir,
    cfg.thumbsDir,
    cfg.modelDir,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function resolveConfinedPath(baseDir: string, filename: string): string {
  const safeName = path.basename(filename);
  if (!safeName || safeName === '.' || safeName === '..') {
    throw new Error('Invalid file identifier.');
  }
  const resolved = path.resolve(baseDir, safeName);
  if (!resolved.startsWith(baseDir + path.sep)) {
    throw new Error('Path traversal attempt blocked.');
  }
  return resolved;
}
