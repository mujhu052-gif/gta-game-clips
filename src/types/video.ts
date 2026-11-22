export type AspectRatio = '9:16' | '1:1' | '16:9';

export type TargetClipDuration = 30 | 45 | 60;

export type CaptionTemplate = 'Viral Pop' | 'Classic' | 'Modern' | 'Highlight' | 'Minimal';

export type ExportQuality = '720p' | '1080p';

export type CaptionPosition = 'top' | 'middle' | 'bottom';

export type CaptionBackgroundStyle = 'none' | 'translucent' | 'solid' | 'gradient';

export type ProcessingStage =
  | 'validating'
  | 'extracting_audio'
  | 'transcribing'
  | 'analyzing_highlights'
  | 'generating_candidates'
  | 'tracking_speaker'
  | 'generating_keyframes'
  | 'generating_captions'
  | 'rendering_clips'
  | 'saving_metadata';

export type ProcessingStatus =
  | 'idle'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'cancelled'
  | 'error';

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface TranscriptSegment {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  words?: WordTimestamp[];
}

export interface CropKeyframe {
  id: string;
  /** Time offset in seconds relative to source video */
  time: number;
  /** Normalized crop center X (0.0 left .. 1.0 right) */
  centerX: number;
  /** Normalized crop center Y (0.0 top .. 1.0 bottom) */
  centerY: number;
  /** Normalized detected face bounding box (0..1) if detected */
  faceBox?: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  source: 'auto' | 'manual';
}

export interface QualityCheckReport {
  passed: boolean;
  fileExists: boolean;
  playable: boolean;
  hasAudio: boolean;
  audioSynced: boolean;
  captionsBurned: boolean;
  speakerTracked: boolean;
  durationVerified: boolean;
  resolutionVerified: boolean;
  actualWidth: number;
  actualHeight: number;
  actualDuration: number;
  notes: string[];
}

export interface SourceVideo {
  id: string;
  filename: string;
  fileSizeBytes: number;
  mimeType: string;
  durationSeconds: number;
  width: number;
  height: number;
  isDemoSample: boolean;
  /** Ephemeral in-memory object URL (never persisted to localStorage) */
  objectUrl?: string;
  /** Server-streamable URL when processed on backend */
  streamUrl?: string;
  posterUrl?: string;
  uploadedAt: string;
}

export interface Highlight {
  id: string;
  projectId: string;
  startTime: number;
  endTime: number;
  transcriptExcerpt: string;
  suggestedHook: string;
  selectionReason: string;
  hookScore: number;
  audioEnergyScore: number;
  sceneChanges: number;
  sentenceComplete: boolean;
  /** Composite highlight score (0-100); does not guarantee virality */
  highlightScore: number;
  selected: boolean;
}

export interface SubtitleStyle {
  enabled: boolean;
  template: CaptionTemplate;
  fontFamily: string;
  fontSize: number;
  textColor: string;
  activeWordColor: string;
  highlightActiveWord: boolean;
  includeEmojis: boolean;
  backgroundStyle: CaptionBackgroundStyle;
  position: CaptionPosition;
}

export interface ExportSettings {
  format: 'mp4';
  quality: ExportQuality;
  aspectRatio: AspectRatio;
}

export interface ClipSettings {
  targetDuration: TargetClipDuration;
  aspectRatio: AspectRatio;
  captionTemplate: CaptionTemplate;
  exportQuality: ExportQuality;
  includeEmojis?: boolean;
}

export interface GeneratedClip {
  id: string;
  projectId: string;
  highlightId?: string;
  title: string;
  startTime: number;
  endTime: number;
  durationSeconds: number;
  aspectRatio: AspectRatio;
  suggestedHook: string;
  selectionReason: string;
  highlightScore: number;
  suggestedTitle: string;
  suggestedHashtags: string[];
  subtitleStatus: 'auto-generated' | 'edited' | 'disabled';
  subtitleStyle: SubtitleStyle;
  transcriptSegments: TranscriptSegment[];
  cropKeyframes: CropKeyframe[];
  autoCropKeyframes: CropKeyframe[];
  trackingEngine: 'opencv-face' | 'ffmpeg-motion-saliency' | 'center-fallback' | 'demo';
  transcriptionEngine?: 'faster-whisper' | 'fallback-audio-vad' | 'demo';
  exportSettings: ExportSettings;
  previewImageUrl: string;
  isDemoSample: boolean;
  renderedUrl?: string;
  qualityCheck?: QualityCheckReport;
  updatedAt: string;
}

export interface ProcessingJob {
  id: string;
  projectId: string;
  status: ProcessingStatus;
  currentStage: ProcessingStage;
  progress: number;
  message: string;
  errorDetails?: string;
  errorLog?: string;
  attempts?: number;
  maxAttempts?: number;
  isDemoMode: boolean;
  canCancel: boolean;
  startedAt: string;
  completedAt?: string;
}

export interface Project {
  id: string;
  title: string;
  sourceVideo: Omit<SourceVideo, 'objectUrl'>;
  clipSettings: ClipSettings;
  status: ProcessingStatus;
  clipCount: number;
  isDemoMode: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
  detectedMeta?: {
    durationSeconds: number;
    width: number;
    height: number;
  };
}

export interface UserPreferences {
  maxFileSizeMb: number;
  defaultClipSettings: ClipSettings;
}

export interface EngineCapabilities {
  backendOnline: boolean;
  ffmpegAvailable: boolean;
  ffprobeAvailable: boolean;
  fasterWhisperAvailable: boolean;
  opencvAvailable: boolean;
  whisperModelReady?: boolean;
  whisperModelName?: string;
  readyForAiProcessing?: boolean;
  requireRealAi?: boolean;
  pythonPath?: string;
  missingDependencies?: string[];
  modeLabel: string;
}
