import {
  CaptionTemplate,
  CropKeyframe,
  GeneratedClip,
  SubtitleStyle,
  TranscriptSegment,
  WordTimestamp,
} from '../types/video';

export function formatTimestamp(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatTimestampPrecise(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const tenths = Math.floor((safe - Math.floor(safe)) * 10);
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, idx);
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[idx]}`;
}

export function formatDateShort(isoDate: string): string {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return 'Unknown date';
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function validateYouTubeUrl(rawUrl: string): {
  valid: boolean;
  videoId?: string;
  reason?: string;
} {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { valid: false, reason: 'Enter a YouTube video URL to validate its format.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      valid: false,
      reason: 'Invalid URL syntax. Include https:// (e.g. https://www.youtube.com/watch?v=...).',
    };
  }

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  if (host === 'youtu.be') {
    const id = parsed.pathname.replace('/', '').trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(id)) {
      return { valid: true, videoId: id };
    }
    return {
      valid: false,
      reason: 'Invalid youtu.be video ID. Expected an 11-character video identifier.',
    };
  }

  if (host === 'youtube.com' || host === 'm.youtube.com') {
    if (parsed.pathname === '/watch') {
      const id = parsed.searchParams.get('v') ?? '';
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) {
        return { valid: true, videoId: id };
      }
      return { valid: false, reason: 'Missing or invalid ?v= video ID in YouTube watch link.' };
    }

    const shortsMatch = parsed.pathname.match(/^\/(shorts|live|embed)\/([a-zA-Z0-9_-]{11})/);
    if (shortsMatch) {
      return { valid: true, videoId: shortsMatch[2] };
    }

    return {
      valid: false,
      reason: 'Unsupported YouTube path. Use a /watch?v=, /shorts/, or youtu.be link.',
    };
  }

  return { valid: false, reason: 'URL must point to youtube.com or youtu.be.' };
}

export function probeVideoMetadata(file: File): Promise<{
  durationSeconds: number;
  width: number;
  height: number;
  objectUrl: string;
}> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;

    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(
        new Error('Timed out reading video metadata. The file codec may not be supported by this browser.')
      );
    }, 8000);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.onloadedmetadata = null;
      video.onerror = null;
    };

    video.onloadedmetadata = () => {
      const durationSeconds = Number.isFinite(video.duration) ? video.duration : 0;
      const width = video.videoWidth || 1920;
      const height = video.videoHeight || 1080;
      cleanup();
      resolve({ durationSeconds, width, height, objectUrl });
    };

    video.onerror = () => {
      cleanup();
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not decode video metadata. Ensure the file is a valid MP4, MOV, or WebM video.'));
    };

    video.src = objectUrl;
  });
}

export function getDefaultSubtitleStyle(template: CaptionTemplate): SubtitleStyle {
  switch (template) {
    case 'Viral Pop':
      return {
        enabled: true,
        template: 'Viral Pop',
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 24,
        textColor: '#FFFFFF',
        activeWordColor: '#FDE047',
        highlightActiveWord: true,
        includeEmojis: true,
        backgroundStyle: 'translucent',
        position: 'bottom',
      };
    case 'Classic':
      return {
        enabled: true,
        template: 'Classic',
        fontFamily: 'DM Sans',
        fontSize: 20,
        textColor: '#FFFFFF',
        activeWordColor: '#38BDF8',
        highlightActiveWord: true,
        includeEmojis: false,
        backgroundStyle: 'solid',
        position: 'bottom',
      };
    case 'Modern':
      return {
        enabled: true,
        template: 'Modern',
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 22,
        textColor: '#FFFFFF',
        activeWordColor: '#A78BFA',
        highlightActiveWord: true,
        includeEmojis: false,
        backgroundStyle: 'translucent',
        position: 'bottom',
      };
    case 'Highlight':
      return {
        enabled: true,
        template: 'Highlight',
        fontFamily: 'Oswald',
        fontSize: 25,
        textColor: '#FFFFFF',
        activeWordColor: '#FDE047',
        highlightActiveWord: true,
        includeEmojis: true,
        backgroundStyle: 'gradient',
        position: 'middle',
      };
    case 'Minimal':
      return {
        enabled: true,
        template: 'Minimal',
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 19,
        textColor: '#F8FAFC',
        activeWordColor: '#34D399',
        highlightActiveWord: false,
        includeEmojis: false,
        backgroundStyle: 'none',
        position: 'bottom',
      };
  }
}

export function buildWordTimestampsForSegment(
  text: string,
  startTime: number,
  endTime: number
): WordTimestamp[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const totalDur = Math.max(0.2, endTime - startTime);
  const totalWeight = tokens.reduce((acc, t) => acc + Math.max(2, t.length), 0);
  let cursor = startTime;

  return tokens.map((word) => {
    const share = (Math.max(2, word.length) / totalWeight) * totalDur;
    const wEnd = Math.min(endTime, cursor + share);
    const out: WordTimestamp = {
      word,
      start: Number(cursor.toFixed(3)),
      end: Number(Math.max(cursor + 0.08, wEnd).toFixed(3)),
    };
    cursor = wEnd;
    return out;
  });
}

export function interpolateCropAtTime(
  keyframes: CropKeyframe[],
  time: number
): { centerX: number; centerY: number; faceBox?: CropKeyframe['faceBox'] } {
  if (!keyframes || keyframes.length === 0) {
    return { centerX: 0.5, centerY: 0.48 };
  }
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  if (time <= sorted[0].time) {
    return {
      centerX: sorted[0].centerX,
      centerY: sorted[0].centerY,
      faceBox: sorted[0].faceBox,
    };
  }
  const last = sorted[sorted.length - 1];
  if (time >= last.time) {
    return {
      centerX: last.centerX,
      centerY: last.centerY,
      faceBox: last.faceBox,
    };
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (time >= a.time && time <= b.time) {
      const span = Math.max(0.001, b.time - a.time);
      const t = (time - a.time) / span;
      // Smoothstep easing for natural camera motion
      const smooth = t * t * (3 - 2 * t);
      return {
        centerX: a.centerX + (b.centerX - a.centerX) * smooth,
        centerY: a.centerY + (b.centerY - a.centerY) * smooth,
        faceBox: t < 0.5 ? a.faceBox : b.faceBox,
      };
    }
  }

  return { centerX: 0.5, centerY: 0.48 };
}

export function segmentsToSrt(segments: TranscriptSegment[], clipStartTime: number): string {
  const formatSrtTime = (sec: number) => {
    const safe = Math.max(0, sec);
    const hrs = Math.floor(safe / 3600);
    const mins = Math.floor((safe % 3600) / 60);
    const secs = Math.floor(safe % 60);
    const ms = Math.floor((safe - Math.floor(safe)) * 1000);
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  };

  return segments
    .map((seg, index) => {
      const start = Math.max(0, seg.startTime - clipStartTime);
      const end = Math.max(start + 0.5, seg.endTime - clipStartTime);
      return `${index + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${seg.text}`;
    })
    .join('\n\n');
}

export async function renderDemoClipToBlob(
  clip: GeneratedClip,
  sourceObjectUrl?: string
): Promise<{ blob: Blob; filename: string; isVideoStream: boolean }> {
  const safeSlug =
    clip.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'ytclip-export';

  const dimensions = (() => {
    const is1080 = clip.exportSettings.quality === '1080p';
    switch (clip.aspectRatio) {
      case '9:16':
        return is1080 ? { w: 720, h: 1280 } : { w: 540, h: 960 };
      case '1:1':
        return is1080 ? { w: 1080, h: 1080 } : { w: 720, h: 720 };
      case '16:9':
        return is1080 ? { w: 1280, h: 720 } : { w: 960, h: 540 };
    }
  })();

  const canRecordCanvas =
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function';

  if (!canRecordCanvas) {
    const srt = segmentsToSrt(clip.transcriptSegments, clip.startTime);
    const fallbackBlob = new Blob(
      [
        `YTClip Demo Export Package\nTitle: ${clip.title}\nAspect Ratio: ${clip.aspectRatio}\nQuality: ${clip.exportSettings.quality}\nRange: ${formatTimestamp(clip.startTime)} - ${formatTimestamp(clip.endTime)}\n\n--- Subtitles (SRT) ---\n${srt}\n`,
      ],
      { type: 'text/plain;charset=utf-8' }
    );
    return { blob: fallbackBlob, filename: `${safeSlug}-demo.txt`, isVideoStream: false };
  }

  const canvas = document.createElement('canvas');
  canvas.width = dimensions.w;
  canvas.height = dimensions.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const fallbackBlob = new Blob([JSON.stringify(clip, null, 2)], { type: 'application/json' });
    return { blob: fallbackBlob, filename: `${safeSlug}.json`, isVideoStream: false };
  }

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : MediaRecorder.isTypeSupported('video/webm')
      ? 'video/webm'
      : '';

  if (!mimeType) {
    const srt = segmentsToSrt(clip.transcriptSegments, clip.startTime);
    return {
      blob: new Blob([srt], { type: 'text/plain;charset=utf-8' }),
      filename: `${safeSlug}.srt`,
      isVideoStream: false,
    };
  }

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = clip.previewImageUrl;
  await new Promise<void>((resolve) => {
    img.onload = () => resolve();
    img.onerror = () => resolve();
  });

  let videoEl: HTMLVideoElement | null = null;
  if (sourceObjectUrl) {
    videoEl = document.createElement('video');
    videoEl.src = sourceObjectUrl;
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.currentTime = clip.startTime;
    await new Promise<void>((resolve) => {
      if (!videoEl) return resolve();
      const timer = window.setTimeout(resolve, 1200);
      videoEl.oncanplay = () => {
        window.clearTimeout(timer);
        resolve();
      };
      videoEl.onerror = () => {
        window.clearTimeout(timer);
        videoEl = null;
        resolve();
      };
    });
    if (videoEl) {
      videoEl.play().catch(() => {});
    }
  }

  const stream = canvas.captureStream(24);
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.start();

  const durationMs = 2400;
  const startPerf = performance.now();

  await new Promise<void>((resolve) => {
    const drawFrame = () => {
      const elapsed = performance.now() - startPerf;
      const progress = Math.min(1, elapsed / durationMs);
      const simTime = clip.startTime + progress * Math.max(1, clip.endTime - clip.startTime);
      const cropPos = interpolateCropAtTime(clip.cropKeyframes, simTime);

      ctx.fillStyle = '#0B0D12';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (videoEl && videoEl.readyState >= 2) {
        const vw = videoEl.videoWidth || 16;
        const vh = videoEl.videoHeight || 9;
        const scale = Math.max(canvas.width / vw, canvas.height / vh);
        const dw = vw * scale;
        const dh = vh * scale;
        const offsetX = Math.max(canvas.width - dw, Math.min(0, canvas.width / 2 - cropPos.centerX * dw));
        const offsetY = Math.max(canvas.height - dh, Math.min(0, canvas.height / 2 - cropPos.centerY * dh));
        ctx.drawImage(videoEl, offsetX, offsetY, dw, dh);
      } else if (img.complete && img.naturalWidth > 0) {
        const scale = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
        const dw = img.naturalWidth * scale;
        const dh = img.naturalHeight * scale;
        ctx.drawImage(img, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
      }

      const grad = ctx.createLinearGradient(0, canvas.height * 0.45, 0, canvas.height);
      grad.addColorStop(0, 'rgba(11,13,18,0)');
      grad.addColorStop(1, 'rgba(11,13,18,0.82)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (clip.subtitleStyle.enabled && clip.transcriptSegments.length > 0) {
        const segIdx = Math.min(
          clip.transcriptSegments.length - 1,
          Math.floor(progress * clip.transcriptSegments.length)
        );
        const caption = clip.transcriptSegments[segIdx]?.text ?? clip.suggestedHook;
        const scaledFont = Math.round(clip.subtitleStyle.fontSize * (canvas.width / 360));
        ctx.font = `700 ${scaledFont}px "Plus Jakarta Sans", sans-serif`;
        ctx.textAlign = 'center';

        const yPos =
          clip.subtitleStyle.position === 'top'
            ? canvas.height * 0.18
            : clip.subtitleStyle.position === 'middle'
              ? canvas.height * 0.52
              : canvas.height * 0.82;

        if (clip.subtitleStyle.backgroundStyle !== 'none') {
          const metrics = ctx.measureText(caption.slice(0, 38));
          const boxW = Math.min(canvas.width - 48, metrics.width + 36);
          const boxH = scaledFont * 1.9;
          ctx.fillStyle =
            clip.subtitleStyle.backgroundStyle === 'gradient'
              ? 'rgba(124, 58, 237, 0.86)'
              : clip.subtitleStyle.backgroundStyle === 'solid'
                ? 'rgba(11, 13, 18, 0.92)'
                : 'rgba(19, 22, 31, 0.72)';
          ctx.beginPath();
          ctx.roundRect((canvas.width - boxW) / 2, yPos - scaledFont * 1.1, boxW, boxH, 12);
          ctx.fill();
        }

        ctx.fillStyle = clip.subtitleStyle.textColor || '#FFFFFF';
        ctx.fillText(caption.slice(0, 38), canvas.width / 2, yPos);
      }

      if (elapsed < durationMs) {
        requestAnimationFrame(drawFrame);
      } else {
        resolve();
      }
    };
    requestAnimationFrame(drawFrame);
  });

  if (videoEl) {
    videoEl.pause();
    videoEl.src = '';
  }

  const blob = await new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: mimeType }));
    };
    recorder.stop();
  });

  return {
    blob,
    filename: `${safeSlug}-${clip.exportSettings.quality}.webm`,
    isVideoStream: true,
  };
}
