import {
  ClipSettings,
  EngineCapabilities,
  GeneratedClip,
  Highlight,
  ProcessingJob,
  Project,
  SourceVideo,
  ValidationResult,
} from '../types/video';
import type { VideoProcessingAdapter } from './videoProcessingService';

const WORKSPACE_TOKEN_KEY = 'ytclip_workspace_id';

export function getOrCreateWorkspaceToken(): string {
  try {
    const existing = localStorage.getItem(WORKSPACE_TOKEN_KEY);
    if (existing && /^[a-zA-Z0-9_-]{16,128}$/.test(existing)) {
      return existing;
    }
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `ws-${crypto.randomUUID()}`
        : `ws-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
    localStorage.setItem(WORKSPACE_TOKEN_KEY, generated);
    return generated;
  } catch {
    return `ws-session-${Date.now()}`;
  }
}

/**
 * Production & Local Backend API Adapter for YTClip
 * Connects to server.ts (Express + SQLite Queue + Worker + FFmpeg + Python faster-whisper / OpenCV).
 */
export class BackendApiAdapter implements VideoProcessingAdapter {
  private baseUrl: string;
  private apiOrigin: string;
  private sourceObjectUrls = new Map<string, string>();

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    if (/^https?:\/\//i.test(this.baseUrl)) {
      try {
        this.apiOrigin = new URL(this.baseUrl).origin;
      } catch {
        this.apiOrigin = '';
      }
    } else {
      this.apiOrigin = '';
    }
  }

  private resolveUrl(url?: string): string | undefined {
    if (!url) return url;
    if (/^https?:\/\//i.test(url) || url.startsWith('blob:') || url.startsWith('data:')) {
      return url;
    }
    if (this.apiOrigin && url.startsWith('/api/')) {
      return `${this.apiOrigin}${url}`;
    }
    return url;
  }

  private mapSourceUrls(source: Omit<SourceVideo, 'objectUrl'>): Omit<SourceVideo, 'objectUrl'> {
    return {
      ...source,
      streamUrl: this.resolveUrl(source.streamUrl),
      posterUrl: this.resolveUrl(source.posterUrl),
    };
  }

  private mapProjectUrls(project: Project): Project {
    return {
      ...project,
      sourceVideo: this.mapSourceUrls(project.sourceVideo),
    };
  }

  private mapClipUrls(clip: GeneratedClip): GeneratedClip {
    return {
      ...clip,
      previewImageUrl: this.resolveUrl(clip.previewImageUrl) || clip.previewImageUrl,
      renderedUrl: this.resolveUrl(clip.renderedUrl),
    };
  }

  registerSourceObjectUrl(sourceVideoId: string, objectUrl: string): void {
    this.sourceObjectUrls.set(sourceVideoId, objectUrl);
  }

  getSourceObjectUrl(sourceVideoId: string): string | undefined {
    return this.sourceObjectUrls.get(sourceVideoId);
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = getOrCreateWorkspaceToken();
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'X-Workspace-Token': token,
        ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...init?.headers,
      },
    });
    if (!response.ok) {
      let errorMsg = response.statusText;
      const rawText = await response.text().catch(() => '');
      if (rawText) {
        try {
          const parsed = JSON.parse(rawText) as { error?: string };
          errorMsg = parsed.error || rawText;
        } catch {
          errorMsg = rawText;
        }
      }
      throw new Error(`YTClip API error (${response.status}): ${errorMsg}`);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return response.json() as Promise<T>;
  }

  async getCapabilities(): Promise<EngineCapabilities> {
    try {
      return await this.request<EngineCapabilities>('/health');
    } catch {
      return {
        backendOnline: false,
        ffmpegAvailable: false,
        ffprobeAvailable: false,
        fasterWhisperAvailable: false,
        opencvAvailable: false,
        readyForAiProcessing: false,
        modeLabel: 'Browser Demo Mode (Backend offline)',
      };
    }
  }

  async validateVideo(file: File, maxFileSizeMb = 500): Promise<ValidationResult> {
    return this.request<ValidationResult>('/videos/validate', {
      method: 'POST',
      body: JSON.stringify({
        filename: file.name,
        sizeBytes: file.size,
        mimeType: file.type,
        maxFileSizeMb,
      }),
    });
  }

  async uploadVideo(file: File, onProgress?: (percent: number) => void): Promise<SourceVideo> {
    const localUrl = URL.createObjectURL(file);
    const token = getOrCreateWorkspaceToken();
    const chunkThresholdBytes = 10 * 1024 * 1024; // Use chunked upload above 10 MB

    if (file.size > chunkThresholdBytes) {
      try {
        const chunkSize = 5 * 1024 * 1024;
        const totalChunks = Math.ceil(file.size / chunkSize);

        const initRes = await this.request<{ uploadId: string }>('/videos/upload/init', {
          method: 'POST',
          body: JSON.stringify({
            filename: file.name,
            mimeType: file.type || 'video/mp4',
            totalSizeBytes: file.size,
            totalChunks,
          }),
        });

        for (let idx = 0; idx < totalChunks; idx++) {
          const start = idx * chunkSize;
          const end = Math.min(file.size, start + chunkSize);
          const slice = file.slice(start, end);

          const form = new FormData();
          form.append('chunk', slice, `chunk-${idx}.part`);

          const chunkResp = await fetch(
            `${this.baseUrl}/videos/upload/chunk?uploadId=${encodeURIComponent(initRes.uploadId)}&chunkIndex=${idx}`,
            {
              method: 'PUT',
              headers: {
                'X-Workspace-Token': token,
              },
              body: form,
            }
          );

          if (!chunkResp.ok) {
            const errTxt = await chunkResp.text().catch(() => chunkResp.statusText);
            throw new Error(`Chunk ${idx + 1}/${totalChunks} upload failed: ${errTxt}`);
          }

          onProgress?.(Math.min(95, Math.round(((idx + 1) / totalChunks) * 95)));
        }

        const completed = await this.request<Omit<SourceVideo, 'objectUrl'>>(
          '/videos/upload/complete',
          {
            method: 'POST',
            body: JSON.stringify({ uploadId: initRes.uploadId }),
          }
        );

        onProgress?.(100);
        const mapped = this.mapSourceUrls(completed);
        this.registerSourceObjectUrl(mapped.id, localUrl);
        return { ...mapped, objectUrl: localUrl };
      } catch (err) {
        URL.revokeObjectURL(localUrl);
        throw err;
      }
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${this.baseUrl}/videos/upload`);
      xhr.setRequestHeader('X-Workspace-Token', token);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress?.(Math.round((event.loaded / event.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const parsed = this.mapSourceUrls(JSON.parse(xhr.responseText) as SourceVideo);
          this.registerSourceObjectUrl(parsed.id, localUrl);
          resolve({ ...parsed, objectUrl: localUrl });
        } else {
          URL.revokeObjectURL(localUrl);
          reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText || xhr.statusText}`));
        }
      };

      xhr.onerror = () => {
        URL.revokeObjectURL(localUrl);
        reject(new Error('Network error while uploading video to YTClip backend.'));
      };

      const formData = new FormData();
      formData.append('video', file);
      xhr.send(formData);
    });
  }

  async createProject(
    title: string,
    sourceVideo: SourceVideo,
    clipSettings: ClipSettings
  ): Promise<Project> {
    const { objectUrl: _omit, ...storableSource } = sourceVideo;
    const project = await this.request<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify({ title, sourceVideo: storableSource, clipSettings }),
    });
    return this.mapProjectUrls(project);
  }

  async startProcessing(projectId: string): Promise<ProcessingJob> {
    return this.request<ProcessingJob>(`/projects/${projectId}/process`, {
      method: 'POST',
    });
  }

  async getLatestProjectJob(projectId: string): Promise<ProcessingJob | null> {
    return this.request<ProcessingJob | null>(`/projects/${projectId}/job`);
  }

  async getProcessingStatus(jobId: string): Promise<ProcessingJob> {
    return this.request<ProcessingJob>(`/jobs/${jobId}`);
  }

  async cancelProcessing(jobId: string): Promise<ProcessingJob> {
    return this.request<ProcessingJob>(`/jobs/${jobId}/cancel`, {
      method: 'POST',
    });
  }

  async getGeneratedClips(projectId: string): Promise<GeneratedClip[]> {
    const clips = await this.request<GeneratedClip[]>(`/projects/${projectId}/clips`);
    return clips.map((c) => this.mapClipUrls(c));
  }

  async getClipById(clipId: string): Promise<GeneratedClip | null> {
    const clip = await this.request<GeneratedClip | null>(`/clips/${clipId}`);
    return clip ? this.mapClipUrls(clip) : null;
  }

  async updateClip(clipId: string, updates: Partial<GeneratedClip>): Promise<GeneratedClip> {
    const clip = await this.request<GeneratedClip>(`/clips/${clipId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    return this.mapClipUrls(clip);
  }

  async retrackClip(clipId: string): Promise<GeneratedClip> {
    const clip = await this.request<GeneratedClip>(`/clips/${clipId}/retrack`, {
      method: 'POST',
    });
    return this.mapClipUrls(clip);
  }

  async renderClip(clipId: string): Promise<{ renderedUrl: string; filename: string }> {
    const res = await this.request<{ renderedUrl: string; filename: string }>(
      `/clips/${clipId}/render`,
      {
        method: 'POST',
      }
    );
    return {
      renderedUrl: this.resolveUrl(res.renderedUrl) || res.renderedUrl,
      filename: res.filename,
    };
  }

  async downloadClip(clipId: string): Promise<void> {
    const { renderedUrl, filename } = await this.renderClip(clipId);
    const link = document.createElement('a');
    link.href = renderedUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async deleteClip(clipId: string): Promise<void> {
    await this.request<void>(`/clips/${clipId}`, { method: 'DELETE' });
  }

  async getProjects(): Promise<Project[]> {
    const list = await this.request<Project[]>('/projects');
    return list.map((p) => this.mapProjectUrls(p));
  }

  async getProjectById(projectId: string): Promise<Project | null> {
    const proj = await this.request<Project | null>(`/projects/${projectId}`);
    return proj ? this.mapProjectUrls(proj) : null;
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.request<void>(`/projects/${projectId}`, { method: 'DELETE' });
  }

  async getHighlights(projectId: string): Promise<Highlight[]> {
    return this.request<Highlight[]>(`/projects/${projectId}/highlights`);
  }

  async toggleHighlightSelection(highlightId: string, selected: boolean): Promise<Highlight> {
    return this.request<Highlight>(`/highlights/${highlightId}`, {
      method: 'PATCH',
      body: JSON.stringify({ selected }),
    });
  }

  async generateClipsFromHighlights(projectId: string): Promise<GeneratedClip[]> {
    const clips = await this.request<GeneratedClip[]>(
      `/projects/${projectId}/clips/from-highlights`,
      {
        method: 'POST',
      }
    );
    return clips.map((c) => this.mapClipUrls(c));
  }
}
