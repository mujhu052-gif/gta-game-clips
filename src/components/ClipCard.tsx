import React, { useState } from 'react';
import { CheckCircle2, Download, Pencil, Play, Trash2, Video } from 'lucide-react';
import { Link } from 'react-router-dom';
import { GeneratedClip } from '../types/video';
import { formatTimestamp } from '../utils/formatters';
import { AnimatedCaptionPreview } from './AnimatedCaptionPreview';

interface ClipCardProps {
  clip: GeneratedClip;
  onPreview: (clip: GeneratedClip) => void;
  onDownload: (clip: GeneratedClip) => Promise<void>;
  onDelete: (clipId: string) => Promise<void>;
}

export const ClipCard: React.FC<ClipCardProps> = ({
  clip,
  onPreview,
  onDownload,
  onDelete,
}) => {
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await onDownload(clip);
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(clip.id);
    } finally {
      setDeleting(false);
    }
  };

  const trackingLabel =
    clip.trackingEngine === 'opencv-face'
      ? 'OpenCV Face Track'
      : clip.trackingEngine === 'ffmpeg-motion-saliency'
        ? 'Motion Track'
        : clip.trackingEngine === 'center-fallback'
          ? 'Center Crop'
          : 'Demo Sample';

  return (
    <article className="rounded-xl border border-white/[0.08] bg-[#13161F] overflow-hidden flex flex-col">
      <button
        type="button"
        onClick={() => onPreview(clip)}
        className="group relative aspect-[9/14] w-full bg-[#0B0D12] overflow-hidden text-left focus-visible:outline-2 focus-visible:outline-violet-500"
        aria-label={`Preview ${clip.title}`}
      >
        {!imgFailed ? (
          <img
            src={clip.previewImageUrl}
            alt={clip.title}
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#181C28] to-[#0B0D12] p-4 text-center">
            <Video className="w-8 h-8 text-violet-400" />
            <span className="text-xs text-slate-400">{clip.title}</span>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/30" />

        <div className="absolute top-3 left-3 right-3 flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-200">
          <span>{trackingLabel}</span>
          <span>
            {clip.aspectRatio} · {clip.durationSeconds}s
          </span>
        </div>

        <span className="absolute inset-0 flex items-center justify-center">
          <span className="w-12 h-12 rounded-full bg-black/60 border border-white/20 text-white inline-flex items-center justify-center group-hover:bg-violet-600 group-hover:border-violet-400 transition-colors">
            <Play className="w-5 h-5 ml-0.5" />
          </span>
        </span>

        <AnimatedCaptionPreview
          segments={clip.transcriptSegments}
          style={clip.subtitleStyle}
          currentTime={clip.startTime + 0.6}
          compact
        />
      </button>

      <div className="p-4 flex-1 flex flex-col justify-between gap-4">
        <div className="space-y-2.5">
          <div className="text-xs text-slate-400 font-mono tabular-nums">
            {formatTimestamp(clip.startTime)} – {formatTimestamp(clip.endTime)} · Score{' '}
            {clip.highlightScore}/100 · {clip.cropKeyframes.length} keyframes
          </div>

          <h3 className="text-base font-semibold text-white leading-snug">{clip.title}</h3>

          <div className="space-y-1 text-xs">
            <p className="text-slate-300">
              <span className="text-slate-500">Hook:</span> {clip.suggestedHook}
            </p>
            <p className="text-slate-400 line-clamp-2">
              <span className="text-slate-500">Why selected:</span> {clip.selectionReason}
            </p>
            <p className="text-violet-300/90 font-mono">{clip.suggestedHashtags.join(' ')}</p>
          </div>

          {clip.qualityCheck && (
            <div className="pt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>
                Verified {clip.qualityCheck.actualWidth}×{clip.qualityCheck.actualHeight} MP4 ·{' '}
                {clip.qualityCheck.hasAudio ? 'AAC Sync' : 'Video'} ·{' '}
                {clip.qualityCheck.captionsBurned ? 'Burned Captions' : 'No Captions'}
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-3 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={() => onPreview(clip)}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 text-xs font-medium text-slate-200 hover:bg-white/5 transition-colors whitespace-nowrap"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Preview</span>
          </button>

          <Link
            to={`/editor/${clip.projectId}/${clip.id}`}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 text-xs font-medium text-slate-200 hover:bg-white/5 transition-colors whitespace-nowrap"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>Edit & Keyframes</span>
          </Link>

          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white gradient-brand hover:opacity-95 disabled:opacity-60 transition-opacity whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{downloading ? 'Exporting...' : 'Download MP4'}</span>
          </button>

          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 text-xs font-medium text-rose-300 hover:bg-rose-500/10 hover:border-rose-500/30 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{deleting ? 'Deleting...' : 'Delete'}</span>
          </button>
        </div>
      </div>
    </article>
  );
};
