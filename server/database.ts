import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  GeneratedClip,
  Highlight,
  ProcessingJob,
  Project,
  TranscriptSegment,
} from '../src/types/video';
import { ensureStorageDirectories, getServerConfig, resolveConfinedPath } from './config';

export interface UploadSessionRow {
  id: string;
  workspaceId: string;
  filename: string;
  mimeType: string;
  totalSizeBytes: number;
  totalChunks: number;
  receivedChunks: number;
  status: 'uploading' | 'completed' | 'aborted';
  createdAt: string;
}

export interface JobRecord extends ProcessingJob {
  workspaceId: string;
  attempts: number;
  maxAttempts: number;
  errorLog?: string;
  workerId?: string;
  lockedAt?: string;
}

class YTClipDatabase {
  private db: DatabaseSync;

  constructor() {
    const cfg = getServerConfig();
    ensureStorageDirectories(cfg);
    this.db = new DatabaseSync(cfg.dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA busy_timeout = 5000;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        title TEXT NOT NULL,
        source_video_json TEXT NOT NULL,
        clip_settings_json TEXT NOT NULL,
        status TEXT NOT NULL,
        clip_count INTEGER NOT NULL DEFAULT 0,
        is_demo_mode INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS transcripts (
        project_id TEXT PRIMARY KEY,
        engine TEXT NOT NULL,
        segments_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS highlights (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        data_json TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_highlights_project ON highlights(project_id, sort_order);

      CREATE TABLE IF NOT EXISTS clips (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        data_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_clips_project ON clips(project_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        status TEXT NOT NULL,
        current_stage TEXT NOT NULL,
        progress INTEGER NOT NULL DEFAULT 0,
        message TEXT NOT NULL,
        error_details TEXT,
        error_log TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 1,
        is_demo_mode INTEGER NOT NULL DEFAULT 0,
        can_cancel INTEGER NOT NULL DEFAULT 1,
        worker_id TEXT,
        locked_at TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, started_at ASC);
      CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id, started_at DESC);

      CREATE TABLE IF NOT EXISTS upload_sessions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        total_size_bytes INTEGER NOT NULL,
        total_chunks INTEGER NOT NULL,
        received_chunks_json TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  // ---- Projects ----
  createProject(workspaceId: string, project: Project): void {
    const stmt = this.db.prepare(`
      INSERT INTO projects (
        id, workspace_id, title, source_video_json, clip_settings_json,
        status, clip_count, is_demo_mode, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      project.id,
      workspaceId,
      project.title,
      JSON.stringify(project.sourceVideo),
      JSON.stringify(project.clipSettings),
      project.status,
      project.clipCount,
      project.isDemoMode ? 1 : 0,
      project.createdAt,
      project.updatedAt
    );
  }

  listProjects(workspaceId: string): Project[] {
    const rows = this.db
      .prepare('SELECT * FROM projects WHERE workspace_id = ? ORDER BY created_at DESC')
      .all(workspaceId) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapProjectRow(r));
  }

  getProject(projectId: string, workspaceId?: string): (Project & { workspaceId: string }) | null {
    const row = (
      workspaceId
        ? this.db
            .prepare('SELECT * FROM projects WHERE id = ? AND workspace_id = ?')
            .get(projectId, workspaceId)
        : this.db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId)
    ) as Record<string, unknown> | undefined;

    if (!row) return null;
    return {
      ...this.mapProjectRow(row),
      workspaceId: String(row.workspace_id),
    };
  }

  updateProjectStatus(projectId: string, status: Project['status'], clipCount?: number): void {
    const now = new Date().toISOString();
    if (typeof clipCount === 'number') {
      this.db
        .prepare('UPDATE projects SET status = ?, clip_count = ?, updated_at = ? WHERE id = ?')
        .run(status, clipCount, now, projectId);
    } else {
      this.db
        .prepare('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?')
        .run(status, now, projectId);
    }
  }

  deleteProject(projectId: string, workspaceId: string): boolean {
    const info = this.db
      .prepare('DELETE FROM projects WHERE id = ? AND workspace_id = ?')
      .run(projectId, workspaceId);
    return Number(info.changes) > 0;
  }

  getWorkspaceStorageBytes(workspaceId: string): number {
    const rows = this.db
      .prepare('SELECT source_video_json FROM projects WHERE workspace_id = ?')
      .all(workspaceId) as Array<{ source_video_json: string }>;
    let total = 0;
    for (const row of rows) {
      try {
        const src = JSON.parse(row.source_video_json) as { fileSizeBytes?: number };
        total += src.fileSizeBytes || 0;
      } catch {
        // ignore
      }
    }
    return total;
  }

  private mapProjectRow(row: Record<string, unknown>): Project {
    return {
      id: String(row.id),
      title: String(row.title),
      sourceVideo: JSON.parse(String(row.source_video_json)),
      clipSettings: JSON.parse(String(row.clip_settings_json)),
      status: String(row.status) as Project['status'],
      clipCount: Number(row.clip_count),
      isDemoMode: Boolean(row.is_demo_mode),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  // ---- Transcripts ----
  saveTranscript(projectId: string, engine: string, segments: TranscriptSegment[]): void {
    this.db
      .prepare(
        `INSERT INTO transcripts (project_id, engine, segments_json, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(project_id) DO UPDATE SET
           engine = excluded.engine,
           segments_json = excluded.segments_json,
           updated_at = excluded.updated_at`
      )
      .run(projectId, engine, JSON.stringify(segments), new Date().toISOString());
  }

  getTranscript(projectId: string): { engine: string; segments: TranscriptSegment[] } | null {
    const row = this.db
      .prepare('SELECT engine, segments_json FROM transcripts WHERE project_id = ?')
      .get(projectId) as { engine: string; segments_json: string } | undefined;
    if (!row) return null;
    return {
      engine: row.engine,
      segments: JSON.parse(row.segments_json) as TranscriptSegment[],
    };
  }

  // ---- Highlights ----
  replaceHighlights(projectId: string, workspaceId: string, highlights: Highlight[]): void {
    this.db.prepare('DELETE FROM highlights WHERE project_id = ?').run(projectId);
    const ins = this.db.prepare(
      'INSERT INTO highlights (id, project_id, workspace_id, data_json, sort_order) VALUES (?, ?, ?, ?, ?)'
    );
    highlights.forEach((h, idx) => {
      ins.run(h.id, projectId, workspaceId, JSON.stringify(h), idx);
    });
  }

  listHighlights(projectId: string, workspaceId: string): Highlight[] {
    const rows = this.db
      .prepare('SELECT data_json FROM highlights WHERE project_id = ? AND workspace_id = ? ORDER BY sort_order ASC')
      .all(projectId, workspaceId) as Array<{ data_json: string }>;
    return rows.map((r) => JSON.parse(r.data_json) as Highlight);
  }

  toggleHighlight(highlightId: string, workspaceId: string, selected: boolean): Highlight | null {
    const row = this.db
      .prepare('SELECT data_json FROM highlights WHERE id = ? AND workspace_id = ?')
      .get(highlightId, workspaceId) as { data_json: string } | undefined;
    if (!row) return null;
    const hl = JSON.parse(row.data_json) as Highlight;
    const updated = { ...hl, selected };
    this.db
      .prepare('UPDATE highlights SET data_json = ? WHERE id = ? AND workspace_id = ?')
      .run(JSON.stringify(updated), highlightId, workspaceId);
    return updated;
  }

  // ---- Clips ----
  replaceProjectClips(projectId: string, workspaceId: string, clips: GeneratedClip[]): void {
    this.db.prepare('DELETE FROM clips WHERE project_id = ?').run(projectId);
    const ins = this.db.prepare(
      'INSERT INTO clips (id, project_id, workspace_id, data_json, updated_at) VALUES (?, ?, ?, ?, ?)'
    );
    for (const c of clips) {
      ins.run(c.id, projectId, workspaceId, JSON.stringify(c), c.updatedAt);
    }
  }

  listClips(projectId: string, workspaceId: string): GeneratedClip[] {
    const rows = this.db
      .prepare('SELECT data_json FROM clips WHERE project_id = ? AND workspace_id = ? ORDER BY updated_at DESC')
      .all(projectId, workspaceId) as Array<{ data_json: string }>;
    return rows.map((r) => JSON.parse(r.data_json) as GeneratedClip);
  }

  getClip(clipId: string, workspaceId?: string): (GeneratedClip & { workspaceId: string }) | null {
    const row = (
      workspaceId
        ? this.db
            .prepare('SELECT data_json, workspace_id FROM clips WHERE id = ? AND workspace_id = ?')
            .get(clipId, workspaceId)
        : this.db.prepare('SELECT data_json, workspace_id FROM clips WHERE id = ?').get(clipId)
    ) as { data_json: string; workspace_id: string } | undefined;
    if (!row) return null;
    return {
      ...(JSON.parse(row.data_json) as GeneratedClip),
      workspaceId: row.workspace_id,
    };
  }

  saveClip(workspaceId: string, clip: GeneratedClip): void {
    this.db
      .prepare(
        `INSERT INTO clips (id, project_id, workspace_id, data_json, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           data_json = excluded.data_json,
           updated_at = excluded.updated_at`
      )
      .run(clip.id, clip.projectId, workspaceId, JSON.stringify(clip), clip.updatedAt);
  }

  deleteClip(clipId: string, workspaceId: string): { deleted: boolean; projectId?: string } {
    const existing = this.getClip(clipId, workspaceId);
    if (!existing) return { deleted: false };
    this.db.prepare('DELETE FROM clips WHERE id = ? AND workspace_id = ?').run(clipId, workspaceId);
    const countRow = this.db
      .prepare('SELECT COUNT(*) as cnt FROM clips WHERE project_id = ?')
      .get(existing.projectId) as { cnt: number };
    this.updateProjectStatus(existing.projectId, 'completed', Number(countRow.cnt));
    return { deleted: true, projectId: existing.projectId };
  }

  // ---- Jobs Queue ----
  enqueueJob(job: JobRecord): void {
    this.db
      .prepare(
        `INSERT INTO jobs (
          id, project_id, workspace_id, status, current_stage, progress, message,
          error_details, error_log, attempts, max_attempts, is_demo_mode, can_cancel,
          worker_id, locked_at, started_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        job.id,
        job.projectId,
        job.workspaceId,
        job.status,
        job.currentStage,
        job.progress,
        job.message,
        job.errorDetails ?? null,
        job.errorLog ?? null,
        job.attempts,
        job.maxAttempts,
        job.isDemoMode ? 1 : 0,
        job.canCancel ? 1 : 0,
        job.workerId ?? null,
        job.lockedAt ?? null,
        job.startedAt,
        job.completedAt ?? null
      );
  }

  getJob(jobId: string, workspaceId?: string): JobRecord | null {
    const row = (
      workspaceId
        ? this.db
            .prepare('SELECT * FROM jobs WHERE id = ? AND workspace_id = ?')
            .get(jobId, workspaceId)
        : this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId)
    ) as Record<string, unknown> | undefined;
    return row ? this.mapJobRow(row) : null;
  }

  getLatestJobForProject(projectId: string, workspaceId: string): JobRecord | null {
    const row = this.db
      .prepare(
        'SELECT * FROM jobs WHERE project_id = ? AND workspace_id = ? ORDER BY started_at DESC LIMIT 1'
      )
      .get(projectId, workspaceId) as Record<string, unknown> | undefined;
    return row ? this.mapJobRow(row) : null;
  }

  updateJob(jobId: string, patch: Partial<JobRecord>): void {
    const existing = this.getJob(jobId);
    if (!existing) return;
    const next = { ...existing, ...patch };
    this.db
      .prepare(
        `UPDATE jobs SET
          status = ?, current_stage = ?, progress = ?, message = ?,
          error_details = ?, error_log = ?, attempts = ?, can_cancel = ?,
          worker_id = ?, locked_at = ?, completed_at = ?
         WHERE id = ?`
      )
      .run(
        next.status,
        next.currentStage,
        next.progress,
        next.message,
        next.errorDetails ?? null,
        next.errorLog ?? null,
        next.attempts,
        next.canCancel ? 1 : 0,
        next.workerId ?? null,
        next.lockedAt ?? null,
        next.completedAt ?? null,
        jobId
      );
  }

  countActiveJobs(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as cnt FROM jobs WHERE status = 'processing'")
      .get() as { cnt: number };
    return Number(row.cnt);
  }

  claimNextQueuedJob(workerId: string, maxConcurrentJobs: number): JobRecord | null {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const active = this.countActiveJobs();
      if (active >= maxConcurrentJobs) {
        this.db.exec('COMMIT');
        return null;
      }

      const row = this.db
        .prepare("SELECT * FROM jobs WHERE status = 'queued' ORDER BY started_at ASC LIMIT 1")
        .get() as Record<string, unknown> | undefined;

      if (!row) {
        this.db.exec('COMMIT');
        return null;
      }

      const job = this.mapJobRow(row);
      const now = new Date().toISOString();
      const nextAttempts = job.attempts + 1;

      this.db
        .prepare(
          "UPDATE jobs SET status = 'processing', worker_id = ?, locked_at = ?, attempts = ? WHERE id = ? AND status = 'queued'"
        )
        .run(workerId, now, nextAttempts, job.id);

      this.db.exec('COMMIT');
      return {
        ...job,
        status: 'processing',
        workerId,
        lockedAt: now,
        attempts: nextAttempts,
      };
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  recoverStaleJobs(staleMinutes = 25): number {
    const cutoff = new Date(Date.now() - staleMinutes * 60 * 1000).toISOString();
    const info = this.db
      .prepare(
        `UPDATE jobs
         SET status = CASE WHEN attempts < max_attempts THEN 'queued' ELSE 'error' END,
             error_details = CASE WHEN attempts < max_attempts THEN NULL ELSE 'Worker timed out or restarted unexpectedly.' END,
             worker_id = NULL,
             locked_at = NULL
         WHERE status = 'processing' AND locked_at < ?`
      )
      .run(cutoff);
    return Number(info.changes);
  }

  private mapJobRow(row: Record<string, unknown>): JobRecord {
    return {
      id: String(row.id),
      projectId: String(row.project_id),
      workspaceId: String(row.workspace_id),
      status: String(row.status) as ProcessingJob['status'],
      currentStage: String(row.current_stage) as ProcessingJob['currentStage'],
      progress: Number(row.progress),
      message: String(row.message),
      errorDetails: row.error_details ? String(row.error_details) : undefined,
      errorLog: row.error_log ? String(row.error_log) : undefined,
      attempts: Number(row.attempts),
      maxAttempts: Number(row.max_attempts),
      isDemoMode: Boolean(row.is_demo_mode),
      canCancel: Boolean(row.can_cancel),
      workerId: row.worker_id ? String(row.worker_id) : undefined,
      lockedAt: row.locked_at ? String(row.locked_at) : undefined,
      startedAt: String(row.started_at),
      completedAt: row.completed_at ? String(row.completed_at) : undefined,
    };
  }

  // ---- Chunked Uploads ----
  createUploadSession(session: UploadSessionRow): void {
    this.db
      .prepare(
        `INSERT INTO upload_sessions (
          id, workspace_id, filename, mime_type, total_size_bytes,
          total_chunks, received_chunks_json, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        session.id,
        session.workspaceId,
        session.filename,
        session.mimeType,
        session.totalSizeBytes,
        session.totalChunks,
        JSON.stringify([]),
        session.status,
        session.createdAt
      );
  }

  getUploadSession(uploadId: string, workspaceId: string): (UploadSessionRow & { receivedList: number[] }) | null {
    const row = this.db
      .prepare('SELECT * FROM upload_sessions WHERE id = ? AND workspace_id = ?')
      .get(uploadId, workspaceId) as Record<string, unknown> | undefined;
    if (!row) return null;
    const receivedList = JSON.parse(String(row.received_chunks_json)) as number[];
    return {
      id: String(row.id),
      workspaceId: String(row.workspace_id),
      filename: String(row.filename),
      mimeType: String(row.mime_type),
      totalSizeBytes: Number(row.total_size_bytes),
      totalChunks: Number(row.total_chunks),
      receivedChunks: receivedList.length,
      receivedList,
      status: String(row.status) as UploadSessionRow['status'],
      createdAt: String(row.created_at),
    };
  }

  markUploadChunkReceived(uploadId: string, chunkIndex: number): void {
    const row = this.db
      .prepare('SELECT received_chunks_json FROM upload_sessions WHERE id = ?')
      .get(uploadId) as { received_chunks_json: string } | undefined;
    if (!row) return;
    const list = new Set<number>(JSON.parse(row.received_chunks_json) as number[]);
    list.add(chunkIndex);
    this.db
      .prepare('UPDATE upload_sessions SET received_chunks_json = ? WHERE id = ?')
      .run(JSON.stringify(Array.from(list).sort((a, b) => a - b)), uploadId);
  }

  completeUploadSession(uploadId: string): void {
    this.db
      .prepare("UPDATE upload_sessions SET status = 'completed' WHERE id = ?")
      .run(uploadId);
  }

  // ---- Retention Cleanup ----
  cleanupExpiredProjects(retentionHours: number): number {
    const cfg = getServerConfig();
    const cutoff = new Date(Date.now() - retentionHours * 3600 * 1000).toISOString();
    const expired = this.db
      .prepare('SELECT id, source_video_json FROM projects WHERE updated_at < ?')
      .all(cutoff) as Array<{ id: string; source_video_json: string }>;

    for (const proj of expired) {
      try {
        const src = JSON.parse(proj.source_video_json) as { id?: string };
        if (src.id) {
          const uploadFile = resolveConfinedPath(cfg.uploadsDir, src.id);
          if (fs.existsSync(uploadFile)) fs.unlinkSync(uploadFile);
        }
      } catch {
        // ignore missing files
      }
      const clipRows = this.db
        .prepare('SELECT data_json FROM clips WHERE project_id = ?')
        .all(proj.id) as Array<{ data_json: string }>;
      for (const cr of clipRows) {
        try {
          const c = JSON.parse(cr.data_json) as GeneratedClip;
          if (c.renderedUrl) {
            const mp4 = resolveConfinedPath(cfg.rendersDir, c.renderedUrl.split('/').pop() || '');
            if (fs.existsSync(mp4)) fs.unlinkSync(mp4);
          }
        } catch {
          // ignore
        }
      }
      this.db.prepare('DELETE FROM projects WHERE id = ?').run(proj.id);
    }
    return expired.length;
  }
}

let singletonDb: YTClipDatabase | null = null;

export function getDb(): YTClipDatabase {
  if (!singletonDb) {
    singletonDb = new YTClipDatabase();
  }
  return singletonDb;
}
