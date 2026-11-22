import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  FileText,
  Pause,
  Play,
  RotateCcw,
  Save,
} from 'lucide-react';
import { AnimatedCaptionPreview } from '../components/AnimatedCaptionPreview';
import { KeyframeEditor } from '../components/KeyframeEditor';
import { PageMeta } from '../components/PageMeta';
import { loadClips } from '../services/storageService';
import { videoProcessingService } from '../services/videoProcessingService';
import {
  AspectRatio,
  CaptionBackgroundStyle,
  CaptionPosition,
  CaptionTemplate,
  CropKeyframe,
  ExportQuality,
  GeneratedClip,
  Project,
} from '../types/video';
import {
  buildWordTimestampsForSegment,
  formatTimestamp,
  getDefaultSubtitleStyle,
  interpolateCropAtTime,
  segmentsToSrt,
} from '../utils/formatters';

const FONT_OPTIONS = [
  'Plus Jakarta Sans',
  'DM Sans',
  'Oswald',
  'Playfair Display',
  'JetBrains Mono',
];

const CAPTION_THEMES: CaptionTemplate[] = [
  'Viral Pop',
  'Modern',
  'Classic',
  'Highlight',
  'Minimal',
];

const COLOR_SWATCHES = ['#FFFFFF', '#FDE047', '#38BDF8', '#A78BFA', '#34D399'];

export default function EditorPage() {
  const { projectId, clipId } = useParams<{ projectId?: string; clipId?: string }>();

  const [clip, setClip] = useState<GeneratedClip | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [retracking, setRetracking] = useState(false);
  const [previewMode, setPreviewMode] = useState<'interactive' | 'rendered'>('interactive');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let foundClip: GeneratedClip | null = null;

      if (clipId) {
        foundClip = await videoProcessingService.getClipById(clipId);
      }
      if (!foundClip && projectId) {
        const list = await videoProcessingService.getGeneratedClips(projectId);
        foundClip = list[0] ?? null;
      }
      if (!foundClip) {
        const all = loadClips();
        foundClip = all[0] ?? null;
      }

      if (foundClip && !cancelled) {
        setClip(foundClip);
        setCurrentTime(foundClip.startTime);
        const proj = await videoProcessingService.getProjectById(foundClip.projectId);
        if (!cancelled) setProject(proj);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, clipId]);

  const sourceStreamUrl = project
    ? videoProcessingService.getSourceObjectUrl(project.sourceVideo.id) ??
      project.sourceVideo.streamUrl
    : undefined;

  useEffect(() => {
    if (!clip || !isPlaying || previewMode === 'rendered' || sourceStreamUrl) return;
    const timer = window.setInterval(() => {
      setCurrentTime((prev) => {
        const next = prev + 0.15;
        return next >= clip.endTime ? clip.startTime : next;
      });
    }, 150);
    return () => window.clearInterval(timer);
  }, [clip, isPlaying, sourceStreamUrl, previewMode]);

  const showStatus = (msg: string) => {
    setStatusMessage(msg);
    window.setTimeout(() => setStatusMessage(null), 4000);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 py-16 text-center text-sm text-slate-400">
        Loading YTClip Video & Keyframe Editor...
      </div>
    );
  }

  if (!clip) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 py-16 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-white">No Clip Available to Edit</h1>
        <p className="text-sm text-slate-400">
          Generate or open a project first to launch the YTClip Video Editor.
        </p>
        <Link
          to="/generate"
          className="inline-flex px-5 py-2.5 rounded-lg text-xs font-semibold text-white gradient-brand"
        >
          Go to AI Clip Generator
        </Link>
      </div>
    );
  }

  const maxSourceDuration = project?.sourceVideo.durationSeconds ?? Math.max(clip.endTime + 30, 120);

  const updateTimes = (newStart: number, newEnd: number) => {
    const safeStart = Math.max(0, Math.min(newStart, maxSourceDuration - 5));
    const safeEnd = Math.max(safeStart + 5, Math.min(newEnd, maxSourceDuration));
    setClip((prev) =>
      prev
        ? {
            ...prev,
            startTime: Number(safeStart.toFixed(1)),
            endTime: Number(safeEnd.toFixed(1)),
            durationSeconds: Math.round(safeEnd - safeStart),
          }
        : null
    );
    setCurrentTime(safeStart);
    if (videoRef.current) {
      videoRef.current.currentTime = safeStart;
    }
  };

  const updateSubtitleStyle = <K extends keyof GeneratedClip['subtitleStyle']>(
    key: K,
    value: GeneratedClip['subtitleStyle'][K]
  ) => {
    setClip((prev) =>
      prev
        ? {
            ...prev,
            subtitleStatus:
              key === 'enabled' && value === false
                ? 'disabled'
                : prev.subtitleStyle.enabled || value === true
                  ? 'edited'
                  : prev.subtitleStatus,
            subtitleStyle: {
              ...prev.subtitleStyle,
              [key]: value,
            },
          }
        : null
    );
  };

  const applyCaptionTheme = (theme: CaptionTemplate) => {
    const preset = getDefaultSubtitleStyle(theme);
    setClip((prev) =>
      prev
        ? {
            ...prev,
            subtitleStatus: 'edited',
            subtitleStyle: {
              ...preset,
              enabled: prev.subtitleStyle.enabled,
            },
          }
        : null
    );
  };

  const updateSegmentText = (segId: string, text: string) => {
    setClip((prev) =>
      prev
        ? {
            ...prev,
            subtitleStatus: 'edited',
            transcriptSegments: prev.transcriptSegments.map((s) =>
              s.id === segId
                ? {
                    ...s,
                    text,
                    words: buildWordTimestampsForSegment(text, s.startTime, s.endTime),
                  }
                : s
            ),
          }
        : null
    );
  };

  const handleChangeKeyframes = (nextKeyframes: CropKeyframe[]) => {
    setClip((prev) => (prev ? { ...prev, cropKeyframes: nextKeyframes } : null));
  };

  const handleResetAutomaticTracking = async () => {
    setRetracking(true);
    try {
      const updated = await videoProcessingService.retrackClip(clip.id);
      setClip(updated);
      showStatus('Reset crop keyframes to automatic speaker tracking.');
    } finally {
      setRetracking(false);
    }
  };

  const handleSaveChanges = async () => {
    setSaving(true);
    try {
      const updated = await videoProcessingService.updateClip(clip.id, clip);
      setClip(updated);
      showStatus('Clip trim, keyframes, and captions saved.');
    } finally {
      setSaving(false);
    }
  };

  const handleRenderAndExport = async () => {
    setExporting(true);
    try {
      await videoProcessingService.updateClip(clip.id, clip);
      await videoProcessingService.downloadClip(clip.id);
      const refreshed = await videoProcessingService.getClipById(clip.id);
      if (refreshed) setClip(refreshed);
      showStatus(`Rendered & exported ${clip.exportSettings.quality} (${clip.aspectRatio}) clip.`);
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadSrt = () => {
    const srt = segmentsToSrt(clip.transcriptSegments, clip.startTime);
    const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${clip.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'clip'}.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showStatus('Downloaded SRT subtitle file.');
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        if (
          previewMode === 'interactive' &&
          (videoRef.current.currentTime < clip.startTime ||
            videoRef.current.currentTime >= clip.endTime)
        ) {
          videoRef.current.currentTime = clip.startTime;
        }
        videoRef.current.play().catch(() => {});
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    } else {
      setIsPlaying((p) => !p);
    }
  };

  const handleSeek = (t: number) => {
    const clamped = Math.max(clip.startTime, Math.min(clip.endTime, t));
    setCurrentTime(clamped);
    if (videoRef.current && previewMode === 'interactive') {
      videoRef.current.currentTime = clamped;
    }
  };

  const cropPos = interpolateCropAtTime(clip.cropKeyframes, currentTime);

  const previewFrameClass =
    clip.aspectRatio === '9:16'
      ? 'aspect-[9/16] max-w-[270px]'
      : clip.aspectRatio === '1:1'
        ? 'aspect-square max-w-[340px]'
        : 'aspect-video max-w-full';

  return (
    <>
      <PageMeta
        title={`Video & Keyframe Editor – ${clip.title}`}
        description="Edit speaker-tracked crop keyframes, trim timestamps, customize animated word-highlighted captions, and render verified H.264 MP4 clips in YTClip."
      />

      {statusMessage && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl border border-violet-500/30 bg-[#13161F]/95 text-sm text-white shadow-xl inline-flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{statusMessage}</span>
        </div>
      )}

      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 py-8 space-y-6">
        {/* Top Editor Toolbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
          <div className="space-y-1">
            <Link
              to={`/generate?project=${encodeURIComponent(clip.projectId)}`}
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Project Clips</span>
            </Link>
            <h1 className="font-display text-2xl font-bold text-white tracking-tight">
              {clip.title}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleDownloadSrt}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/10 text-xs font-medium text-slate-200 hover:bg-white/5 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Export SRT</span>
            </button>

            <button
              type="button"
              onClick={handleSaveChanges}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-white/15 bg-white/[0.04] text-xs font-semibold text-white hover:bg-white/[0.08] disabled:opacity-60 transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : 'Save Changes'}</span>
            </button>

            <button
              type="button"
              onClick={handleRenderAndExport}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white gradient-brand hover:opacity-95 disabled:opacity-60 transition-opacity"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{exporting ? 'Rendering FFmpeg MP4...' : 'Render & Export MP4'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left: Live Output Preview + Trim + Keyframe Editor */}
          <div className="lg:col-span-6 space-y-5">
            <div className="rounded-2xl border border-white/[0.08] bg-[#13161F] p-5 flex flex-col items-center gap-4">
              <div className="w-full flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 font-mono tabular-nums">
                <span>
                  {clip.aspectRatio} · {clip.durationSeconds}s · {clip.exportSettings.quality}
                </span>
                {clip.renderedUrl && !clip.isDemoSample && (
                  <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-[#0B0D12] border border-white/10">
                    <button
                      type="button"
                      onClick={() => setPreviewMode('interactive')}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium ${
                        previewMode === 'interactive'
                          ? 'bg-violet-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Live Keyframe Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewMode('rendered')}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium ${
                        previewMode === 'rendered'
                          ? 'bg-violet-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Rendered MP4
                    </button>
                  </div>
                )}
              </div>

              <div
                className={`relative w-full ${previewFrameClass} mx-auto rounded-xl overflow-hidden border border-white/10 bg-black flex items-center justify-center`}
              >
                {previewMode === 'rendered' && clip.renderedUrl ? (
                  <video
                    src={clip.renderedUrl}
                    controls
                    playsInline
                    className="w-full h-full object-contain"
                  />
                ) : sourceStreamUrl ? (
                  <>
                    <video
                      ref={videoRef}
                      src={sourceStreamUrl}
                      playsInline
                      className="w-full h-full object-cover transition-all duration-75"
                      style={{
                        objectPosition: `${cropPos.centerX * 100}% ${cropPos.centerY * 100}%`,
                      }}
                      onLoadedMetadata={(e) => {
                        e.currentTarget.currentTime = clip.startTime;
                      }}
                      onTimeUpdate={(e) => {
                        const t = e.currentTarget.currentTime;
                        setCurrentTime(t);
                        if (t >= clip.endTime) {
                          e.currentTarget.currentTime = clip.startTime;
                        }
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/25 pointer-events-none" />
                    <AnimatedCaptionPreview
                      segments={clip.transcriptSegments}
                      style={clip.subtitleStyle}
                      currentTime={currentTime}
                    />
                  </>
                ) : (
                  <>
                    <img
                      src={clip.previewImageUrl}
                      alt={clip.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover transition-all duration-100"
                      style={{
                        objectPosition: `${cropPos.centerX * 100}% ${cropPos.centerY * 100}%`,
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/25 pointer-events-none" />
                    <AnimatedCaptionPreview
                      segments={clip.transcriptSegments}
                      style={clip.subtitleStyle}
                      currentTime={currentTime}
                    />
                  </>
                )}
              </div>

              {previewMode === 'interactive' && (
                <div className="w-full space-y-2">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={togglePlay}
                      className="w-10 h-10 rounded-lg gradient-brand text-white inline-flex items-center justify-center shrink-0"
                      aria-label={isPlaying ? 'Pause' : 'Play'}
                    >
                      {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                    </button>

                    <input
                      type="range"
                      min={clip.startTime}
                      max={clip.endTime}
                      step={0.1}
                      value={Math.min(clip.endTime, Math.max(clip.startTime, currentTime))}
                      onChange={(e) => handleSeek(Number(e.target.value))}
                      aria-label="Preview playhead position"
                      className="flex-1 accent-violet-500"
                    />

                    <button
                      type="button"
                      onClick={() => handleSeek(clip.startTime)}
                      className="w-10 h-10 rounded-lg border border-white/10 text-slate-300 hover:text-white inline-flex items-center justify-center shrink-0"
                      aria-label="Restart clip preview"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex justify-between text-xs font-mono tabular-nums text-slate-400">
                    <span>In: {formatTimestamp(clip.startTime)}</span>
                    <span>Playhead: {formatTimestamp(currentTime)}</span>
                    <span>Out: {formatTimestamp(clip.endTime)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Keyframe Editor */}
            <KeyframeEditor
              clipStart={clip.startTime}
              clipEnd={clip.endTime}
              currentTime={currentTime}
              aspectRatio={clip.aspectRatio}
              keyframes={clip.cropKeyframes}
              trackingEngine={clip.trackingEngine}
              previewImageUrl={project?.sourceVideo.posterUrl || clip.previewImageUrl}
              onSeek={handleSeek}
              onChangeKeyframes={handleChangeKeyframes}
              onResetAutomatic={handleResetAutomaticTracking}
              resetting={retracking}
            />

            {/* Quality Verification Summary */}
            {clip.qualityCheck && (
              <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>FFprobe Post-Render Quality Verification Passed</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-slate-300 font-mono tabular-nums">
                  <span>
                    Size: {clip.qualityCheck.actualWidth}×{clip.qualityCheck.actualHeight}
                  </span>
                  <span>Duration: {clip.qualityCheck.actualDuration}s</span>
                  <span>Audio: {clip.qualityCheck.audioSynced ? 'Synced AAC' : 'Check'}</span>
                </div>
                <p className="text-xs text-slate-400">{clip.qualityCheck.notes.join(' · ')}</p>
              </div>
            )}
          </div>

          {/* Right: Trim, Aspect Ratio, Animated Caption Theme & Transcript Editor */}
          <div className="lg:col-span-6 space-y-5">
            {/* Trim & Title */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#13161F] p-5 space-y-4">
              <h2 className="text-base font-semibold text-white">Trim & Clip Timing</h2>

              <div>
                <label htmlFor="clip-title-edit" className="block text-xs text-slate-400 mb-1.5">
                  Clip Title
                </label>
                <input
                  id="clip-title-edit"
                  type="text"
                  value={clip.title}
                  onChange={(e) =>
                    setClip((prev) => (prev ? { ...prev, title: e.target.value } : null))
                  }
                  className="w-full rounded-lg bg-[#0B0D12] border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="trim-start" className="block text-xs text-slate-400 mb-1.5">
                    Start Time ({formatTimestamp(clip.startTime)})
                  </label>
                  <input
                    id="trim-start"
                    type="range"
                    min={0}
                    max={Math.max(0, clip.endTime - 5)}
                    step={1}
                    value={clip.startTime}
                    onChange={(e) => updateTimes(Number(e.target.value), clip.endTime)}
                    className="w-full accent-violet-500"
                  />
                </div>

                <div>
                  <label htmlFor="trim-end" className="block text-xs text-slate-400 mb-1.5">
                    End Time ({formatTimestamp(clip.endTime)})
                  </label>
                  <input
                    id="trim-end"
                    type="range"
                    min={clip.startTime + 5}
                    max={maxSourceDuration}
                    step={1}
                    value={clip.endTime}
                    onChange={(e) => updateTimes(clip.startTime, Number(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Aspect Ratio & Export Settings */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#13161F] p-5 space-y-4">
              <h2 className="text-base font-semibold text-white">Aspect Ratio & Export Settings</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <span className="block text-xs text-slate-400">Aspect Ratio</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['9:16', '1:1', '16:9'] as AspectRatio[]).map((ratio) => (
                      <button
                        key={ratio}
                        type="button"
                        onClick={() =>
                          setClip((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  aspectRatio: ratio,
                                  exportSettings: { ...prev.exportSettings, aspectRatio: ratio },
                                }
                              : null
                          )
                        }
                        className={`py-2 px-2.5 rounded-lg text-xs font-semibold border transition-colors tabular-nums ${
                          clip.aspectRatio === ratio
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
                  <span className="block text-xs text-slate-400">H.264 / AAC Resolution</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['720p', '1080p'] as ExportQuality[]).map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() =>
                          setClip((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  exportSettings: { ...prev.exportSettings, format: 'mp4', quality: q },
                                }
                              : null
                          )
                        }
                        className={`py-2 px-2.5 rounded-lg text-xs font-semibold border transition-colors tabular-nums ${
                          clip.exportSettings.quality === q
                            ? 'border-violet-500 bg-violet-600/20 text-white'
                            : 'border-white/10 bg-[#0B0D12] text-slate-400 hover:text-white'
                        }`}
                      >
                        MP4 · {q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Animated Caption Styling */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#13161F] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-white">Animated Captions</h2>
                <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={clip.subtitleStyle.enabled}
                    onChange={(e) => updateSubtitleStyle('enabled', e.target.checked)}
                    className="h-4 w-4 accent-violet-600 rounded"
                  />
                  <span>{clip.subtitleStyle.enabled ? 'Enabled' : 'Disabled'}</span>
                </label>
              </div>

              <div>
                <span className="block text-xs text-slate-400 mb-1.5">Caption Theme Preset</span>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  {CAPTION_THEMES.map((tpl) => (
                    <button
                      key={tpl}
                      type="button"
                      onClick={() => applyCaptionTheme(tpl)}
                      disabled={!clip.subtitleStyle.enabled}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold border transition-colors disabled:opacity-45 ${
                        clip.subtitleStyle.template === tpl
                          ? 'border-violet-500 bg-violet-600/20 text-white'
                          : 'border-white/10 bg-[#0B0D12] text-slate-400 hover:text-white'
                      }`}
                    >
                      {tpl}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-[#0B0D12] px-3 py-2 text-xs text-slate-300 cursor-pointer">
                  <span>Highlight spoken word</span>
                  <input
                    type="checkbox"
                    checked={clip.subtitleStyle.highlightActiveWord}
                    disabled={!clip.subtitleStyle.enabled}
                    onChange={(e) => updateSubtitleStyle('highlightActiveWord', e.target.checked)}
                    className="h-4 w-4 accent-violet-600 rounded"
                  />
                </label>
                <label className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-[#0B0D12] px-3 py-2 text-xs text-slate-300 cursor-pointer">
                  <span>Contextual emojis</span>
                  <input
                    type="checkbox"
                    checked={clip.subtitleStyle.includeEmojis}
                    disabled={!clip.subtitleStyle.enabled}
                    onChange={(e) => updateSubtitleStyle('includeEmojis', e.target.checked)}
                    className="h-4 w-4 accent-violet-600 rounded"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="font-family-select" className="block text-xs text-slate-400 mb-1.5">
                    Font Family
                  </label>
                  <select
                    id="font-family-select"
                    value={clip.subtitleStyle.fontFamily}
                    onChange={(e) => updateSubtitleStyle('fontFamily', e.target.value)}
                    disabled={!clip.subtitleStyle.enabled}
                    className="w-full rounded-lg bg-[#0B0D12] border border-white/10 px-3 py-2 text-xs text-white disabled:opacity-50"
                  >
                    {FONT_OPTIONS.map((font) => (
                      <option key={font} value={font}>
                        {font}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="font-size-slider" className="block text-xs text-slate-400 mb-1.5">
                    Font Size ({clip.subtitleStyle.fontSize}px)
                  </label>
                  <input
                    id="font-size-slider"
                    type="range"
                    min={14}
                    max={34}
                    value={clip.subtitleStyle.fontSize}
                    onChange={(e) => updateSubtitleStyle('fontSize', Number(e.target.value))}
                    disabled={!clip.subtitleStyle.enabled}
                    className="w-full accent-violet-500 mt-1.5 disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <span className="block text-xs text-slate-400 mb-1.5">Active Word Color</span>
                  <div className="flex items-center gap-2">
                    {COLOR_SWATCHES.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => updateSubtitleStyle('activeWordColor', hex)}
                        disabled={!clip.subtitleStyle.enabled}
                        className={`w-7 h-7 rounded-lg border-2 transition-transform ${
                          clip.subtitleStyle.activeWordColor === hex
                            ? 'border-violet-400 scale-110'
                            : 'border-white/15'
                        }`}
                        style={{ backgroundColor: hex }}
                        aria-label={`Select active word color ${hex}`}
                      />
                    ))}
                    <input
                      type="color"
                      value={clip.subtitleStyle.activeWordColor}
                      onChange={(e) => updateSubtitleStyle('activeWordColor', e.target.value)}
                      disabled={!clip.subtitleStyle.enabled}
                      aria-label="Custom active word color"
                      className="w-8 h-7 rounded bg-transparent border border-white/15 cursor-pointer"
                    />
                  </div>
                </div>

                <div>
                  <span className="block text-xs text-slate-400 mb-1.5">Safe-Area Position</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['top', 'middle', 'bottom'] as CaptionPosition[]).map((pos) => (
                      <button
                        key={pos}
                        type="button"
                        onClick={() => updateSubtitleStyle('position', pos)}
                        disabled={!clip.subtitleStyle.enabled}
                        className={`py-1.5 px-2 rounded-lg text-xs font-medium capitalize border transition-colors disabled:opacity-50 ${
                          clip.subtitleStyle.position === pos
                            ? 'border-violet-500 bg-violet-600/20 text-white'
                            : 'border-white/10 bg-[#0B0D12] text-slate-400 hover:text-white'
                        }`}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <span className="block text-xs text-slate-400 mb-1.5">Caption Background</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {(
                    [
                      { id: 'none', label: 'None' },
                      { id: 'translucent', label: 'Glass' },
                      { id: 'solid', label: 'Solid Dark' },
                      { id: 'gradient', label: 'Brand' },
                    ] as Array<{ id: CaptionBackgroundStyle; label: string }>
                  ).map((bg) => (
                    <button
                      key={bg.id}
                      type="button"
                      onClick={() => updateSubtitleStyle('backgroundStyle', bg.id)}
                      disabled={!clip.subtitleStyle.enabled}
                      className={`py-2 px-2.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
                        clip.subtitleStyle.backgroundStyle === bg.id
                          ? 'border-violet-500 bg-violet-600/20 text-white'
                          : 'border-white/10 bg-[#0B0D12] text-slate-400 hover:text-white'
                      }`}
                    >
                      {bg.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Editable Transcript Lines */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#13161F] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-white">Transcript & Caption Lines</h2>
                <span className="text-xs text-slate-400">Edits update word timings & ASS render</span>
              </div>
              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {clip.transcriptSegments.map((seg) => (
                  <div key={seg.id} className="space-y-1">
                    <div className="text-[11px] font-mono tabular-nums text-slate-500">
                      {formatTimestamp(seg.startTime)} – {formatTimestamp(seg.endTime)}
                    </div>
                    <input
                      type="text"
                      value={seg.text}
                      onChange={(e) => updateSegmentText(seg.id, e.target.value)}
                      className="w-full rounded-lg bg-[#0B0D12] border border-white/10 px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
