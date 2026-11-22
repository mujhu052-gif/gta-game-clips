import { CropKeyframe, SubtitleStyle, TranscriptSegment, WordTimestamp } from '../src/types/video';

function toAssColor(hex: string, alphaHex = '00'): string {
  const cleaned = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return `&H${alphaHex}FFFFFF`;
  }
  const r = cleaned.slice(0, 2);
  const g = cleaned.slice(2, 4);
  const b = cleaned.slice(4, 6);
  // ASS uses &HAABBGGRR
  return `&H${alphaHex}${b}${g}${r}`.toUpperCase();
}

function formatAssTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const cs = Math.min(99, Math.floor((safe - Math.floor(safe)) * 100));
  return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function escapeAssText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\{/g, '(').replace(/\}/g, ')');
}

function pickContextualEmoji(phrase: string): string {
  const lower = phrase.toLowerCase();
  if (phrase.includes('?')) return ' ❓';
  if (/\b(mistake|wrong|stop|never|problem)\b/.test(lower)) return ' ⚠️';
  if (/\b(secret|truth|tip|rule|learn|idea|why|how)\b/.test(lower)) return ' 💡';
  if (/\b(amazing|crazy|fast|tripled|doubled|best|viral|grow)\b/.test(lower)) return ' 🔥';
  return '';
}

interface PhraseChunk {
  start: number;
  end: number;
  words: WordTimestamp[];
}

function chunkWordsIntoShortPhrases(
  segments: TranscriptSegment[],
  clipStart: number,
  clipEnd: number,
  maxWordsPerPhrase = 4
): PhraseChunk[] {
  const allWords: WordTimestamp[] = [];

  for (const seg of segments) {
    if (seg.endTime < clipStart || seg.startTime > clipEnd) continue;

    if (seg.words && seg.words.length > 0) {
      for (const w of seg.words) {
        if (w.end >= clipStart && w.start <= clipEnd) {
          allWords.push({
            word: w.word,
            start: Math.max(0, w.start - clipStart),
            end: Math.max(0.08, Math.min(clipEnd - clipStart, w.end - clipStart)),
          });
        }
      }
    } else {
      const tokens = seg.text.trim().split(/\s+/).filter(Boolean);
      const sStart = Math.max(0, seg.startTime - clipStart);
      const sEnd = Math.max(sStart + 0.3, Math.min(clipEnd - clipStart, seg.endTime - clipStart));
      const step = (sEnd - sStart) / Math.max(1, tokens.length);
      tokens.forEach((tok, idx) => {
        allWords.push({
          word: tok,
          start: sStart + idx * step,
          end: sStart + (idx + 1) * step,
        });
      });
    }
  }

  if (allWords.length === 0) return [];

  const chunks: PhraseChunk[] = [];
  let buffer: WordTimestamp[] = [];

  for (let i = 0; i < allWords.length; i++) {
    const w = allWords[i];
    buffer.push(w);
    const endsSentence = /[.!?]$/.test(w.word);
    const nextGap = i + 1 < allWords.length ? allWords[i + 1].start - w.end : 0;

    if (buffer.length >= maxWordsPerPhrase || endsSentence || nextGap > 0.65 || i === allWords.length - 1) {
      chunks.push({
        start: buffer[0].start,
        end: Math.max(buffer[0].start + 0.35, buffer[buffer.length - 1].end),
        words: buffer,
      });
      buffer = [];
    }
  }

  return chunks;
}

export function generateAnimatedAssSubtitles(params: {
  segments: TranscriptSegment[];
  style: SubtitleStyle;
  clipStart: number;
  clipEnd: number;
  playResX: number;
  playResY: number;
  cropKeyframes?: CropKeyframe[];
}): string {
  const { segments, style, clipStart, clipEnd, playResX, playResY, cropKeyframes } = params;

  const scaleFactor = playResY / 1920;
  const fontSize = Math.max(36, Math.round(style.fontSize * 2.55 * scaleFactor));
  const primaryColor = toAssColor(style.textColor || '#FFFFFF');
  const activeColor = toAssColor(style.activeWordColor || '#FDE047');

  // Map UI font choices to installed Linux/macOS sans fonts cleanly
  const fontName =
    style.fontFamily === 'JetBrains Mono'
      ? 'JetBrains Mono'
      : 'DejaVu Sans';

  // Alignment: 2 = bottom-center, 5 = middle-center, 8 = top-center
  let alignment = style.position === 'top' ? 8 : style.position === 'middle' ? 5 : 2;
  let marginV = Math.round(playResY * 0.16); // Inside TikTok/Reels/Shorts safe area

  // Avoid covering speaker's face if faceBox overlaps bottom safe zone
  if (cropKeyframes && cropKeyframes.length > 0 && style.position === 'bottom') {
    const avgFaceBottom =
      cropKeyframes
        .filter((k) => k.faceBox)
        .reduce((acc, k) => acc + (k.faceBox ? k.faceBox.y + k.faceBox.h : 0), 0) /
      Math.max(1, cropKeyframes.filter((k) => k.faceBox).length);

    if (avgFaceBottom > 0.72) {
      // Shift caption slightly lower inside safe zone or move near top if face occupies bottom
      marginV = Math.round(playResY * 0.11);
    }
  } else if (style.position === 'top') {
    marginV = Math.round(playResY * 0.12);
  } else if (style.position === 'middle') {
    marginV = Math.round(playResY * 0.05);
  }

  const borderStyle = style.backgroundStyle === 'solid' || style.backgroundStyle === 'translucent' ? 3 : 1;
  const backColour =
    style.backgroundStyle === 'solid'
      ? '&H180B0D12'
      : style.backgroundStyle === 'translucent'
        ? '&H6613161F'
        : style.backgroundStyle === 'gradient'
          ? '&H337C3AED'
          : '&H80000000';
  const outlineWidth = borderStyle === 3 ? Math.round(12 * scaleFactor) : Math.max(4, Math.round(6 * scaleFactor));
  const shadow = borderStyle === 3 ? 0 : Math.max(2, Math.round(3 * scaleFactor));
  const marginLR = Math.round(playResX * 0.08);

  const header = `[Script Info]
Title: YTClip Animated Captions
ScriptType: v4.00+
PlayResX: ${playResX}
PlayResY: ${playResY}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primaryColor},${activeColor},&H00090B10,${backColour},-1,0,0,0,100,100,0,0,${borderStyle},${outlineWidth},${shadow},${alignment},${marginLR},${marginLR},${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const chunks = chunkWordsIntoShortPhrases(segments, clipStart, clipEnd, 4);
  if (chunks.length === 0) {
    return header;
  }

  const lines: string[] = [];
  for (const chunk of chunks) {
    const chunkStart = chunk.start;
    const chunkEnd = Math.max(chunkStart + 0.3, chunk.end);
    const rawPhrase = chunk.words.map((w) => w.word).join(' ');
    const emojiSuffix = style.includeEmojis ? pickContextualEmoji(rawPhrase) : '';

    if (style.highlightActiveWord && chunk.words.length > 0) {
      // Emit word-by-word active-highlight events so the currently spoken word turns activeColor with subtle pop!
      for (let activeIdx = 0; activeIdx < chunk.words.length; activeIdx++) {
        const activeWord = chunk.words[activeIdx];
        const wStart = Math.max(chunkStart, activeWord.start);
        const nextStart =
          activeIdx + 1 < chunk.words.length ? chunk.words[activeIdx + 1].start : chunkEnd;
        const wEnd = Math.max(wStart + 0.06, Math.min(chunkEnd, nextStart));

        const renderedTokens = chunk.words.map((tok, idx) => {
          const safeWord = escapeAssText(tok.word);
          if (idx === activeIdx) {
            return `{\\c${activeColor}\\fscx108\\fscy108}${safeWord}{\\c${primaryColor}\\fscx100\\fscy100}`;
          }
          return safeWord;
        });

        const lineText = `${renderedTokens.join(' ')}${emojiSuffix}`;
        lines.push(
          `Dialogue: 0,${formatAssTime(wStart)},${formatAssTime(wEnd)},Default,,0,0,0,,${lineText}`
        );
      }
    } else {
      const safePhrase = escapeAssText(rawPhrase) + emojiSuffix;
      lines.push(
        `Dialogue: 0,${formatAssTime(chunkStart)},${formatAssTime(chunkEnd)},Default,,0,0,0,,${safePhrase}`
      );
    }
  }

  return header + lines.join('\n') + '\n';
}
