# YTClip — Free AI Video Clipping Platform

**Turn Long Videos Into Viral-Ready Shorts.**

YTClip is a full-stack React + TypeScript + Express + SQLite Job Queue + FFmpeg + Python (`faster-whisper` + `OpenCV`) SaaS platform for transforming long-form videos into short-form clips with AI speech transcription, highlight detection, speaker-tracked dynamic 9:16 crop keyframes, animated word-highlighted captions, and watermark-free H.264/AAC MP4 exports.

- **100% Free & Open-Source Stack** — No paid AI APIs, no mandatory registration, and zero watermarks.
- **Production Server Architecture** — Separated frontend (`src/`), Express API (`server.ts`), SQLite WAL persistent queue (`server/database.ts`), standalone background worker (`worker.ts`), and Python/FFmpeg engine (`python/ytclip_engine.py`, `server/ffmpegPipeline.ts`).
- **Chunked Streaming Uploads & Per-Workspace Isolation** — Multi-chunk streaming disk uploads, HMAC-signed media URLs, `X-Workspace-Token` workspace isolation, rate limiting, and resume-after-refresh job tracking.

---

## Project Structure

```text
├── server.ts                      # Express API server, chunked uploads, signed media, CORS & rate limiting
├── worker.ts                      # Standalone background worker process polling SQLite job queue
├── server/
│   ├── config.ts                  # Env-driven server paths, limits, signing secret & concurrency config
│   ├── database.ts                # SQLite (node:sqlite WAL) projects, clips, highlights, jobs & upload sessions
│   ├── startupCheck.ts            # Startup capability check verifying FFmpeg, faster-whisper, OpenCV & Whisper model
│   ├── pipelineRunner.ts          # 10-stage background job processor with isolated temp dirs & retries
│   ├── ffmpegPipeline.ts          # FFprobe validation, dynamic crop keyframes, H.264/AAC rendering & quality checks
│   └── subtitleAss.ts             # ASS animated word-highlighting subtitle generator + safe-area placement
├── python/
│   ├── requirements.txt           # faster-whisper, opencv-python-headless, numpy
│   └── ytclip_engine.py           # Whisper ASR, multi-signal highlight scoring, OpenCV face & lip-motion tracking
├── deploy/
│   ├── DEPLOYMENT.md              # Full Ubuntu VPS + Docker + Nginx + HTTPS Certbot deployment guide
│   ├── install-vps.sh             # Ubuntu 22.04/24.04 automated installer
│   ├── nginx-ytclip.conf          # Frontend + api.YOUR-DOMAIN.com reverse proxy configuration
│   ├── ytclip-api.service         # systemd unit for API server
│   ├── ytclip-worker.service      # systemd unit for background worker
│   ├── logrotate-ytclip           # Log rotation config
│   └── .env.backend.example       # Production backend environment template
├── Dockerfile                     # Production container with Node 22 + FFmpeg + Python venv + cached Whisper model
├── docker-compose.yml             # API + Worker multi-container orchestration
└── src/                           # React + TypeScript + Tailwind frontend
```

---

## Production Linux VPS Deployment

See **[`deploy/DEPLOYMENT.md`](deploy/DEPLOYMENT.md)** for complete step-by-step instructions for deploying YTClip to your domain (`https://YOUR-DOMAIN.com` + `https://api.YOUR-DOMAIN.com`), including Ubuntu installation (`deploy/install-vps.sh`), `systemd` workers, Docker Compose, Nginx, Let's Encrypt HTTPS, backups, and why shared cPanel hosting cannot run FFmpeg/Whisper workloads.

---

## Local Development (macOS / Linux)

```bash
# 1. Install prerequisites: Node 22+, FFmpeg, Python 3.11+
npm install

# 2. Install Python AI dependencies & pre-download Whisper model (creates .venv)
npm run setup:python

# 3. Verify server capabilities (FFmpeg, faster-whisper, OpenCV, Whisper model)
npm run check:server

# 4. Run single-process dev server (port 3000) or split API + Worker
npm run dev
# Optional separate worker: EMBEDDED_WORKER=false npm run dev & npm run worker
```
