import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  AspectRatio,
  CropKeyframe,
  ExportQuality,
  QualityCheckReport,
  SubtitleStyle,
  TranscriptSegment,
} from '../src/types/video';
import { getServerConfig } from './config';
import { generateAnimatedAssSubtitles } from './subtitleAss';

const execFileAsync = promisify(execFile);

export interface PythonEngineOptions {
  timeoutMs?: number;
  outputJsonPath?: string;
  isCancelled?: () => boolean;
}

export async function runPythonEngine<T>(
  args: string[],
  timeoutOrOptions?: number | PythonEngineOptions
): Promise<T> {
  const cfg = getServerConfig();
  const opts: PythonEngineOptions =
    typeof timeoutOrOptions === 'number' ? { timeoutMs: timeoutOrOptions } : timeoutOrOptions ?? {};

  const scriptPath = path.resolve(process.cwd(), 'python', 'ytclip_engine.py');
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Python engine script not found at ${scriptPath}`);
  }

  const finalArgs = [...args];
  if (opts.outputJsonPath && !finalArgs.includes('--output-json')) {
    finalArgs.push('--output-json', opts.outputJsonPath);
  }

  const timeoutMs = opts.timeoutMs ?? cfg.jobTimeoutMs;

  return new Promise<T>((resolve, reject) => {
    const child = spawn(cfg.pythonBin, [scriptPath, ...finalArgs], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        HF_HUB_DISABLE_PROGRESS_BARS: '1',
        TOKENIZERS_PARALLELISM: 'false',
      },
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;

    const cleanupTimers = (timeoutHandle?: NodeJS.Timeout, cancelHandle?: NodeJS.Timeout) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (cancelHandle) clearInterval(cancelHandle);
    };

    const timeoutHandle = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 1500).unref();
      cleanupTimers(undefined, cancelHandle);
      const stderrText = Buffer.concat(stderrChunks).toString('utf8').slice(-1200);
      reject(
        new Error(
          `Python engine (${args[0] || 'run'}) timed out after ${Math.round(timeoutMs / 1000)}s.${stderrText ? ` Last stderr: ${stderrText}` : ''}`
        )
      );
    }, timeoutMs);

    const cancelHandle = opts.isCancelled
      ? setInterval(() => {
          if (settled) return;
          try {
            if (opts.isCancelled?.()) {
              settled = true;
              child.kill('SIGTERM');
              setTimeout(() => child.kill('SIGKILL'), 1000).unref();
              cleanupTimers(timeoutHandle, cancelHandle);
              reject(new Error('CANCELLED'));
            }
          } catch {
            // ignore cancellation check errors
          }
        }, 700)
      : undefined;

    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
      const text = chunk.toString('utf8').trim();
      if (text) {
        console.log(`[YTClip Python:${args[0] || 'engine'}] ${text}`);
      }
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      cleanupTimers(timeoutHandle, cancelHandle);
      reject(
        new Error(
          `Failed to start Python binary "${cfg.pythonBin}": ${err.message}. Run \`npm run setup:python\` to install the Python AI environment.`
        )
      );
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      cleanupTimers(timeoutHandle, cancelHandle);

      const stdoutText = Buffer.concat(stdoutChunks).toString('utf8').trim();
      const stderrText = Buffer.concat(stderrChunks).toString('utf8').trim();

      if (code !== 0) {
        reject(
          new Error(
            `Python engine (${args[0] || 'run'}) exited with code ${code}.${stderrText ? ` Error: ${stderrText.slice(-1500)}` : ''}`
          )
        );
        return;
      }

      try {
        if (opts.outputJsonPath && fs.existsSync(opts.outputJsonPath)) {
          const filePayload = fs.readFileSync(opts.outputJsonPath, 'utf8');
          resolve(JSON.parse(filePayload) as T);
          return;
        }
        if (!stdoutText) {
          throw new Error(
            `Python engine returned empty output.${stderrText ? ` stderr: ${stderrText.slice(-800)}` : ''}`
          );
        }
        resolve(JSON.parse(stdoutText) as T);
      } catch (parseErr) {
        reject(
          new Error(
            `Failed to parse Python engine JSON output: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}.${stderrText ? ` stderr: ${stderrText.slice(-800)}` : ''}`
          )
        );
      }
    });
  });
}

export interface VideoProbeInfo {
  durationSeconds: number;
  width: number;
  height: number;
  hasAudio: boolean;
  videoCodec: string;
  audioCodec: string;
}

export async function probeVideoFile(videoPath: string): Promise<VideoProbeInfo> {
  const { stdout } = await execFileAsync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration:stream=index,codec_type,codec_name,width,height',
      '-of',
      'json',
      videoPath,
    ],
    { timeout: 15000 }
  );

  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
    }>;
  };

  const streams = parsed.streams ?? [];
  const videoStream = streams.find((s) => s.codec_type === 'video');
  const audioStream = streams.find((s) => s.codec_type === 'audio');

  if (!videoStream) {
    throw new Error('Uploaded file does not contain a readable video stream.');
  }

  const durationSeconds = Number(parsed.format?.duration ?? 0);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error('Could not determine a valid positive video duration.');
  }

  return {
    durationSeconds,
    width: videoStream.width || 1920,
    height: videoStream.height || 1080,
    hasAudio: Boolean(audioStream),
    videoCodec: videoStream.codec_name || 'unknown',
    audioCodec: audioStream?.codec_name || 'none',
  };
}

export async function extractAudioWav(videoPath: string, wavPath: string): Promise<void> {
  const cfg = getServerConfig();
  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      videoPath,
      '-vn',
      '-acodec',
      'pcm_s16le',
      '-ar',
      '16000',
      '-ac',
      '1',
      wavPath,
    ],
    { timeout: cfg.jobTimeoutMs }
  );
}

export async function extractThumbnailFrame(
  videoPath: string,
  timestampSec: number,
  jpgPath: string
): Promise<void> {
  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      Math.max(0, timestampSec).toFixed(2),
      '-i',
      videoPath,
      '-frames:v',
      '1',
      '-q:v',
      '3',
      jpgPath,
    ],
    { timeout: 25000 }
  );
}

export function getTargetDimensions(
  aspectRatio: AspectRatio,
  quality: ExportQuality,
  sourceW: number,
  sourceH: number
): { width: number; height: number } {
  const is1080 = quality === '1080p';
  const allow1080 = sourceW >= 720 || sourceH >= 720;
  const high = is1080 && allow1080;

  switch (aspectRatio) {
    case '9:16':
      return high ? { width: 1080, height: 1920 } : { width: 720, height: 1280 };
    case '1:1':
      return high ? { width: 1080, height: 1080 } : { width: 720, height: 720 };
    case '16:9':
      return high ? { width: 1920, height: 1080 } : { width: 1280, height: 720 };
  }
}

function buildPiecewiseExpr(
  points: Array<{ t: number; val: number }>,
  minVal: number,
  maxVal: number
): string {
  const clamp = (v: number) => Math.max(minVal, Math.min(maxVal, Math.round(v)));
  if (points.length === 0) return String(clamp((minVal + maxVal) / 2));
  if (points.length === 1) return String(clamp(points[0].val));

  let expr = String(clamp(points[points.length - 1].val));
  for (let i = points.length - 2; i >= 0; i--) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const v0 = clamp(p0.val);
    const v1 = clamp(p1.val);
    const dt = Math.max(0.01, p1.t - p0.t);
    const t0 = p0.t.toFixed(3);
    const t1 = p1.t.toFixed(3);

    const segExpr =
      v0 === v1 ? String(v0) : `(${v0}+(${v1 - v0})*(t-${t0})/${dt.toFixed(3)})`;
    expr = `if(lt(t,${t1}),${segExpr},${expr})`;
  }
  return expr;
}

export function buildDynamicCropFilter(params: {
  sourceW: number;
  sourceH: number;
  targetW: number;
  targetH: number;
  clipStart: number;
  keyframes: CropKeyframe[];
}): string {
  const { sourceW, sourceH, targetW, targetH, clipStart, keyframes } = params;
  const targetAspect = targetW / targetH;
  const sourceAspect = sourceW / sourceH;

  let cropW = sourceW;
  let cropH = sourceH;
  if (sourceAspect > targetAspect) {
    cropH = sourceH;
    cropW = Math.floor((sourceH * targetAspect) / 2) * 2;
  } else {
    cropW = sourceW;
    cropH = Math.floor((sourceW / targetAspect) / 2) * 2;
  }

  cropW = Math.max(2, Math.min(sourceW, cropW));
  cropH = Math.max(2, Math.min(sourceH, cropH));

  const maxX = Math.max(0, sourceW - cropW);
  const maxY = Math.max(0, sourceH - cropH);

  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  const xPoints = sorted.map((k) => ({
    t: Math.max(0, k.time - clipStart),
    val: k.centerX * sourceW - cropW / 2,
  }));
  const yPoints = sorted.map((k) => ({
    t: Math.max(0, k.time - clipStart),
    val: k.centerY * sourceH - cropH / 2,
  }));

  const xExpr = buildPiecewiseExpr(xPoints, 0, maxX);
  const yExpr = buildPiecewiseExpr(yPoints, 0, maxY);

  return `crop=${cropW}:${cropH}:'${xExpr}':'${yExpr}'`;
}

export async function renderClipWithFFmpeg(params: {
  sourceVideoPath: string;
  sourceW: number;
  sourceH: number;
  sourceHasAudio: boolean;
  clipStart: number;
  clipEnd: number;
  aspectRatio: AspectRatio;
  quality: ExportQuality;
  keyframes: CropKeyframe[];
  subtitleStyle: SubtitleStyle;
  transcriptSegments: TranscriptSegment[];
  outputMp4Path: string;
  assPath: string;
  trackingEngine: string;
}): Promise<QualityCheckReport> {
  const cfg = getServerConfig();
  const {
    sourceVideoPath,
    sourceW,
    sourceH,
    sourceHasAudio,
    clipStart,
    clipEnd,
    aspectRatio,
    quality,
    keyframes,
    subtitleStyle,
    transcriptSegments,
    outputMp4Path,
    assPath,
    trackingEngine,
  } = params;

  const duration = Math.max(1, clipEnd - clipStart);
  const { width: targetW, height: targetH } = getTargetDimensions(
    aspectRatio,
    quality,
    sourceW,
    sourceH
  );

  const assContent = generateAnimatedAssSubtitles({
    segments: transcriptSegments,
    style: subtitleStyle,
    clipStart,
    clipEnd,
    playResX: targetW,
    playResY: targetH,
    cropKeyframes: keyframes,
  });
  fs.writeFileSync(assPath, assContent, 'utf-8');

  const cropFilter = buildDynamicCropFilter({
    sourceW,
    sourceH,
    targetW,
    targetH,
    clipStart,
    keyframes,
  });

  const filters = [cropFilter, `scale=${targetW}:${targetH}:flags=lanczos`];
  if (subtitleStyle.enabled && transcriptSegments.length > 0) {
    const escapedAssPath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    filters.push(`ass='${escapedAssPath}'`);
  }

  const ffArgs = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-ss',
    clipStart.toFixed(3),
    '-t',
    duration.toFixed(3),
    '-i',
    sourceVideoPath,
    '-vf',
    filters.join(','),
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
  ];

  if (sourceHasAudio) {
    ffArgs.push('-c:a', 'aac', '-b:a', '192k', '-ar', '48000');
  } else {
    ffArgs.push('-an');
  }

  ffArgs.push('-movflags', '+faststart', outputMp4Path);

  await execFileAsync('ffmpeg', ffArgs, { timeout: cfg.jobTimeoutMs });

  return verifyRenderedClip({
    outputMp4Path,
    expectedWidth: targetW,
    expectedHeight: targetH,
    expectedDuration: duration,
    expectAudio: sourceHasAudio,
    captionsBurned: subtitleStyle.enabled && transcriptSegments.length > 0,
    speakerTracked: trackingEngine !== 'center-fallback' && keyframes.length >= 2,
  });
}

export async function verifyRenderedClip(params: {
  outputMp4Path: string;
  expectedWidth: number;
  expectedHeight: number;
  expectedDuration: number;
  expectAudio: boolean;
  captionsBurned: boolean;
  speakerTracked: boolean;
}): Promise<QualityCheckReport> {
  const {
    outputMp4Path,
    expectedWidth,
    expectedHeight,
    expectedDuration,
    expectAudio,
    captionsBurned,
    speakerTracked,
  } = params;

  const notes: string[] = [];
  const fileExists = fs.existsSync(outputMp4Path) && fs.statSync(outputMp4Path).size > 1024;
  if (!fileExists) {
    return {
      passed: false,
      fileExists: false,
      playable: false,
      hasAudio: false,
      audioSynced: false,
      captionsBurned,
      speakerTracked,
      durationVerified: false,
      resolutionVerified: false,
      actualWidth: 0,
      actualHeight: 0,
      actualDuration: 0,
      notes: ['Rendered MP4 file missing or empty.'],
    };
  }

  const info = await probeVideoFile(outputMp4Path);
  const resolutionVerified = info.width === expectedWidth && info.height === expectedHeight;
  const durationDelta = Math.abs(info.durationSeconds - expectedDuration);
  const durationVerified = durationDelta <= 1.2;
  const hasAudio = expectAudio ? info.hasAudio : true;
  const audioSynced = hasAudio && durationVerified;
  const playable = info.videoCodec === 'h264' && info.durationSeconds > 0;

  notes.push(
    resolutionVerified
      ? `Verified ${info.width}x${info.height} H.264 output`
      : `Resolution mismatch: expected ${expectedWidth}x${expectedHeight}, got ${info.width}x${info.height}`
  );
  notes.push(
    durationVerified
      ? `Verified ${info.durationSeconds.toFixed(1)}s duration`
      : `Duration delta ${durationDelta.toFixed(2)}s exceeds tolerance`
  );
  if (info.hasAudio) notes.push(`Verified ${info.audioCodec.toUpperCase()} audio stream`);
  if (captionsBurned) notes.push('Animated ASS captions burned into video');
  if (speakerTracked) notes.push('Dynamic speaker-tracked crop keyframes applied');

  const passed = fileExists && playable && hasAudio && durationVerified && resolutionVerified;

  return {
    passed,
    fileExists,
    playable,
    hasAudio,
    audioSynced,
    captionsBurned,
    speakerTracked,
    durationVerified,
    resolutionVerified,
    actualWidth: info.width,
    actualHeight: info.height,
    actualDuration: Number(info.durationSeconds.toFixed(2)),
    notes,
  };
}
