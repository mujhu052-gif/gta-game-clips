#!/usr/bin/env bash
set -euo pipefail

# YTClip Ubuntu 22.04 / 24.04 Production Server Installer
# Run as root (or via sudo) inside your cloned YTClip repository (e.g. /opt/ytclip).

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${YTCLIP_DATA_DIR:-/var/lib/ytclip/data}"
MODEL_DIR="${YTCLIP_MODEL_DIR:-/var/lib/ytclip/models}"
WHISPER_MODEL="${YTCLIP_WHISPER_MODEL:-base.en}"
SERVICE_USER="${YTCLIP_USER:-ytclip}"

echo "=== [1/7] Installing Ubuntu system dependencies (FFmpeg, Python 3, OpenCV runtime libs, Nginx, Certbot) ==="
apt-get update
apt-get install -y --no-install-recommends \
  curl \
  ca-certificates \
  gnupg \
  ffmpeg \
  python3 \
  python3-pip \
  python3-venv \
  libgl1 \
  libglib2.0-0 \
  libgomp1 \
  nginx \
  certbot \
  python3-certbot-nginx

echo "=== [2/7] Checking Node.js 22+ ==="
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v
ffmpeg -version | head -n 1

echo "=== [3/7] Creating system user and persistent storage directories ==="
if ! id -u "${SERVICE_USER}" >/dev/null 2>&1; then
  useradd --system --create-home --shell /usr/sbin/nologin "${SERVICE_USER}"
fi
mkdir -p "${DATA_DIR}" "${MODEL_DIR}" /var/log/ytclip

echo "=== [4/7 & 5/7] Installing Python virtualenv, faster-whisper, OpenCV & caching model (${WHISPER_MODEL}) ==="
cd "${APP_DIR}"
chmod +x "${APP_DIR}/scripts/install_python_deps.sh"
YTCLIP_VENV_DIR="${APP_DIR}/.venv" YTCLIP_MODEL_DIR="${MODEL_DIR}" YTCLIP_WHISPER_MODEL="${WHISPER_MODEL}" \
  bash "${APP_DIR}/scripts/install_python_deps.sh"

echo "=== [6/7] Installing Node.js dependencies and building frontend ==="
npm install
npm run build

if [ ! -f "${APP_DIR}/.env" ]; then
  cp "${APP_DIR}/deploy/.env.backend.example" "${APP_DIR}/.env"
  SECRET_HEX="$(openssl rand -hex 32)"
  sed -i "s/REPLACE_WITH_OPENSSL_RAND_HEX_32/${SECRET_HEX}/" "${APP_DIR}/.env"
  echo "Created ${APP_DIR}/.env with generated MEDIA_SIGNING_SECRET. Edit CORS_ALLOWED_ORIGINS before starting services."
fi

chown -R "${SERVICE_USER}:${SERVICE_USER}" "${APP_DIR}" "${DATA_DIR}" "${MODEL_DIR}" /var/log/ytclip

echo "=== [7/7] Verifying real AI & FFmpeg server capabilities ==="
YTCLIP_PYTHON_BIN="${APP_DIR}/.venv/bin/python3" \
YTCLIP_DATA_DIR="${DATA_DIR}" \
YTCLIP_MODEL_DIR="${MODEL_DIR}" \
YTCLIP_WHISPER_MODEL="${WHISPER_MODEL}" \
  npm run check:server

echo ""
echo "YTClip dependencies installed successfully!"
echo "Next steps:"
echo "  1. Edit ${APP_DIR}/.env (set CORS_ALLOWED_ORIGINS=https://YOUR-DOMAIN.com)"
echo "  2. Copy systemd units: cp deploy/ytclip-*.service /etc/systemd/system/ && systemctl daemon-reload"
echo "  3. Enable services: systemctl enable --now ytclip-api ytclip-worker"
echo "  4. Configure Nginx & Certbot (see deploy/DEPLOYMENT.md)"
