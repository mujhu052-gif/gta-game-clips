import React from 'react';
import { SubtitleStyle, TranscriptSegment } from '../types/video';

interface AnimatedCaptionPreviewProps {
  segments: TranscriptSegment[];
  style: SubtitleStyle;
  currentTime: number;
  compact?: boolean;
}

function pickInlineEmoji(phrase: string): string {
  const lower = phrase.toLowerCase();
  if (phrase.includes('?')) return ' ❓';
  if (/\b(mistake|wrong|stop|never|problem)\b/.test(lower)) return ' ⚠️';
  if (/\b(secret|truth|tip|rule|learn|idea|why|how)\b/.test(lower)) return ' 💡';
  if (/\b(amazing|crazy|fast|tripled|doubled|best|viral|grow)\b/.test(lower)) return ' 🔥';
  return '';
}

export const AnimatedCaptionPreview: React.FC<AnimatedCaptionPreviewProps> = ({
  segments,
  style,
  currentTime,
  compact = false,
}) => {
  if (!style.enabled || segments.length === 0) return null;

  const activeSegment =
    segments.find((s) => currentTime >= s.startTime && currentTime <= s.endTime) ?? segments[0];

  if (!activeSegment) return null;

  // Break segment into short 4-word phrase windows if long
  const words =
    activeSegment.words && activeSegment.words.length > 0
      ? activeSegment.words
      : activeSegment.text
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .map((w, idx, arr) => {
            const span = Math.max(0.2, activeSegment.endTime - activeSegment.startTime);
            const step = span / Math.max(1, arr.length);
            return {
              word: w,
              start: activeSegment.startTime + idx * step,
              end: activeSegment.startTime + (idx + 1) * step,
            };
          });

  let visibleWords = words;
  if (words.length > 4) {
    const activeIdx = Math.max(
      0,
      words.findIndex((w) => currentTime >= w.start && currentTime <= w.end)
    );
    const chunkStart = Math.floor(activeIdx / 4) * 4;
    visibleWords = words.slice(chunkStart, chunkStart + 4);
  }

  const positionClass =
    style.position === 'top'
      ? 'top-6'
      : style.position === 'middle'
        ? 'top-1/2 -translate-y-1/2'
        : compact
          ? 'bottom-4'
          : 'bottom-9';

  const bgClass =
    style.backgroundStyle === 'solid'
      ? 'bg-[#0B0D12]/92'
      : style.backgroundStyle === 'translucent'
        ? 'bg-[#13161F]/78 backdrop-blur-sm'
        : style.backgroundStyle === 'gradient'
          ? 'gradient-brand'
          : 'bg-transparent';

  const fontSizePx = compact
    ? Math.max(11, Math.min(15, style.fontSize * 0.58))
    : Math.max(13, Math.min(26, style.fontSize * 0.82));

  const phraseStr = visibleWords.map((w) => w.word).join(' ');
  const emoji = style.includeEmojis ? pickInlineEmoji(phraseStr) : '';

  return (
    <div className={`absolute inset-x-3 flex justify-center pointer-events-none ${positionClass}`}>
      <div
        className={`px-3 py-1.5 rounded-lg text-center font-extrabold leading-snug max-w-[92%] shadow-lg ${bgClass}`}
        style={{
          fontFamily: style.fontFamily,
          fontSize: `${fontSizePx}px`,
          textShadow:
            style.backgroundStyle === 'none' ? '0 2px 6px rgba(0,0,0,0.95)' : undefined,
        }}
      >
        {visibleWords.map((w, idx) => {
          const isSpoken =
            style.highlightActiveWord && currentTime >= w.start && currentTime <= w.end + 0.05;
          return (
            <span
              key={`${w.word}-${idx}`}
              className="inline-block transition-transform duration-100 mx-[2px]"
              style={{
                color: isSpoken ? style.activeWordColor : style.textColor,
                transform: isSpoken ? 'scale(1.08)' : 'scale(1)',
              }}
            >
              {w.word}
            </span>
          );
        })}
        {emoji && <span className="ml-1">{emoji}</span>}
      </div>
    </div>
  );
};
