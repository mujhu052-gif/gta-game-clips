# YTClip Production Server Container (Node.js 22 + Python 3 + FFmpeg + faster-whisper + OpenCV)
FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    NODE_ENV=production \
    YTCLIP_PYTHON_BIN=/app/.venv/bin/python3 \
    YTCLIP_MODEL_DIR=/app/.ytclip_models \
    YTCLIP_DATA_DIR=/app/.ytclip_data

# Install system runtime dependencies required for FFmpeg, OpenCV headless, and Python builds
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    python3-venv \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python AI dependencies and pre-download default Whisper model inside /app/.venv
ARG YTCLIP_WHISPER_MODEL=base.en
ENV YTCLIP_WHISPER_MODEL=${YTCLIP_WHISPER_MODEL}
COPY python/requirements.txt ./python/requirements.txt
COPY scripts/install_python_deps.sh ./scripts/install_python_deps.sh
RUN chmod +x ./scripts/install_python_deps.sh \
    && mkdir -p /app/.ytclip_models /app/.ytclip_data \
    && YTCLIP_VENV_DIR=/app/.venv YTCLIP_MODEL_DIR=/app/.ytclip_models YTCLIP_WHISPER_MODEL=${YTCLIP_WHISPER_MODEL} \
       bash ./scripts/install_python_deps.sh

# Install Node.js dependencies
COPY package.json ./
RUN npm install --omit=dev && npm install tsx

# Copy application source & build static frontend bundle
COPY . .
RUN npm run build

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

CMD ["npm", "start"]
