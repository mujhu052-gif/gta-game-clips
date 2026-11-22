import React, { useEffect, useRef, useState } from 'react';
import { Download, Pause, Play, Pencil, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { GeneratedClip } from '../types/video';
import { formatTimestamp, interpolateCropAtTime } from '../utils/formatters';
import { AnimatedCaptionPreview } from './AnimatedCaptionPreview';

interface ClipPlayerModalProps {
  clip: GeneratedClip | null;
  sourceObjectUrl?: string;
  onClose: () => void;
  onDownload: (clip: GeneratedClip) => Promise<void>;
}

export const ClipPlayerModal: React.FC<ClipPlayerModalProps> = ({
  clip,
  sourceObjectUrl,
  onClose,
  onDownload,
}) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const hasRenderedMp4 = Boolean(clip?.renderedUrl && !clip.isDemoSample);

  useEffect(() => {
    if (!clip) return;
    setCurrentTime(hasRenderedMp4 ? 0 : clip.startTime);
    setIsPlaying(true);
  }, [clip, hasRenderedMp4]);

  useEffect(() => {
    if (!clip || !isPlaying) return;
    if (hasRenderedMp4 || (sourceObjectUrl && videoRef.current)) return;

    const interval = window.setInterval(() => {
      setCurrentTime((prev) => {
        const next = prev + 0.15;
        return next >= clip.endTime ? clip.startTime : next;
      });
    }, 150);

    return () => window.clearInterval(interval);
  }, [clip, isPlaying, sourceObjectUrl, hasRenderedMp4]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  if (!clip) return null;

  const aspectClass =
    clip.aspectRatio === '9:16'
      ? 'aspect-[9/16] max-h-[62vh]'
      : clip.aspectRatio === '1:1'
        ? 'aspect-square max-h-[58vh]'
        : 'aspect-video w-full';

  const cropPos = interpolateCropAtTime(clip.cropKeyframes, currentTime);

  const togglePlay = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
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

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await onDownload(clip);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="clip-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#13161F] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-white/[0.08]">
          <div className="min-w-0">
            <p className="text-xs text-slate-400">
              {hasRenderedMp4
                ? 'Rendered H.264 MP4 (Burned-In Captions + Tracked Crop)'
                : clip.isDemoSample
                  ? 'Demo Sample Preview'
                  : 'Local Video Segment Preview'}{' '}
              · {clip.aspectRatio} · {formatTimestamp(clip.startTime)} – {formatTimestamp(clip.endTime)}
            </p>
            <h2 id="clip-modal-title" className="text-base font-semibold text-white truncate">
              {clip.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Close preview"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 flex flex-col items-center gap-4 bg-[#0B0D12]">
          <div
            className={`relative ${aspectClass} w-auto mx-auto rounded-xl overflow-hidden border border-white/10 bg-black flex items-center justify-center`}
          >
            {hasRenderedMp4 && clip.renderedUrl ? (
              <video
                ref={videoRef}
                src={clip.renderedUrl}
                autoPlay
                loop
                playsInline
                controls
                className="w-full h-full object-contain"
              />
            ) : sourceObjectUrl ? (
              <>
                <video
                  ref={videoRef}
                  src={sourceObjectUrl}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
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
                  className="w-full h-full object-cover transition-all duration-150"
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

            {!hasRenderedMp4 && (
              <>
                <button
                  type="button"
                  onClick={togglePlay}
                  className="absolute bottom-3 left-3 w-10 h-10 rounded-full bg-black/70 border border-white/15 text-white inline-flex items-center justify-center hover:bg-black/90 transition-colors"
                  aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>

                <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-md bg-black/70 text-xs font-mono tabular-nums text-slate-200">
                  {formatTimestamp(currentTime)} / {formatTimestamp(clip.endTime)}
                </div>
              </>
            )}
          </div>

          <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="text-xs text-slate-400">
              <span className="text-slate-200 font-medium">Selection reason:</span>{' '}
              {clip.selectionReason}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                to={`/editor/${clip.projectId}/${clip.id}`}
                onClick={onClose}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/10 text-xs font-medium text-slate-200 hover:bg-white/5 transition-colors whitespace-nowrap"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit & Keyframes</span>
              </Link>
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white gradient-brand hover:opacity-95 disabled:opacity-60 transition-opacity whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{downloading ? 'Exporting...' : 'Download MP4'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
