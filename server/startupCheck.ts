import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { EngineCapabilities } from '../src/types/video';
import { ensureStorageDirectories, getServerConfig } from './config';

const execFileAsync = promisify(execFile);

export async function runStartupHealthCheck(verifyWhisperModelLoad = false): Promise<EngineCapabilities> {
  const cfg = getServerConfig();
  ensureStorageDirectories(cfg);

  const missingDependencies: string[] = [];
  let ffmpegAvailable = false;
  let ffprobeAvailable = false;
  let fasterWhisperAvailable = false;
  let opencvAvailable = false;
  let numpyAvailable = false;
  let whisperModelReady = false;
  let pythonPath = cfg.pythonBin;

  try {
    const { stdout: encOut } = await execFileAsync('ffmpeg', ['-encoders'], { timeout: 5000 });
    const hasX264 = encOut.includes('libx264');
    const hasAac = encOut.includes('aac');
    ffmpegAvailable = hasX264 && hasAac;
    if (!ffmpegAvailable) {
      missingDependencies.push('ffmpeg (with libx264 and aac encoders)');
    }
  } catch {
    missingDependencies.push('ffmpeg');
  }

  try {
    await execFileAsync('ffprobe', ['-version'], { timeout: 5000 });
    ffprobeAvailable = true;
  } catch {
    missingDependencies.push('ffprobe');
  }

  try {
    const scriptPath = path.resolve(process.cwd(), 'python', 'ytclip_engine.py');
    const pyArgs = [scriptPath, 'capabilities', '--model', cfg.whisperModel, '--model-dir', cfg.modelDir];
    if (verifyWhisperModelLoad) {
      pyArgs.push('--verify-model');
    }
    const { stdout } = await execFileAsync(cfg.pythonBin, pyArgs, {
      timeout: verifyWhisperModelLoad ? 120000 : 8000,
    });
    const pyCaps = JSON.parse(stdout) as {
      fasterWhisperAvailable?: boolean;
      ctranslate2Available?: boolean;
      avAvailable?: boolean;
      opencvAvailable?: boolean;
      numpyAvailable?: boolean;
      whisperModelReady?: boolean;
      whisperModelError?: string;
      pythonExecutable?: string;
    };
    fasterWhisperAvailable =
      Boolean(pyCaps.fasterWhisperAvailable) &&
      Boolean(pyCaps.ctranslate2Available) &&
      Boolean(pyCaps.avAvailable);
    opencvAvailable = Boolean(pyCaps.opencvAvailable);
    numpyAvailable = Boolean(pyCaps.numpyAvailable);
    whisperModelReady = Boolean(pyCaps.whisperModelReady);
    if (pyCaps.pythonExecutable) pythonPath = pyCaps.pythonExecutable;
    if (pyCaps.whisperModelError) {
      missingDependencies.push(`Whisper model (${cfg.whisperModel}): ${pyCaps.whisperModelError}`);
    }
  } catch {
    missingDependencies.push('python3 runtime');
  }

  if (!fasterWhisperAvailable) missingDependencies.push('faster-whisper / ctranslate2 / av');
  if (!opencvAvailable) missingDependencies.push('opencv-python-headless (cv2)');
  if (!numpyAvailable) missingDependencies.push('numpy');

  let storageWritable = false;
  try {
    const probeFile = path.join(cfg.dataRoot, '.write_probe');
    fs.writeFileSync(probeFile, 'ok');
    fs.unlinkSync(probeFile);
    storageWritable = true;
  } catch {
    missingDependencies.push('writable storage directory');
  }

  const readyForAiProcessing =
    ffmpegAvailable &&
    ffprobeAvailable &&
    fasterWhisperAvailable &&
    opencvAvailable &&
    storageWritable;

  const modeLabel = readyForAiProcessing
    ? `Production AI Server Ready (FFmpeg + faster-whisper:${cfg.whisperModel}${whisperModelReady ? ' [cached]' : ''} + OpenCV)`
    : `Incomplete Server Dependencies — Missing: ${missingDependencies.join(', ')}`;

  return {
    backendOnline: true,
    ffmpegAvailable,
    ffprobeAvailable,
    fasterWhisperAvailable,
    opencvAvailable,
    whisperModelReady,
    whisperModelName: cfg.whisperModel,
    readyForAiProcessing,
    requireRealAi: cfg.requireRealAi,
    pythonPath,
    missingDependencies,
    modeLabel,
  };
}
