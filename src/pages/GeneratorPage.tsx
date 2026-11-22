import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  FileVideo,
  Info,
  Link2,
  Loader2,
  RefreshCw,
  Scissors,
  Upload,
  XCircle,
} from 'lucide-react';
import { PageMeta } from '../components/PageMeta';
import { ClipCard } from '../components/ClipCard';
import { ClipPlayerModal } from '../components/ClipPlayerModal';
import { DEMO_STUDIO_POSTER } from '../data/demoSamples';
import { loadPreferences, savePreferences } from '../services/storageService';
import { videoProcessingService } from '../services/videoProcessingService';
import {
  AspectRatio,
  CaptionTemplate,
  ClipSettings,
  EngineCapabilities,
  ExportQuality,
  GeneratedClip,
  Highlight,
  ProcessingJob,
  ProcessingStage,
  Project,
  SourceVideo,
  TargetClipDuration,
} from '../types/video';
import { formatFileSize, formatTimestamp, validateYouTubeUrl } from '../utils/formatters';

const PIPELINE_STAGES: Array<{ id: ProcessingStage; label: string }> = [
  { id: 'validating', label: '1. Validate source' },
  { id: 'extracting_audio', label: '2. Extract audio' },
  { id: 'transcribing', label: '3. Transcribe speech' },
  { id: 'analyzing_highlights', label: '4. Detect highlights' },
  { id: 'generating_candidates', label: '5. Candidate clips' },
  { id: 'tracking_speaker', label: '6. Track speaker' },
  { id: 'generating_keyframes', label: '7. Crop keyframes' },
  { id: 'generating_captions', label: '8. Sync captions' },
  { id: 'rendering_clips', label: '9. Render MP4' },
  { id: 'saving_metadata', label: '10. Save & verify' },
];

export default function GeneratorPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialProjectId = searchParams.get('project');

  const prefs = loadPreferences();
  const [capabilities, setCapabilities] = useState<EngineCapabilities | null>(null);
  const [inputMode, setInputMode] = useState<'upload' | 'youtube'>('upload');
  const [maxFileSizeMb, setMaxFileSizeMb] = useState<number>(prefs.maxFileSizeMb);
  const [dragActive, setDragActive] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedSource, setUploadedSource] = useState<SourceVideo | null>(null);
  const [projectTitle, setProjectTitle] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);

  const [youtubeUrl, setYoutubeUrl] = useState('');
  const youtubeCheck = youtubeUrl.trim() ? validateYouTubeUrl(youtubeUrl) : null;

  const [settings, setSettings] = useState<ClipSettings>(prefs.defaultClipSettings);

  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [activeJob, setActiveJob] = useState<ProcessingJob | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [clips, setClips] = useState<GeneratedClip[]>([]);
  const [workspaceTab, setWorkspaceTab] = useState<'clips' | 'highlights'>('clips');
  const [previewClip, setPreviewClip] = useState<GeneratedClip | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    void videoProcessingService.getCapabilities().then(setCapabilities);
  }, []);

  useEffect(() => {
    if (!initialProjectId) return;
    let cancelled = false;
    (async () => {
      const proj = await videoProcessingService.getProjectById(initialProjectId);
      if (!proj || cancelled) return;
      setActiveProject(proj);
      const [loadedClips, loadedHighlights, latestJob] = await Promise.all([
        videoProcessingService.getGeneratedClips(proj.id),
        videoProcessingService.getHighlights(proj.id),
        videoProcessingService.getLatestProjectJob
          ? videoProcessingService.getLatestProjectJob(proj.id)
          : Promise.resolve(null),
      ]);
      if (!cancelled) {
        setClips(loadedClips);
        setHighlights(loadedHighlights);
        if (latestJob) {
          setActiveJob(latestJob);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialProjectId]);

  useEffect(() => {
    if (!activeJob || (activeJob.status !== 'processing' && activeJob.status !== 'queued')) {
      return;
    }

    const timer = window.setInterval(async () => {
      try {
        const updated = await videoProcessingService.getProcessingStatus(activeJob.id);
        setActiveJob(updated);
        if (updated.status === 'completed') {
          const [proj, loadedClips, loadedHighlights] = await Promise.all([
            videoProcessingService.getProjectById(updated.projectId),
            videoProcessingService.getGeneratedClips(updated.projectId),
            videoProcessingService.getHighlights(updated.projectId),
          ]);
          if (proj) setActiveProject(proj);
          setClips(loadedClips);
          setHighlights(loadedHighlights);
          setSearchParams({ project: updated.projectId });
        }
      } catch (err) {
        setActiveJob((prev) =>
          prev
            ? {
                ...prev,
                status: 'error',
                errorDetails: err instanceof Error ? err.message : 'Status check failed',
              }
            : null
        );
      }
    }, 800);

    return () => window.clearInterval(timer);
  }, [activeJob, setSearchParams]);

  const handleMaxSizeChange = (mb: number) => {
    setMaxFileSizeMb(mb);
    savePreferences({ maxFileSizeMb: mb, defaultClipSettings: settings });
  };

  const updateSetting = <K extends keyof ClipSettings>(key: K, value: ClipSettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      savePreferences({ maxFileSizeMb, defaultClipSettings: next });
      return next;
    });
  };

  const processSelectedFile = async (file: File) => {
    setValidationError(null);
    setValidationWarnings([]);
    setSelectedFile(file);
    setValidating(true);
    setUploadProgress(0);

    const result = await videoProcessingService.validateVideo(file, maxFileSizeMb);
    if (!result.valid) {
      setValidating(false);
      setUploadedSource(null);
      setValidationError(result.error ?? 'Video validation failed.');
      return;
    }

    if (result.warnings) {
      setValidationWarnings(result.warnings);
    }

    try {
      const source = await videoProcessingService.uploadVideo(file, (pct) => setUploadProgress(pct));
      setUploadedSource(source);
      if (!projectTitle.trim()) {
        setProjectTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Failed to upload video file.');
    } finally {
      setValidating(false);
    }
  };

  const handleLoadSampleVideo = () => {
    setValidationError(null);
    setValidationWarnings([]);
    setSelectedFile(null);
    setUploadProgress(100);
    const sample: SourceVideo = {
      id: `demo-src-${Date.now()}`,
      filename: 'founder-product-launch-keynote.mp4',
      fileSizeBytes: 248 * 1024 * 1024,
      mimeType: 'video/mp4',
      durationSeconds: 1125,
      width: 1920,
      height: 1080,
      isDemoSample: true,
      posterUrl: DEMO_STUDIO_POSTER,
      uploadedAt: new Date().toISOString(),
    };
    setUploadedSource(sample);
    setProjectTitle('Founder Product Launch Keynote (Demo)');
    showToast('Loaded sample studio video for Demo Mode.');
  };

  const handleGenerateClips = async () => {
    if (!uploadedSource) {
      setValidationError('Upload an MP4, MOV, or WebM video file (or load the sample video) first.');
      return;
    }
    setValidationError(null);

    try {
      const proj = await videoProcessingService.createProject(
        projectTitle || uploadedSource.filename,
        uploadedSource,
        settings
      );
      setActiveProject(proj);
      setClips([]);
      setHighlights([]);
      const job = await videoProcessingService.startProcessing(proj.id);
      setActiveJob(job);
      setSearchParams({ project: proj.id });
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Could not start processing.');
    }
  };

  const handleCancelJob = async () => {
    if (!activeJob) return;
    const cancelled = await videoProcessingService.cancelProcessing(activeJob.id);
    setActiveJob(cancelled);
    showToast('Processing cancelled.');
  };

  const handleToggleHighlight = async (hl: Highlight) => {
    const updated = await videoProcessingService.toggleHighlightSelection(hl.id, !hl.selected);
    setHighlights((prev) => prev.map((item) => (item.id === hl.id ? updated : item)));
  };

  const handleRegenerateFromHighlights = async () => {
    if (!activeProject) return;
    setRegenerating(true);
    try {
      const updatedClips = await videoProcessingService.generateClipsFromHighlights(activeProject.id);
      setClips(updatedClips);
      setWorkspaceTab('clips');
      showToast(`Rebuilt ${updatedClips.length} clips from selected highlights.`);
    } finally {
      setRegenerating(false);
    }
  };

  const handleDeleteClip = async (clipId: string) => {
    await videoProcessingService.deleteClip(clipId);
    setClips((prev) => prev.filter((c) => c.id !== clipId));
    showToast('Clip deleted from project.');
  };

  const handleDownloadClip = async (clip: GeneratedClip) => {
    showToast(`Preparing MP4 export for "${clip.title}"...`);
    await videoProcessingService.downloadClip(clip.id);
    showToast(`Download started for "${clip.title}".`);
  };

  const activeSourceUrl = activeProject
    ? videoProcessingService.getSourceObjectUrl(activeProject.sourceVideo.id) ??
      activeProject.sourceVideo.streamUrl
    : uploadedSource?.objectUrl ?? uploadedSource?.streamUrl;

  const currentStageIndex = activeJob
    ? PIPELINE_STAGES.findIndex((s) => s.id === activeJob.currentStage)
    : -1;

  return (
    <>
      <PageMeta
        title="AI Clip Generator"
        description="Upload an authorized MP4, MOV, or WebM video, detect highlights, track speakers automatically, and export vertical shorts with burned-in animated captions in YTClip."
      />

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl border border-violet-500/30 bg-[#13161F]/95 text-sm text-white shadow-xl">
          {toast}
        </div>
      )}

      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 py-10 space-y-10">
        {/* Workspace Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/[0.08] pb-6">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-violet-300">
              {capabilities?.backendOnline && capabilities.ffmpegAvailable
                ? `${capabilities.modeLabel} · Free Tool`
                : 'Browser Demo Mode · Free Tool'}
            </p>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-white tracking-tight">
              AI Clip Generator
            </h1>
            <p className="text-sm text-slate-400 max-w-2xl">
              Upload an authorized video file up to 60 minutes to run highlight detection,
              automatic speaker tracking keyframes, and animated burned-in captions.
            </p>
          </div>
          <Link
            to="/projects"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-xs font-medium text-slate-200 hover:bg-white/5 transition-colors whitespace-nowrap shrink-0"
          >
            <span>View My Projects</span>
          </Link>
        </div>

        {/* Honest Server Capabilities Disclosure */}
        {capabilities?.backendOnline && !capabilities.readyForAiProcessing && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3 text-xs text-amber-100">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <p className="font-semibold text-white">
                Server Missing Required AI Packages — Real AI Processing Blocked Until Installed
              </p>
              <p className="text-slate-200 leading-relaxed">
                Missing dependencies reported by server health check:{' '}
                <span className="font-mono text-amber-200">
                  {(capabilities.missingDependencies && capabilities.missingDependencies.length > 0
                    ? capabilities.missingDependencies
                    : ['faster-whisper', 'opencv-python-headless']
                  ).join(', ')}
                </span>
                . Python runtime inspected:{' '}
                <code className="text-violet-300">{capabilities.pythonPath || 'python3'}</code>.
              </p>
              <p className="text-slate-300 leading-relaxed">
                FFmpeg audio extraction &amp; H.264 rendering are active, but YTClip does not fake AI
                transcription with silence detection. Install{' '}
                <code className="text-violet-300">python/requirements.txt</code> on your production
                Linux VPS (see <code className="text-violet-300">deploy/DEPLOYMENT.md</code>) or use{' '}
                <strong>Load Sample Studio Video</strong> to preview the interface in Demo Mode.
              </p>
            </div>
          </div>
        )}

        {/* Upload + Settings Split Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left: Video Input */}
          <section className="lg:col-span-7 rounded-2xl border border-white/[0.08] bg-[#13161F] p-5 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div
                className="inline-flex items-center gap-1 p-1 rounded-lg bg-[#0B0D12] border border-white/[0.08]"
                role="tablist"
                aria-label="Video Input Source"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={inputMode === 'upload'}
                  onClick={() => setInputMode('upload')}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    inputMode === 'upload'
                      ? 'gradient-brand text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Video</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={inputMode === 'youtube'}
                  onClick={() => setInputMode('youtube')}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    inputMode === 'youtube'
                      ? 'gradient-brand text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Link2 className="w-3.5 h-3.5" />
                  <span>YouTube Link</span>
                </button>
              </div>

              {inputMode === 'upload' && (
                <div className="flex items-center gap-2 text-xs">
                  <label htmlFor="max-size-select" className="text-slate-400">
                    Size limit:
                  </label>
                  <select
                    id="max-size-select"
                    value={maxFileSizeMb}
                    onChange={(e) => handleMaxSizeChange(Number(e.target.value))}
                    className="rounded-lg bg-[#0B0D12] border border-white/10 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                  >
                    <option value={250}>250 MB</option>
                    <option value={500}>500 MB</option>
                    <option value={1024}>1 GB</option>
                    <option value={2048}>2 GB</option>
                  </select>
                </div>
              )}
            </div>

            {inputMode === 'upload' ? (
              <div className="space-y-4">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                    const dropped = e.dataTransfer.files?.[0];
                    if (dropped) void processSelectedFile(dropped);
                  }}
                  className={`rounded-xl border-2 border-dashed p-6 sm:p-8 text-center transition-colors ${
                    dragActive
                      ? 'border-violet-400 bg-violet-500/10'
                      : 'border-white/15 bg-[#0B0D12]/60 hover:border-white/25'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void processSelectedFile(file);
                    }}
                  />

                  <div className="mx-auto w-12 h-12 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center mb-3">
                    {validating ? (
                      <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
                    ) : (
                      <FileVideo className="w-6 h-6 text-violet-400" />
                    )}
                  </div>

                  <p className="text-sm font-semibold text-white">
                    Drag and drop your video file here
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Supports MP4, MOV, WebM · Max duration 60 minutes · Limit {maxFileSizeMb} MB
                  </p>

                  <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 rounded-lg text-xs font-semibold text-white gradient-brand hover:opacity-95 transition-opacity"
                    >
                      Browse Video Files
                    </button>
                    <button
                      type="button"
                      onClick={handleLoadSampleVideo}
                      className="px-4 py-2 rounded-lg text-xs font-medium text-slate-200 border border-white/15 hover:bg-white/5 transition-colors"
                    >
                      Load Sample Studio Video
                    </button>
                  </div>
                </div>

                {validating && uploadProgress > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-mono tabular-nums text-slate-300">
                      <span>Uploading & probing video streams...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                      <div
                        className="h-full gradient-brand transition-all duration-200"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {validationError && (
                  <div
                    role="alert"
                    className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 flex items-start gap-2.5 text-xs text-rose-200"
                  >
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{validationError}</span>
                  </div>
                )}

                {validationWarnings.length > 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 flex items-start gap-2.5 text-xs text-amber-200">
                    <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>{validationWarnings.join(' ')}</span>
                  </div>
                )}

                {uploadedSource && (
                  <div className="rounded-xl border border-white/10 bg-[#0B0D12] p-4 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs text-emerald-400 flex items-center gap-1.5 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>
                            {uploadedSource.isDemoSample
                              ? 'Sample Video Ready (Demo Mode)'
                              : 'Validated Video Ready for Local Processing'}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-white truncate mt-0.5">
                          {selectedFile?.name ?? uploadedSource.filename}
                        </p>
                      </div>
                      <div className="text-xs font-mono tabular-nums text-slate-400 shrink-0">
                        {formatFileSize(uploadedSource.fileSizeBytes)} ·{' '}
                        {formatTimestamp(uploadedSource.durationSeconds)} · {uploadedSource.width}×
                        {uploadedSource.height}
                      </div>
                    </div>

                    {uploadedSource.objectUrl || uploadedSource.streamUrl ? (
                      <video
                        src={uploadedSource.objectUrl || uploadedSource.streamUrl}
                        controls
                        className="w-full max-h-64 rounded-lg bg-black border border-white/10"
                      />
                    ) : (
                      <div className="relative aspect-video max-h-56 w-full rounded-lg overflow-hidden border border-white/10">
                        <img
                          src={uploadedSource.posterUrl || DEMO_STUDIO_POSTER}
                          alt="Sample studio source video"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                        <div className="absolute bottom-3 left-3 text-xs text-slate-200">
                          Demo sample source preview ({formatTimestamp(uploadedSource.durationSeconds)})
                        </div>
                      </div>
                    )}

                    <div>
                      <label
                        htmlFor="project-title-input"
                        className="block text-xs text-slate-400 mb-1.5"
                      >
                        Project Title
                      </label>
                      <input
                        id="project-title-input"
                        type="text"
                        value={projectTitle}
                        onChange={(e) => setProjectTitle(e.target.value)}
                        placeholder="e.g., Podcast Episode 42 Highlights"
                        className="w-full rounded-lg bg-[#13161F] border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="youtube-url-input"
                    className="block text-xs font-medium text-slate-300 mb-1.5"
                  >
                    YouTube Video URL
                  </label>
                  <input
                    id="youtube-url-input"
                    type="url"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
                    className="w-full rounded-xl bg-[#0B0D12] border border-white/15 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
                  />
                </div>

                {youtubeCheck && (
                  <div
                    className={`rounded-xl border p-3.5 text-xs flex items-start gap-2.5 ${
                      youtubeCheck.valid
                        ? 'border-blue-500/30 bg-blue-500/10 text-blue-100'
                        : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                    }`}
                  >
                    {youtubeCheck.valid ? (
                      <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1">
                      <p className="font-semibold">
                        {youtubeCheck.valid
                          ? `Valid YouTube URL format (Video ID: ${youtubeCheck.videoId})`
                          : 'Invalid YouTube URL'}
                      </p>
                      <p className="text-slate-300">
                        {youtubeCheck.valid
                          ? 'To respect platform terms and creator rights, YTClip does not download videos from YouTube URLs. Please upload an authorized MP4, MOV, or WebM video file that you own or have permission to edit.'
                          : youtubeCheck.reason}
                      </p>
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-white/[0.08] bg-[#0B0D12] p-4 space-y-3">
                  <h2 className="text-sm font-semibold text-white">
                    Authorized Video Upload Required
                  </h2>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Download your own recording from YouTube Studio or use your original master file,
                    then switch to the Upload Video tab to process it locally with YTClip.
                  </p>
                  <button
                    type="button"
                    onClick={() => setInputMode('upload')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white gradient-brand"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Switch to Upload Video</span>
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Right: Clip Settings Panel */}
          <section className="lg:col-span-5 rounded-2xl border border-white/[0.08] bg-[#13161F] p-5 sm:p-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-white">Clip & Export Settings</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Configure clip duration, 9:16 speaker framing, animated caption theme, and H.264
                output quality.
              </p>
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-300">Target Clip Duration</span>
              <div className="grid grid-cols-3 gap-2">
                {([30, 45, 60] as TargetClipDuration[]).map((dur) => (
                  <button
                    key={dur}
                    type="button"
                    onClick={() => updateSetting('targetDuration', dur)}
                    className={`py-2.5 px-3 rounded-lg text-xs font-semibold border transition-colors tabular-nums ${
                      settings.targetDuration === dur
                        ? 'border-violet-500 bg-violet-600/20 text-white'
                        : 'border-white/10 bg-[#0B0D12] text-slate-400 hover:text-white'
                    }`}
                  >
                    {dur} seconds
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-300">Aspect Ratio</span>
              <div className="grid grid-cols-3 gap-2">
                {(['9:16', '1:1', '16:9'] as AspectRatio[]).map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => updateSetting('aspectRatio', ratio)}
                    className={`py-2.5 px-3 rounded-lg text-xs font-semibold border transition-colors tabular-nums ${
                      settings.aspectRatio === ratio
                        ? 'border-violet-500 bg-violet-600/20 text-white'
                        : 'border-white/10 bg-[#0B0D12] text-slate-400 hover:text-white'
                    }`}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-300">
                Animated Caption Theme
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(['Viral Pop', 'Modern', 'Classic', 'Highlight', 'Minimal'] as CaptionTemplate[]).map(
                  (tpl) => (
                    <button
                      key={tpl}
                      type="button"
                      onClick={() => updateSetting('captionTemplate', tpl)}
                      className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-colors text-left ${
                        settings.captionTemplate === tpl
                          ? 'border-violet-500 bg-violet-600/20 text-white'
                          : 'border-white/10 bg-[#0B0D12] text-slate-400 hover:text-white'
                      }`}
                    >
                      {tpl}
                    </button>
                  )
                )}
              </div>
            </div>

            <label className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-[#0B0D12] px-3.5 py-2.5 text-xs text-slate-300 cursor-pointer">
              <span>Add subtle contextual emojis when appropriate</span>
              <input
                type="checkbox"
                checked={Boolean(settings.includeEmojis)}
                onChange={(e) => updateSetting('includeEmojis', e.target.checked)}
                className="h-4 w-4 accent-violet-600 rounded"
              />
            </label>

            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-300">Export Quality (H.264 MP4)</span>
              <div className="grid grid-cols-2 gap-2">
                {(['720p', '1080p'] as ExportQuality[]).map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => updateSetting('exportQuality', q)}
                    className={`py-2.5 px-3 rounded-lg text-xs font-semibold border transition-colors tabular-nums ${
                      settings.exportQuality === q
                        ? 'border-violet-500 bg-violet-600/20 text-white'
                        : 'border-white/10 bg-[#0B0D12] text-slate-400 hover:text-white'
                    }`}
                  >
                    {q} MP4
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleGenerateClips}
              disabled={activeJob?.status === 'processing' || activeJob?.status === 'queued'}
              className="w-full py-3 px-5 rounded-xl text-sm font-semibold text-white gradient-brand hover:opacity-95 disabled:opacity-50 transition-opacity inline-flex items-center justify-center gap-2"
            >
              <Scissors className="w-4 h-4" />
              <span>
                {activeJob?.status === 'processing' ? 'Processing Video...' : 'Generate My Clips'}
              </span>
            </button>
          </section>
        </div>

        {/* 10-Stage Processing Pipeline */}
        {activeJob && (
          <section
            aria-label="Video Processing Status"
            className="rounded-2xl border border-white/10 bg-[#13161F] p-5 sm:p-6 space-y-5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-medium text-violet-300">
                  {activeJob.isDemoMode
                    ? 'Demo Mode Processing Pipeline (Simulated)'
                    : 'Local FFmpeg + Python Processing Pipeline'}
                </div>
                <h2 className="text-lg font-semibold text-white">
                  {activeJob.status === 'completed'
                    ? activeJob.message
                    : activeJob.status === 'cancelled'
                      ? 'Processing Cancelled'
                      : activeJob.status === 'error'
                        ? 'Processing Failed'
                        : activeJob.message}
                </h2>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-sm font-mono tabular-nums font-semibold text-white">
                  {activeJob.progress}% · {activeJob.status}
                </span>
                {activeJob.canCancel &&
                  (activeJob.status === 'processing' || activeJob.status === 'queued') && (
                    <button
                      type="button"
                      onClick={handleCancelJob}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-xs font-medium text-rose-200 hover:bg-rose-500/20 transition-colors"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Cancel</span>
                    </button>
                  )}
              </div>
            </div>

            <div className="h-2.5 rounded-full bg-[#0B0D12] overflow-hidden border border-white/[0.06]">
              <div
                className={`h-full transition-all duration-300 ${
                  activeJob.status === 'cancelled' || activeJob.status === 'error'
                    ? 'bg-rose-500'
                    : 'gradient-brand'
                }`}
                style={{ width: `${activeJob.progress}%` }}
              />
            </div>

            {activeJob.errorDetails && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 space-y-2 text-xs text-rose-200">
                <p className="font-medium">{activeJob.errorDetails}</p>
                {activeJob.errorLog && (
                  <details className="text-[11px] text-rose-300/80">
                    <summary className="cursor-pointer hover:text-white">
                      Technical worker log (attempts: {activeJob.attempts ?? 1}/
                      {activeJob.maxAttempts ?? 1})
                    </summary>
                    <pre className="mt-2 whitespace-pre-wrap break-all font-mono bg-black/40 p-2 rounded">
                      {activeJob.errorLog}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {PIPELINE_STAGES.map((stage, idx) => {
                const isDone =
                  activeJob.status === 'completed' ||
                  (currentStageIndex > idx && activeJob.status !== 'cancelled' && activeJob.status !== 'error');
                const isActive =
                  activeJob.status === 'processing' && stage.id === activeJob.currentStage;
                return (
                  <div
                    key={stage.id}
                    className={`rounded-lg border px-3 py-2 text-xs transition-colors ${
                      isActive
                        ? 'border-violet-500 bg-violet-600/15 text-white'
                        : isDone
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                          : 'border-white/[0.06] bg-[#0B0D12] text-slate-500'
                    }`}
                  >
                    <div className="font-medium leading-snug">{stage.label}</div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Active Project: Generated Clips & Highlight Analysis */}
        {activeProject && (clips.length > 0 || highlights.length > 0) && (
          <section className="space-y-6 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
              <div>
                <p className="text-xs text-slate-400">
                  {activeProject.isDemoMode
                    ? 'Sample Demo Output'
                    : 'Locally Rendered & Quality-Verified Clips'}{' '}
                  · Source {formatTimestamp(activeProject.sourceVideo.durationSeconds)}
                </p>
                <h2 className="font-display text-2xl font-bold text-white">
                  {activeProject.title}
                </h2>
              </div>

              <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-[#13161F] border border-white/[0.08] self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setWorkspaceTab('clips')}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    workspaceTab === 'clips'
                      ? 'gradient-brand text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Generated Clips ({clips.length})
                </button>
                <button
                  type="button"
                  onClick={() => setWorkspaceTab('highlights')}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    workspaceTab === 'highlights'
                      ? 'gradient-brand text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Highlight Analysis ({highlights.length})
                </button>
              </div>
            </div>

            {workspaceTab === 'clips' ? (
              clips.length === 0 ? (
                <div className="rounded-xl border border-white/[0.08] bg-[#13161F] p-8 text-center space-y-3">
                  <p className="text-sm text-slate-300">
                    No clips remain in this project. Switch to Highlight Analysis to generate new
                    clips from detected moments.
                  </p>
                  <button
                    type="button"
                    onClick={() => setWorkspaceTab('highlights')}
                    className="px-4 py-2 rounded-lg text-xs font-semibold text-white gradient-brand"
                  >
                    Open Highlight Analysis
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {clips.map((clip) => (
                    <ClipCard
                      key={clip.id}
                      clip={clip}
                      onPreview={setPreviewClip}
                      onDownload={handleDownloadClip}
                      onDelete={handleDeleteClip}
                    />
                  ))}
                </div>
              )
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-slate-300 space-y-1">
                    <p className="font-semibold text-white">
                      Ranked Candidate Highlights (Measurable Signals — No Virality Guarantee)
                    </p>
                    <p>
                      Clips are ranked using hook strength, audio RMS energy, speech activity,
                      visual scene changes, and complete-thought boundary snapping.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRegenerateFromHighlights}
                    disabled={regenerating}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white gradient-brand hover:opacity-95 disabled:opacity-60 whitespace-nowrap shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} />
                    <span>{regenerating ? 'Rendering...' : 'Rebuild & Render Selected'}</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {highlights.map((hl) => (
                    <label
                      key={hl.id}
                      className={`block rounded-xl border p-4 sm:p-5 cursor-pointer transition-colors ${
                        hl.selected
                          ? 'border-violet-500/50 bg-[#161A26]'
                          : 'border-white/[0.08] bg-[#13161F] opacity-80'
                      }`}
                    >
                      <div className="flex items-start gap-3.5">
                        <input
                          type="checkbox"
                          checked={hl.selected}
                          onChange={() => void handleToggleHighlight(hl)}
                          className="mt-1 h-4 w-4 rounded border-white/20 bg-[#0B0D12] accent-violet-600"
                        />
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-mono tabular-nums text-slate-400">
                              {formatTimestamp(hl.startTime)} – {formatTimestamp(hl.endTime)} ·{' '}
                              {Math.round(hl.endTime - hl.startTime)}s · Hook {hl.hookScore} · Energy{' '}
                              {hl.audioEnergyScore} · {hl.sceneChanges} scene(s)
                            </span>
                            <span className="text-xs font-mono tabular-nums font-semibold text-violet-300">
                              Highlight Score: {hl.highlightScore}/100
                            </span>
                          </div>
                          <h3 className="text-sm sm:text-base font-semibold text-white">
                            Suggested Hook: {hl.suggestedHook}
                          </h3>
                          <p className="text-xs text-blue-300">
                            Why selected: {hl.selectionReason}
                          </p>
                          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                            “{hl.transcriptExcerpt}”
                          </p>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      <ClipPlayerModal
        clip={previewClip}
        sourceObjectUrl={activeSourceUrl}
        onClose={() => setPreviewClip(null)}
        onDownload={handleDownloadClip}
      />
    </>
  );
}
