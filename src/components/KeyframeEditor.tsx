import React from 'react';
import { Crosshair, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { AspectRatio, CropKeyframe } from '../types/video';
import { formatTimestampPrecise, interpolateCropAtTime } from '../utils/formatters';

interface KeyframeEditorProps {
  clipStart: number;
  clipEnd: number;
  currentTime: number;
  aspectRatio: AspectRatio;
  keyframes: CropKeyframe[];
  trackingEngine: string;
  previewImageUrl: string;
  onSeek: (time: number) => void;
  onChangeKeyframes: (next: CropKeyframe[]) => void;
  onResetAutomatic: () => Promise<void>;
  resetting?: boolean;
}

export const KeyframeEditor: React.FC<KeyframeEditorProps> = ({
  clipStart,
  clipEnd,
  currentTime,
  aspectRatio,
  keyframes,
  trackingEngine,
  previewImageUrl,
  onSeek,
  onChangeKeyframes,
  onResetAutomatic,
  resetting = false,
}) => {
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  const duration = Math.max(0.5, clipEnd - clipStart);
  const currentCrop = interpolateCropAtTime(sorted, currentTime);

  // Find keyframe closest to current playhead (within 0.45s)
  const activeKeyframe = sorted.find((k) => Math.abs(k.time - currentTime) <= 0.45) ?? null;

  const handleSetPositionAtPlayhead = (centerX: number, centerY: number) => {
    const clampedX = Number(Math.max(0.1, Math.min(0.9, centerX)).toFixed(3));
    const clampedY = Number(Math.max(0.15, Math.min(0.85, centerY)).toFixed(3));

    if (activeKeyframe) {
      onChangeKeyframes(
        sorted.map((k) =>
          k.id === activeKeyframe.id
            ? { ...k, centerX: clampedX, centerY: clampedY, source: 'manual' }
            : k
        )
      );
    } else {
      const newKf: CropKeyframe = {
        id: `kf-manual-${Date.now()}`,
        time: Number(currentTime.toFixed(2)),
        centerX: clampedX,
        centerY: clampedY,
        source: 'manual',
      };
      onChangeKeyframes([...sorted, newKf].sort((a, b) => a.time - b.time));
    }
  };

  const handleAddKeyframe = () => {
    if (activeKeyframe) return;
    const newKf: CropKeyframe = {
      id: `kf-manual-${Date.now()}`,
      time: Number(currentTime.toFixed(2)),
      centerX: Number(currentCrop.centerX.toFixed(3)),
      centerY: Number(currentCrop.centerY.toFixed(3)),
      source: 'manual',
    };
    onChangeKeyframes([...sorted, newKf].sort((a, b) => a.time - b.time));
  };

  const handleDeleteKeyframe = (id: string) => {
    if (sorted.length <= 1) return;
    onChangeKeyframes(sorted.filter((k) => k.id !== id));
  };

  // Compute crop box width/height inside a 16:9 source visualization
  const cropBoxWidthPct =
    aspectRatio === '9:16' ? 31.6 : aspectRatio === '1:1' ? 56.25 : 100;
  const cropBoxHeightPct = 100;
  const boxLeftPct = Math.max(
    0,
    Math.min(100 - cropBoxWidthPct, currentCrop.centerX * 100 - cropBoxWidthPct / 2)
  );

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#13161F] p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-white">Speaker Tracking & Keyframe Editor</h2>
          <p className="text-xs text-slate-400">
            Engine:{' '}
            <span className="text-slate-200 font-medium">
              {trackingEngine === 'opencv-face'
                ? 'OpenCV Face Tracking'
                : trackingEngine === 'ffmpeg-motion-saliency'
                  ? 'FFmpeg Motion & Skin Saliency Tracking'
                  : trackingEngine === 'center-fallback'
                    ? 'Center Crop Fallback'
                    : 'Demo Tracking'}
            </span>{' '}
            · {sorted.length} keyframes
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAddKeyframe}
            disabled={Boolean(activeKeyframe)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs font-medium text-slate-200 hover:bg-white/5 disabled:opacity-45 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Keyframe</span>
          </button>
          <button
            type="button"
            onClick={() => void onResetAutomatic()}
            disabled={resetting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs font-medium text-slate-200 hover:bg-white/5 disabled:opacity-50 transition-colors"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${resetting ? 'animate-spin' : ''}`} />
            <span>{resetting ? 'Tracking...' : 'Reset Auto Tracking'}</span>
          </button>
        </div>
      </div>

      {/* Interactive Crop Frame Position Map (click anywhere to reposition crop at playhead) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Source Crop Window ({aspectRatio}) — Click frame to aim camera</span>
          <span className="font-mono tabular-nums">
            X: {(currentCrop.centerX * 100).toFixed(0)}% · Y: {(currentCrop.centerY * 100).toFixed(0)}%
          </span>
        </div>

        <div
          role="button"
          tabIndex={0}
          aria-label="Click to position camera crop window"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const nx = (e.clientX - rect.left) / rect.width;
            const ny = (e.clientY - rect.top) / rect.height;
            handleSetPositionAtPlayhead(nx, ny);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') handleSetPositionAtPlayhead(currentCrop.centerX - 0.04, currentCrop.centerY);
            if (e.key === 'ArrowRight') handleSetPositionAtPlayhead(currentCrop.centerX + 0.04, currentCrop.centerY);
          }}
          className="relative aspect-video w-full rounded-xl overflow-hidden border border-white/15 bg-[#0B0D12] cursor-crosshair select-none"
        >
          <img
            src={previewImageUrl}
            alt="Source frame crop visualizer"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover opacity-50"
          />

          {/* Tracked face bounding box if present */}
          {currentCrop.faceBox && (
            <div
              className="absolute border border-emerald-400/80 bg-emerald-400/10 rounded pointer-events-none"
              style={{
                left: `${currentCrop.faceBox.x * 100}%`,
                top: `${currentCrop.faceBox.y * 100}%`,
                width: `${currentCrop.faceBox.w * 100}%`,
                height: `${currentCrop.faceBox.h * 100}%`,
              }}
            />
          )}

          {/* Active vertical/square crop box */}
          <div
            className="absolute top-0 border-2 border-violet-400 bg-violet-500/15 pointer-events-none transition-all duration-75"
            style={{
              left: `${boxLeftPct}%`,
              width: `${cropBoxWidthPct}%`,
              height: `${cropBoxHeightPct}%`,
            }}
          >
            <Crosshair
              className="w-4 h-4 text-white absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                left: '50%',
                top: `${currentCrop.centerY * 100}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Sliders for exact Center X & Center Y */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="kf-x-slider" className="block text-xs text-slate-400 mb-1">
            Horizontal Pan X ({Math.round(currentCrop.centerX * 100)}%)
          </label>
          <input
            id="kf-x-slider"
            type="range"
            min={10}
            max={90}
            value={Math.round(currentCrop.centerX * 100)}
            onChange={(e) => handleSetPositionAtPlayhead(Number(e.target.value) / 100, currentCrop.centerY)}
            className="w-full accent-violet-500"
          />
        </div>
        <div>
          <label htmlFor="kf-y-slider" className="block text-xs text-slate-400 mb-1">
            Vertical Framing Y ({Math.round(currentCrop.centerY * 100)}%)
          </label>
          <input
            id="kf-y-slider"
            type="range"
            min={15}
            max={85}
            value={Math.round(currentCrop.centerY * 100)}
            onChange={(e) => handleSetPositionAtPlayhead(currentCrop.centerX, Number(e.target.value) / 100)}
            className="w-full accent-blue-500"
          />
        </div>
      </div>

      {/* Keyframe Timeline Strip */}
      <div className="space-y-2">
        <div className="text-xs text-slate-400 flex justify-between">
          <span>Keyframe Timeline (click marker to jump & edit)</span>
          <span className="font-mono tabular-nums">{formatTimestampPrecise(currentTime)}</span>
        </div>
        <div className="relative h-9 rounded-lg bg-[#0B0D12] border border-white/[0.08] px-2 flex items-center">
          {/* Playhead line */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white pointer-events-none z-10"
            style={{
              left: `${Math.max(2, Math.min(98, ((currentTime - clipStart) / duration) * 100))}%`,
            }}
          />

          {sorted.map((kf) => {
            const pct = Math.max(2, Math.min(98, ((kf.time - clipStart) / duration) * 100));
            const isActive = activeKeyframe?.id === kf.id;
            return (
              <button
                key={kf.id}
                type="button"
                onClick={() => onSeek(kf.time)}
                title={`${formatTimestampPrecise(kf.time)} · X:${Math.round(kf.centerX * 100)}% (${kf.source})`}
                className={`absolute -translate-x-1/2 w-3.5 h-3.5 rotate-45 border transition-transform ${
                  isActive ? 'scale-125 ring-2 ring-white/50' : 'hover:scale-110'
                } ${
                  kf.source === 'manual'
                    ? 'bg-amber-400 border-amber-200'
                    : 'bg-violet-500 border-violet-200'
                }`}
                style={{ left: `${pct}%` }}
                aria-label={`Jump to keyframe at ${formatTimestampPrecise(kf.time)}`}
              />
            );
          })}
        </div>

        {/* Keyframe List */}
        <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
          {sorted.map((kf) => (
            <div
              key={kf.id}
              className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-xs border ${
                activeKeyframe?.id === kf.id
                  ? 'border-violet-500/50 bg-violet-500/10 text-white'
                  : 'border-white/[0.06] bg-[#0B0D12] text-slate-300'
              }`}
            >
              <button
                type="button"
                onClick={() => onSeek(kf.time)}
                className="flex-1 text-left font-mono tabular-nums flex items-center gap-3"
              >
                <span>{formatTimestampPrecise(kf.time)}</span>
                <span className="text-slate-400">
                  X {Math.round(kf.centerX * 100)}% · Y {Math.round(kf.centerY * 100)}%
                </span>
                <span className={kf.source === 'manual' ? 'text-amber-300' : 'text-violet-300'}>
                  {kf.source}
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleDeleteKeyframe(kf.id)}
                disabled={sorted.length <= 1}
                className="p-1 text-slate-400 hover:text-rose-300 disabled:opacity-30"
                aria-label={`Delete keyframe at ${formatTimestampPrecise(kf.time)}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
