import fs from 'node:fs';
import path from 'node:path';
import {
  CropKeyframe,
  GeneratedClip,
  Highlight,
  ProcessingStage,
  TranscriptSegment,
} from '../src/types/video';
import { getDefaultSubtitleStyle } from '../src/utils/formatters';
import { getServerConfig, resolveConfinedPath } from './config';
import { getDb, JobRecord } from './database';
import {
  extractAudioWav,
  extractThumbnailFrame,
  probeVideoFile,
  renderClipWithFFmpeg,
  runPythonEngine,
} from './ffmpegPipeline';
import { runStartupHealthCheck } from './startupCheck';

export async function processQueuedJob(job: JobRecord): Promise<void> {
  const cfg = getServerConfig();
  const db = getDb();
  const jobTempDir = path.join(cfg.workDir, `job-${job.id}`);
  fs.mkdirSync(jobTempDir, { recursive: true });

  const isJobCancelled = () => {
    const latest = db.getJob(job.id);
    return latest?.status === 'cancelled';
  };

  const ensureNotCancelled = () => {
    if (isJobCancelled()) {
      throw new Error('CANCELLED');
    }
  };

  const setStage = (stage: ProcessingStage, progress: number, message: string) => {
    ensureNotCancelled();
    db.updateJob(job.id, {
      currentStage: stage,
      progress,
      message,
      lockedAt: new Date().toISOString(),
    });
  };

  try {
    const project = db.getProject(job.projectId, job.workspaceId);
    if (!project) {
      throw new Error('Project record not found in database.');
    }

    db.updateProjectStatus(project.id, 'processing');

    // Pre-flight runtime verification (Python, faster-whisper, OpenCV, FFmpeg)
    const runtimeCaps = await runStartupHealthCheck(false);
    if (!runtimeCaps.fasterWhisperAvailable) {
      throw new Error(
        `faster-whisper is not installed on this server (checked ${runtimeCaps.pythonPath}). Run \`npm run setup:python\` to install python/requirements.txt.`
      );
    }

    const sourcePath = resolveConfinedPath(cfg.uploadsDir, project.sourceVideo.id);
    if (!fs.existsSync(sourcePath)) {
      throw new Error('Source video file is missing from persistent server storage.');
    }

    // 1. Validate source video streams
    setStage('validating', 8, '1/10 Validating source video streams with FFprobe...');
    const probe = await probeVideoFile(sourcePath);

    // 2. Extract audio with FFmpeg
    setStage('extracting_audio', 18, '2/10 Extracting 16kHz mono PCM audio with FFmpeg...');
    const wavPath = path.join(jobTempDir, 'audio.wav');
    if (!probe.hasAudio) {
      throw new Error(
        'Source video does not contain an audio track. Speech transcription requires an audio stream.'
      );
    }
    await extractAudioWav(sourcePath, wavPath);

    // 3. Transcribe speech with faster-whisper
    setStage(
      'transcribing',
      32,
      `3/10 Transcribing speech with faster-whisper (${cfg.whisperModel})...`
    );
    const transcriptJsonPath = path.join(jobTempDir, 'transcript.json');
    const transcriptResult = await runPythonEngine<{
      engine: 'faster-whisper' | 'unavailable';
      error?: string;
      language?: string;
      segments: TranscriptSegment[];
    }>(
      [
        'transcribe',
        '--audio',
        wavPath,
        '--model',
        cfg.whisperModel,
        '--model-dir',
        cfg.modelDir,
      ],
      {
        timeoutMs: cfg.jobTimeoutMs,
        outputJsonPath: transcriptJsonPath,
        isCancelled: isJobCancelled,
      }
    );

    if (transcriptResult.engine !== 'faster-whisper') {
      throw new Error(
        transcriptResult.error ||
          'faster-whisper AI transcription is unavailable on this server.'
      );
    }

    if (transcriptResult.segments.length === 0) {
      throw new Error(
        'faster-whisper produced zero spoken segments. Verify the video contains audible speech.'
      );
    }

    // 4. Analyze transcript and audio for viral highlight detection
    setStage(
      'analyzing_highlights',
      46,
      '4/10 Scoring transcript hooks, vocal RMS energy, silence gaps & scene changes...'
    );
    const highlightsJsonPath = path.join(jobTempDir, 'highlights.json');
    const hlRes = await runPythonEngine<{
      highlights: Array<Omit<Highlight, 'projectId'>>;
    }>(
      [
        'highlights',
        '--video',
        sourcePath,
        '--audio',
        wavPath,
        '--transcript-json',
        transcriptJsonPath,
        '--duration',
        String(probe.durationSeconds),
        '--target-duration',
        String(project.clipSettings.targetDuration),
      ],
      {
        timeoutMs: cfg.jobTimeoutMs,
        outputJsonPath: highlightsJsonPath,
        isCancelled: isJobCancelled,
      }
    );

    const projectHighlights: Highlight[] = hlRes.highlights.map((h, i) => ({
      ...h,
      id: `hl-${project.id}-${i + 1}`,
      projectId: project.id,
    }));

    // 5. Select candidate clips
    setStage('generating_candidates', 56, '5/10 Selecting top-ranked candidate highlight windows...');
    const selectedHighlights = projectHighlights.filter((h) => h.selected);
    const candidateList =
      selectedHighlights.length > 0 ? selectedHighlights : projectHighlights.slice(0, 2);

    const generatedClips: GeneratedClip[] = [];

    for (let idx = 0; idx < candidateList.length; idx++) {
      ensureNotCancelled();
      const hl = candidateList[idx];
      const clipId = `clip-${project.id}-${idx + 1}-${Date.now().toString().slice(-4)}`;

      // 6. Detect and track active speaker with OpenCV
      setStage(
        'tracking_speaker',
        58 + Math.round((idx / Math.max(1, candidateList.length)) * 12),
        `6/10 Tracking speaker faces with OpenCV for Clip ${idx + 1}/${candidateList.length}...`
      );
      const trackJsonPath = path.join(jobTempDir, `track-${idx + 1}.json`);
      const trackRes = await runPythonEngine<{
        engine: 'opencv-face' | 'center-fallback' | 'unavailable';
        error?: string;
        keyframes: CropKeyframe[];
      }>(
        ['track', '--video', sourcePath, '--start', String(hl.startTime), '--end', String(hl.endTime)],
        {
          timeoutMs: cfg.jobTimeoutMs,
          outputJsonPath: trackJsonPath,
          isCancelled: isJobCancelled,
        }
      );

      if (trackRes.engine === 'unavailable') {
        throw new Error(
          trackRes.error || 'OpenCV (cv2) speaker tracking is unavailable on this server.'
        );
      }

      // 7. Smooth crop keyframes
      setStage(
        'generating_keyframes',
        72,
        `7/10 Smoothing ${trackRes.keyframes.length} speaker crop keyframes for Clip ${idx + 1}...`
      );

      // 8. Generate synchronized animated captions
      setStage(
        'generating_captions',
        80,
        `8/10 Generating word-level animated ASS captions for Clip ${idx + 1}...`
      );
      const clipSegments = transcriptResult.segments.filter(
        (s) => s.endTime >= hl.startTime && s.startTime <= hl.endTime
      );
      const effectiveSegments =
        clipSegments.length > 0
          ? clipSegments
          : [
              {
                id: `seg-${clipId}-1`,
                startTime: hl.startTime,
                endTime: hl.endTime,
                text: hl.suggestedHook,
              },
            ];

      const subtitleStyle = getDefaultSubtitleStyle(project.clipSettings.captionTemplate);
      if (project.clipSettings.includeEmojis !== undefined) {
        subtitleStyle.includeEmojis = project.clipSettings.includeEmojis;
      }

      const thumbFilename = `${clipId}.jpg`;
      const thumbPath = resolveConfinedPath(cfg.thumbsDir, thumbFilename);
      await extractThumbnailFrame(sourcePath, (hl.startTime + hl.endTime) / 2, thumbPath);

      // 9. Render MP4 with FFmpeg & verify output
      setStage(
        'rendering_clips',
        85 + Math.round((idx / Math.max(1, candidateList.length)) * 11),
        `9/10 Rendering H.264/AAC MP4 with FFmpeg (${idx + 1}/${candidateList.length})...`
      );
      const mp4Filename = `${clipId}.mp4`;
      const mp4Path = resolveConfinedPath(cfg.rendersDir, mp4Filename);
      const assPath = path.join(jobTempDir, `${clipId}.ass`);

      const qualityCheck = await renderClipWithFFmpeg({
        sourceVideoPath: sourcePath,
        sourceW: probe.width,
        sourceH: probe.height,
        sourceHasAudio: probe.hasAudio,
        clipStart: hl.startTime,
        clipEnd: hl.endTime,
        aspectRatio: project.clipSettings.aspectRatio,
        quality: project.clipSettings.exportQuality,
        keyframes: trackRes.keyframes,
        subtitleStyle,
        transcriptSegments: effectiveSegments,
        outputMp4Path: mp4Path,
        assPath,
        trackingEngine: trackRes.engine,
      });

      if (!qualityCheck.passed) {
        throw new Error(`Post-render quality verification failed: ${qualityCheck.notes.join('; ')}`);
      }

      generatedClips.push({
        id: clipId,
        projectId: project.id,
        highlightId: hl.id,
        title: `Clip ${idx + 1}: ${hl.suggestedHook.slice(0, 38)}`,
        startTime: hl.startTime,
        endTime: hl.endTime,
        durationSeconds: Math.max(1, Math.round(hl.endTime - hl.startTime)),
        aspectRatio: project.clipSettings.aspectRatio,
        suggestedHook: hl.suggestedHook,
        selectionReason: hl.selectionReason,
        highlightScore: hl.highlightScore,
        suggestedTitle: `${hl.suggestedHook} | YTClip`,
        suggestedHashtags: ['#Shorts', '#Reels', '#YTClip'],
        subtitleStatus: 'auto-generated',
        subtitleStyle,
        transcriptSegments: effectiveSegments,
        cropKeyframes: trackRes.keyframes,
        autoCropKeyframes: trackRes.keyframes,
        trackingEngine: trackRes.engine === 'opencv-face' ? 'opencv-face' : 'center-fallback',
        transcriptionEngine: 'faster-whisper',
        exportSettings: {
          format: 'mp4',
          quality: project.clipSettings.exportQuality,
          aspectRatio: project.clipSettings.aspectRatio,
        },
        previewImageUrl: `/api/media/thumbs/${thumbFilename}`,
        renderedUrl: `/api/media/renders/${mp4Filename}`,
        isDemoSample: false,
        qualityCheck,
        updatedAt: new Date().toISOString(),
      });
    }

    // 10. Save finished clips & metadata to SQLite
    setStage('saving_metadata', 98, '10/10 Saving finished clips, keyframes & verified quality data...');
    db.saveTranscript(project.id, transcriptResult.engine, transcriptResult.segments);
    db.replaceHighlights(project.id, job.workspaceId, projectHighlights);
    db.replaceProjectClips(project.id, job.workspaceId, generatedClips);
    db.updateProjectStatus(project.id, 'completed', generatedClips.length);

    db.updateJob(job.id, {
      status: 'completed',
      currentStage: 'saving_metadata',
      progress: 100,
      canCancel: false,
      message: `Completed: rendered ${generatedClips.length} verified MP4 clip(s).`,
      completedAt: new Date().toISOString(),
    });
  } catch (err) {
    const isCancelled = err instanceof Error && err.message === 'CANCELLED';
    const rawMsg = err instanceof Error ? err.message : 'Unknown worker error.';
    const stack = err instanceof Error ? err.stack : String(err);

    if (isCancelled) {
      db.updateProjectStatus(job.projectId, 'cancelled');
      db.updateJob(job.id, {
        status: 'cancelled',
        canCancel: false,
        message: 'Processing cancelled by user.',
      });
      return;
    }

    // Retry if transient and attempts < maxAttempts (skip retry if dependency is missing)
    const isMissingDep =
      rawMsg.includes('not installed') || rawMsg.includes('does not contain an audio');
    const canRetry = !isMissingDep && job.attempts < job.maxAttempts;

    if (canRetry) {
      db.updateJob(job.id, {
        status: 'queued',
        message: `Retrying after error (attempt ${job.attempts}/${job.maxAttempts}): ${rawMsg}`,
        errorLog: stack,
        workerId: undefined,
        lockedAt: undefined,
      });
    } else {
      db.updateProjectStatus(job.projectId, 'error');
      db.updateJob(job.id, {
        status: 'error',
        canCancel: false,
        message: 'Processing failed on server.',
        errorDetails: rawMsg,
        errorLog: stack,
      });
    }
  } finally {
    // Always clean up isolated job temp directory
    try {
      fs.rmSync(jobTempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}
