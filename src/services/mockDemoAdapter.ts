import {
  buildDemoKeyframes,
  DEMO_STUDIO_POSTER,
  generateClipsFromHighlightList,
  generateDemoHighlightsForVideo,
} from '../data/demoSamples';
import {
  ClipSettings,
  EngineCapabilities,
  GeneratedClip,
  Highlight,
  ProcessingJob,
  ProcessingStage,
  Project,
  SourceVideo,
  ValidationResult,
} from '../types/video';
import { probeVideoMetadata, renderDemoClipToBlob } from '../utils/formatters';
import {
  loadClips,
  loadHighlights,
  loadProjects,
  saveClips,
  saveHighlights,
  saveProjects,
} from './storageService';
import type { VideoProcessingAdapter } from './videoProcessingService';

const MAX_DURATION_SECONDS = 60 * 60;
const ALLOWED_EXTENSIONS = ['.mp4', '.mov', '.webm'];
const ALLOWED_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

const STAGE_SEQUENCE: Array<{
  stage: ProcessingStage;
  progress: number;
  message: string;
}> = [
  { stage: 'validating', progress: 10, message: '1/10 Demo: Validating source video...' },
  { stage: 'extracting_audio', progress: 20, message: '2/10 Demo: Simulating audio extraction...' },
  { stage: 'transcribing', progress: 34, message: '3/10 Demo: Generating sample word-level transcript...' },
  { stage: 'analyzing_highlights', progress: 48, message: '4/10 Demo: Analyzing hooks & audio energy...' },
  { stage: 'generating_candidates', progress: 58, message: '5/10 Demo: Selecting candidate clips...' },
  { stage: 'tracking_speaker', progress: 68, message: '6/10 Demo: Simulating speaker face tracking...' },
  { stage: 'generating_keyframes', progress: 78, message: '7/10 Demo: Generating crop keyframes...' },
  { stage: 'generating_captions', progress: 86, message: '8/10 Demo: Formatting animated captions...' },
  { stage: 'rendering_clips', progress: 94, message: '9/10 Demo: Preparing sample video previews...' },
  { stage: 'saving_metadata', progress: 100, message: '10/10 Demo: Saved sample clips & metadata.' },
];

export class MockDemoAdapter implements VideoProcessingAdapter {
  private jobs = new Map<string, ProcessingJob>();
  private jobTimers = new Map<string, number>();
  private sourceObjectUrls = new Map<string, string>();

  async getCapabilities(): Promise<EngineCapabilities> {
    return {
      backendOnline: false,
      ffmpegAvailable: false,
      ffprobeAvailable: false,
      fasterWhisperAvailable: false,
      opencvAvailable: false,
      modeLabel: 'Browser Demo Mode',
    };
  }

  registerSourceObjectUrl(sourceVideoId: string, objectUrl: string): void {
    const existing = this.sourceObjectUrls.get(sourceVideoId);
    if (existing && existing !== objectUrl) {
      URL.revokeObjectURL(existing);
    }
    this.sourceObjectUrls.set(sourceVideoId, objectUrl);
  }

  getSourceObjectUrl(sourceVideoId: string): string | undefined {
    return this.sourceObjectUrls.get(sourceVideoId);
  }

  async validateVideo(file: File, maxFileSizeMb = 500): Promise<ValidationResult> {
    const lowerName = file.name.toLowerCase();
    const hasValidExt = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    const hasValidMime = ALLOWED_MIME_TYPES.includes(file.type) || file.type === '';

    if (!hasValidExt || !hasValidMime) {
      return {
        valid: false,
        error: 'Unsupported format. Upload an MP4, MOV, or WebM video file.',
      };
    }

    const maxBytes = maxFileSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      return {
        valid: false,
        error: `File exceeds the configured ${maxFileSizeMb} MB limit. Increase the limit or compress the video.`,
      };
    }

    try {
      const meta = await probeVideoMetadata(file);
      if (meta.durationSeconds <= 0) {
        URL.revokeObjectURL(meta.objectUrl);
        return {
          valid: false,
          error: 'Video duration could not be determined or is 0 seconds.',
        };
      }
      if (meta.durationSeconds > MAX_DURATION_SECONDS) {
        URL.revokeObjectURL(meta.objectUrl);
        return {
          valid: false,
          error: 'Video exceeds the 60-minute maximum duration limit.',
        };
      }

      URL.revokeObjectURL(meta.objectUrl);
      return {
        valid: true,
        detectedMeta: {
          durationSeconds: meta.durationSeconds,
          width: meta.width,
          height: meta.height,
        },
      };
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : 'Unable to validate video file.',
      };
    }
  }

  async uploadVideo(file: File, onProgress?: (percent: number) => void): Promise<SourceVideo> {
    const meta = await probeVideoMetadata(file);
    for (const pct of [25, 60, 100]) {
      onProgress?.(pct);
      await new Promise((r) => setTimeout(r, 90));
    }
    const id = `src-${Date.now()}`;
    this.registerSourceObjectUrl(id, meta.objectUrl);

    return {
      id,
      filename: file.name,
      fileSizeBytes: file.size,
      mimeType: file.type || 'video/mp4',
      durationSeconds: meta.durationSeconds,
      width: meta.width,
      height: meta.height,
      isDemoSample: false,
      objectUrl: meta.objectUrl,
      posterUrl: DEMO_STUDIO_POSTER,
      uploadedAt: new Date().toISOString(),
    };
  }

  async createProject(
    title: string,
    sourceVideo: SourceVideo,
    clipSettings: ClipSettings
  ): Promise<Project> {
    const now = new Date().toISOString();
    const { objectUrl: _omit, ...storableSource } = sourceVideo;

    if (sourceVideo.objectUrl) {
      this.registerSourceObjectUrl(sourceVideo.id, sourceVideo.objectUrl);
    }

    const project: Project = {
      id: `proj-demo-${Date.now()}`,
      title: title.trim() || sourceVideo.filename.replace(/\.[^/.]+$/, ''),
      sourceVideo: storableSource,
      clipSettings,
      status: 'queued',
      clipCount: 0,
      isDemoMode: true,
      createdAt: now,
      updatedAt: now,
    };

    saveProjects([project, ...loadProjects()]);
    return project;
  }

  async startProcessing(projectId: string): Promise<ProcessingJob> {
    const projects = loadProjects();
    const project = projects.find((p) => p.id === projectId);
    if (!project) throw new Error('Project not found.');

    const jobId = `job-${Date.now()}`;
    const job: ProcessingJob = {
      id: jobId,
      projectId,
      status: 'processing',
      currentStage: 'validating',
      progress: 5,
      message: '1/10 Demo: Initializing simulated pipeline...',
      isDemoMode: true,
      canCancel: true,
      startedAt: new Date().toISOString(),
    };
    this.jobs.set(jobId, job);

    saveProjects(
      projects.map((p) =>
        p.id === projectId ? { ...p, status: 'processing', updatedAt: new Date().toISOString() } : p
      )
    );

    let stepIndex = 0;
    const advanceStage = () => {
      const current = this.jobs.get(jobId);
      if (!current || current.status === 'cancelled' || current.status === 'error') return;

      if (stepIndex < STAGE_SEQUENCE.length) {
        const step = STAGE_SEQUENCE[stepIndex];
        const updated: ProcessingJob = {
          ...current,
          currentStage: step.stage,
          progress: step.progress,
          message: step.message,
        };
        this.jobs.set(jobId, updated);
        stepIndex += 1;

        if (stepIndex < STAGE_SEQUENCE.length) {
          const timer = window.setTimeout(advanceStage, 380);
          this.jobTimers.set(jobId, timer);
        } else {
          const latestProjects = loadProjects();
          const targetProject = latestProjects.find((p) => p.id === projectId);
          if (targetProject) {
            const highlights = generateDemoHighlightsForVideo(
              projectId,
              targetProject.sourceVideo.durationSeconds,
              targetProject.clipSettings.targetDuration
            );
            const clips = generateClipsFromHighlightList(
              targetProject,
              highlights,
              targetProject.sourceVideo.isDemoSample
            );
            saveHighlights([
              ...highlights,
              ...loadHighlights().filter((h) => h.projectId !== projectId),
            ]);
            saveClips([...clips, ...loadClips().filter((c) => c.projectId !== projectId)]);
            saveProjects(
              latestProjects.map((p) =>
                p.id === projectId
                  ? {
                      ...p,
                      status: 'completed',
                      clipCount: clips.length,
                      updatedAt: new Date().toISOString(),
                    }
                  : p
              )
            );
          }

          this.jobs.set(jobId, {
            ...updated,
            status: 'completed',
            canCancel: false,
            completedAt: new Date().toISOString(),
          });
        }
      }
    };

    const timer = window.setTimeout(advanceStage, 280);
    this.jobTimers.set(jobId, timer);
    return job;
  }

  async getProcessingStatus(jobId: string): Promise<ProcessingJob> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error('Processing job not found.');
    return { ...job };
  }

  async cancelProcessing(jobId: string): Promise<ProcessingJob> {
    const timer = this.jobTimers.get(jobId);
    if (timer) {
      window.clearTimeout(timer);
      this.jobTimers.delete(jobId);
    }
    const existing = this.jobs.get(jobId);
    if (!existing) throw new Error('Processing job not found.');
    const cancelled: ProcessingJob = {
      ...existing,
      status: 'cancelled',
      canCancel: false,
      message: 'Demo processing cancelled by user.',
    };
    this.jobs.set(jobId, cancelled);
    return cancelled;
  }

  async getGeneratedClips(projectId: string): Promise<GeneratedClip[]> {
    return loadClips().filter((c) => c.projectId === projectId);
  }

  async getClipById(clipId: string): Promise<GeneratedClip | null> {
    return loadClips().find((c) => c.id === clipId) ?? null;
  }

  async updateClip(clipId: string, updates: Partial<GeneratedClip>): Promise<GeneratedClip> {
    const clips = loadClips();
    const index = clips.findIndex((c) => c.id === clipId);
    if (index === -1) throw new Error('Clip not found.');
    const updated: GeneratedClip = {
      ...clips[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    clips[index] = updated;
    saveClips(clips);
    return updated;
  }

  async retrackClip(clipId: string): Promise<GeneratedClip> {
    const clips = loadClips();
    const index = clips.findIndex((c) => c.id === clipId);
    if (index === -1) throw new Error('Clip not found.');
    const kfs = buildDemoKeyframes(clips[index].startTime, clips[index].endTime);
    clips[index] = {
      ...clips[index],
      cropKeyframes: kfs,
      autoCropKeyframes: kfs,
      updatedAt: new Date().toISOString(),
    };
    saveClips(clips);
    return clips[index];
  }

  async renderClip(clipId: string): Promise<{ renderedUrl: string; filename: string }> {
    const clip = loadClips().find((c) => c.id === clipId);
    if (!clip) throw new Error('Clip not found.');
    const project = loadProjects().find((p) => p.id === clip.projectId);
    const sourceUrl = project ? this.getSourceObjectUrl(project.sourceVideo.id) : undefined;
    const { blob, filename } = await renderDemoClipToBlob(clip, sourceUrl);
    const renderedUrl = URL.createObjectURL(blob);
    return { renderedUrl, filename };
  }

  async downloadClip(clipId: string): Promise<void> {
    const { renderedUrl, filename } = await this.renderClip(clipId);
    const link = document.createElement('a');
    link.href = renderedUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(renderedUrl), 4000);
  }

  async deleteClip(clipId: string): Promise<void> {
    const allClips = loadClips();
    const target = allClips.find((c) => c.id === clipId);
    const remaining = allClips.filter((c) => c.id !== clipId);
    saveClips(remaining);

    if (target) {
      const count = remaining.filter((c) => c.projectId === target.projectId).length;
      saveProjects(
        loadProjects().map((p) =>
          p.id === target.projectId
            ? { ...p, clipCount: count, updatedAt: new Date().toISOString() }
            : p
        )
      );
    }
  }

  async getProjects(): Promise<Project[]> {
    return loadProjects();
  }

  async getProjectById(projectId: string): Promise<Project | null> {
    return loadProjects().find((p) => p.id === projectId) ?? null;
  }

  async deleteProject(projectId: string): Promise<void> {
    saveProjects(loadProjects().filter((p) => p.id !== projectId));
    saveClips(loadClips().filter((c) => c.projectId !== projectId));
    saveHighlights(loadHighlights().filter((h) => h.projectId !== projectId));
  }

  async getHighlights(projectId: string): Promise<Highlight[]> {
    return loadHighlights().filter((h) => h.projectId === projectId);
  }

  async toggleHighlightSelection(highlightId: string, selected: boolean): Promise<Highlight> {
    const highlights = loadHighlights();
    const index = highlights.findIndex((h) => h.id === highlightId);
    if (index === -1) throw new Error('Highlight not found.');
    highlights[index] = { ...highlights[index], selected };
    saveHighlights(highlights);
    return highlights[index];
  }

  async generateClipsFromHighlights(projectId: string): Promise<GeneratedClip[]> {
    const project = loadProjects().find((p) => p.id === projectId);
    if (!project) throw new Error('Project not found.');
    const highlights = loadHighlights().filter((h) => h.projectId === projectId);
    const clips = generateClipsFromHighlightList(
      project,
      highlights,
      project.sourceVideo.isDemoSample
    );
    saveClips([...clips, ...loadClips().filter((c) => c.projectId !== projectId)]);
    saveProjects(
      loadProjects().map((p) =>
        p.id === projectId
          ? { ...p, clipCount: clips.length, updatedAt: new Date().toISOString() }
          : p
      )
    );
    return clips;
  }
}
