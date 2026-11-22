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
import { BackendApiAdapter } from './apiAdapter';
import { MockDemoAdapter } from './mockDemoAdapter';

export interface VideoProcessingAdapter {
  getCapabilities(): Promise<EngineCapabilities>;
  uploadVideo(file: File, onProgress?: (percent: number) => void): Promise<SourceVideo>;
  validateVideo(file: File, maxFileSizeMb?: number): Promise<ValidationResult>;
  createProject(title: string, sourceVideo: SourceVideo, clipSettings: ClipSettings): Promise<Project>;
  startProcessing(projectId: string): Promise<ProcessingJob>;
  getLatestProjectJob?(projectId: string): Promise<ProcessingJob | null>;
  getProcessingStatus(jobId: string): Promise<ProcessingJob>;
  getGeneratedClips(projectId: string): Promise<GeneratedClip[]>;
  getClipById(clipId: string): Promise<GeneratedClip | null>;
  updateClip(clipId: string, updates: Partial<GeneratedClip>): Promise<GeneratedClip>;
  retrackClip(clipId: string): Promise<GeneratedClip>;
  renderClip(clipId: string): Promise<{ renderedUrl: string; filename: string }>;
  downloadClip(clipId: string): Promise<void>;
  deleteClip(clipId: string): Promise<void>;
  cancelProcessing(jobId: string): Promise<ProcessingJob>;
  getProjects(): Promise<Project[]>;
  getProjectById(projectId: string): Promise<Project | null>;
  deleteProject(projectId: string): Promise<void>;
  getHighlights(projectId: string): Promise<Highlight[]>;
  toggleHighlightSelection(highlightId: string, selected: boolean): Promise<Highlight>;
  generateClipsFromHighlights(projectId: string): Promise<GeneratedClip[]>;
  registerSourceObjectUrl(sourceVideoId: string, objectUrl: string): void;
  getSourceObjectUrl(sourceVideoId: string): string | undefined;
}

const configuredApiUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
const apiAdapter = new BackendApiAdapter(configuredApiUrl || '/api');
const demoAdapter = new MockDemoAdapter();

function isDemoId(id: string): boolean {
  return (
    id.startsWith('demo-') ||
    id.startsWith('proj-demo-') ||
    id.startsWith('clip-demo-') ||
    id.startsWith('hl-demo-') ||
    id.startsWith('hl-proj-demo-')
  );
}

class HybridVideoProcessingService implements VideoProcessingAdapter {
  private backendAvailable: boolean | null = null;

  private async isBackendUp(): Promise<boolean> {
    if (this.backendAvailable !== null) return this.backendAvailable;
    const caps = await apiAdapter.getCapabilities();
    this.backendAvailable = caps.backendOnline && caps.ffmpegAvailable;
    return this.backendAvailable;
  }

  async getCapabilities(): Promise<EngineCapabilities> {
    const caps = await apiAdapter.getCapabilities();
    this.backendAvailable = caps.backendOnline && caps.ffmpegAvailable;
    return caps;
  }

  registerSourceObjectUrl(sourceVideoId: string, objectUrl: string): void {
    apiAdapter.registerSourceObjectUrl(sourceVideoId, objectUrl);
    demoAdapter.registerSourceObjectUrl(sourceVideoId, objectUrl);
  }

  getSourceObjectUrl(sourceVideoId: string): string | undefined {
    return apiAdapter.getSourceObjectUrl(sourceVideoId) ?? demoAdapter.getSourceObjectUrl(sourceVideoId);
  }

  async validateVideo(file: File, maxFileSizeMb?: number): Promise<ValidationResult> {
    // Always run local browser codec/duration check, plus server check if online
    const localRes = await demoAdapter.validateVideo(file, maxFileSizeMb);
    if (!localRes.valid) return localRes;
    if (await this.isBackendUp()) {
      const serverRes = await apiAdapter.validateVideo(file, maxFileSizeMb);
      if (!serverRes.valid) return serverRes;
    }
    return localRes;
  }

  async uploadVideo(file: File, onProgress?: (percent: number) => void): Promise<SourceVideo> {
    if (await this.isBackendUp()) {
      return apiAdapter.uploadVideo(file, onProgress);
    }
    return demoAdapter.uploadVideo(file, onProgress);
  }

  async createProject(
    title: string,
    sourceVideo: SourceVideo,
    clipSettings: ClipSettings
  ): Promise<Project> {
    if (!sourceVideo.isDemoSample && (await this.isBackendUp())) {
      return apiAdapter.createProject(title, sourceVideo, clipSettings);
    }
    return demoAdapter.createProject(title, sourceVideo, clipSettings);
  }

  async startProcessing(projectId: string): Promise<ProcessingJob> {
    if (!isDemoId(projectId) && (await this.isBackendUp())) {
      return apiAdapter.startProcessing(projectId);
    }
    return demoAdapter.startProcessing(projectId);
  }

  async getLatestProjectJob(projectId: string): Promise<ProcessingJob | null> {
    if (!isDemoId(projectId) && (await this.isBackendUp())) {
      return apiAdapter.getLatestProjectJob(projectId);
    }
    return null;
  }

  async getProcessingStatus(jobId: string): Promise<ProcessingJob> {
    try {
      return await demoAdapter.getProcessingStatus(jobId);
    } catch {
      return apiAdapter.getProcessingStatus(jobId);
    }
  }

  async cancelProcessing(jobId: string): Promise<ProcessingJob> {
    try {
      return await demoAdapter.cancelProcessing(jobId);
    } catch {
      return apiAdapter.cancelProcessing(jobId);
    }
  }

  async getProjects(): Promise<Project[]> {
    const localProjects = await demoAdapter.getProjects();
    if (await this.isBackendUp()) {
      const serverProjects = await apiAdapter.getProjects();
      const map = new Map<string, Project>();
      for (const p of serverProjects) map.set(p.id, p);
      for (const p of localProjects) {
        if (!map.has(p.id)) map.set(p.id, p);
      }
      return Array.from(map.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }
    return localProjects;
  }

  async getProjectById(projectId: string): Promise<Project | null> {
    if (!isDemoId(projectId) && (await this.isBackendUp())) {
      const serverProj = await apiAdapter.getProjectById(projectId);
      if (serverProj) return serverProj;
    }
    return demoAdapter.getProjectById(projectId);
  }

  async deleteProject(projectId: string): Promise<void> {
    if (!isDemoId(projectId) && (await this.isBackendUp())) {
      await apiAdapter.deleteProject(projectId);
    }
    await demoAdapter.deleteProject(projectId);
  }

  async getHighlights(projectId: string): Promise<Highlight[]> {
    if (!isDemoId(projectId) && (await this.isBackendUp())) {
      const list = await apiAdapter.getHighlights(projectId);
      if (list.length > 0) return list;
    }
    return demoAdapter.getHighlights(projectId);
  }

  async toggleHighlightSelection(highlightId: string, selected: boolean): Promise<Highlight> {
    if (!isDemoId(highlightId) && (await this.isBackendUp())) {
      return apiAdapter.toggleHighlightSelection(highlightId, selected);
    }
    return demoAdapter.toggleHighlightSelection(highlightId, selected);
  }

  async generateClipsFromHighlights(projectId: string): Promise<GeneratedClip[]> {
    if (!isDemoId(projectId) && (await this.isBackendUp())) {
      return apiAdapter.generateClipsFromHighlights(projectId);
    }
    return demoAdapter.generateClipsFromHighlights(projectId);
  }

  async getGeneratedClips(projectId: string): Promise<GeneratedClip[]> {
    if (!isDemoId(projectId) && (await this.isBackendUp())) {
      const list = await apiAdapter.getGeneratedClips(projectId);
      if (list.length > 0) return list;
    }
    return demoAdapter.getGeneratedClips(projectId);
  }

  async getClipById(clipId: string): Promise<GeneratedClip | null> {
    if (!isDemoId(clipId) && (await this.isBackendUp())) {
      const clip = await apiAdapter.getClipById(clipId);
      if (clip) return clip;
    }
    return demoAdapter.getClipById(clipId);
  }

  async updateClip(clipId: string, updates: Partial<GeneratedClip>): Promise<GeneratedClip> {
    if (!isDemoId(clipId) && (await this.isBackendUp())) {
      return apiAdapter.updateClip(clipId, updates);
    }
    return demoAdapter.updateClip(clipId, updates);
  }

  async retrackClip(clipId: string): Promise<GeneratedClip> {
    if (!isDemoId(clipId) && (await this.isBackendUp())) {
      return apiAdapter.retrackClip(clipId);
    }
    return demoAdapter.retrackClip(clipId);
  }

  async renderClip(clipId: string): Promise<{ renderedUrl: string; filename: string }> {
    if (!isDemoId(clipId) && (await this.isBackendUp())) {
      return apiAdapter.renderClip(clipId);
    }
    return demoAdapter.renderClip(clipId);
  }

  async downloadClip(clipId: string): Promise<void> {
    if (!isDemoId(clipId) && (await this.isBackendUp())) {
      return apiAdapter.downloadClip(clipId);
    }
    return demoAdapter.downloadClip(clipId);
  }

  async deleteClip(clipId: string): Promise<void> {
    if (!isDemoId(clipId) && (await this.isBackendUp())) {
      return apiAdapter.deleteClip(clipId);
    }
    return demoAdapter.deleteClip(clipId);
  }
}

export const videoProcessingService: VideoProcessingAdapter = new HybridVideoProcessingService();
