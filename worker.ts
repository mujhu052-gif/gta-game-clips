import dotenv from 'dotenv';
import os from 'node:os';
import { getServerConfig, ensureStorageDirectories } from './server/config';
import { getDb } from './server/database';
import { processQueuedJob } from './server/pipelineRunner';
import { runStartupHealthCheck } from './server/startupCheck';

dotenv.config();

let shuttingDown = false;
const activeJobs = new Set<Promise<void>>();

export function startEmbeddedWorkerLoop(workerLabel = 'embedded'): () => void {
  const cfg = getServerConfig();
  ensureStorageDirectories(cfg);
  const db = getDb();
  const workerId = `${workerLabel}-${os.hostname()}-${process.pid}`;

  // Recover any stale locks from a prior crash on startup
  const recovered = db.recoverStaleJobs(25);
  if (recovered > 0) {
    console.log(`[YTClip Worker] Recovered ${recovered} stale processing job(s) back to queue.`);
  }

  let cleanupCounter = 0;

  const tick = () => {
    if (shuttingDown) return;

    cleanupCounter += 1;
    if (cleanupCounter % 180 === 0) {
      try {
        const cleaned = db.cleanupExpiredProjects(cfg.storageRetentionHours);
        if (cleaned > 0) {
          console.log(`[YTClip Worker] Retention cleanup removed ${cleaned} expired project(s).`);
        }
      } catch (err) {
        console.error('[YTClip Worker] Retention cleanup error:', err);
      }
    }

    try {
      while (!shuttingDown && activeJobs.size < cfg.maxConcurrentJobs) {
        const job = db.claimNextQueuedJob(workerId, cfg.maxConcurrentJobs);
        if (!job) break;

        console.log(
          `[YTClip Worker] Claimed job ${job.id} (project=${job.projectId}, attempt=${job.attempts}/${job.maxAttempts})`
        );

        const promise = processQueuedJob(job)
          .catch((err) => {
            console.error(`[YTClip Worker] Unhandled error in job ${job.id}:`, err);
          })
          .finally(() => {
            activeJobs.delete(promise);
          });

        activeJobs.add(promise);
      }
    } catch (err) {
      console.error('[YTClip Worker] Queue poll error:', err);
    }
  };

  const interval = setInterval(tick, 1000);
  // Run initial check quickly
  setTimeout(tick, 250);

  return () => {
    shuttingDown = true;
    clearInterval(interval);
  };
}

async function runStandaloneWorker() {
  const cfg = getServerConfig();
  ensureStorageDirectories(cfg);

  console.log('[YTClip Worker] Starting standalone background worker...');
  const caps = await runStartupHealthCheck(false);
  console.log(`[YTClip Worker] Startup capability check: ${caps.modeLabel}`);
  if (!caps.readyForAiProcessing) {
    console.warn(
      `[YTClip Worker] WARNING: Missing production AI dependencies: ${(caps.missingDependencies ?? []).join(', ')}. Jobs requiring faster-whisper or OpenCV will fail honestly until installed.`
    );
  }

  const stopLoop = startEmbeddedWorkerLoop('worker');

  const shutdown = async (signal: string) => {
    console.log(`[YTClip Worker] Received ${signal}, draining ${activeJobs.size} active job(s)...`);
    stopLoop();
    if (activeJobs.size > 0) {
      await Promise.race([
        Promise.allSettled(Array.from(activeJobs)),
        new Promise((resolve) => setTimeout(resolve, 15000)),
      ]);
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

// Execute standalone worker only when invoked directly (`tsx worker.ts`)
const invokedScript = process.argv[1] || '';
if (invokedScript.endsWith('worker.ts') || invokedScript.endsWith('worker.js')) {
  runStandaloneWorker().catch((err) => {
    console.error('[YTClip Worker] Fatal startup failure:', err);
    process.exit(1);
  });
}
