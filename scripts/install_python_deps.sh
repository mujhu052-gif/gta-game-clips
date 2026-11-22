#!/usr/bin/env bash
set -euo pipefail

# YTClip Python AI Runtime Installer
# Works in standard Debian/Ubuntu/macOS hosts and minimal containers lacking ensurepip.

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="${YTCLIP_VENV_DIR:-${APP_DIR}/.venv}"
MODEL_DIR="${YTCLIP_MODEL_DIR:-${APP_DIR}/.ytclip_models}"
WHISPER_MODEL="${YTCLIP_WHISPER_MODEL:-base.en}"
PYTHON_BIN="${PYTHON_BIN:-python3}"

echo "[YTClip Setup] Using Python binary: $(command -v "${PYTHON_BIN}") ($("${PYTHON_BIN}" --version))"

if [ ! -x "${VENV_DIR}/bin/python3" ]; then
  echo "[YTClip Setup] Creating virtual environment at ${VENV_DIR}..."
  if ! "${PYTHON_BIN}" -m venv "${VENV_DIR}" 2>/dev/null; then
    echo "[YTClip Setup] ensurepip unavailable in base OS; creating venv without pip and bootstrapping via get-pip.py..."
    rm -rf "${VENV_DIR}"
    "${PYTHON_BIN}" -m venv --without-pip "${VENV_DIR}"
  fi
fi

if [ ! -x "${VENV_DIR}/bin/pip" ]; then
  echo "[YTClip Setup] Bootstrapping pip into ${VENV_DIR}..."
  TMP_GET_PIP="$(mktemp /tmp/get-pip-XXXXXX.py)"
  trap 'rm -f "${TMP_GET_PIP}"' EXIT
  curl -fsSL https://bootstrap.pypa.io/get-pip.py -o "${TMP_GET_PIP}"
  "${VENV_DIR}/bin/python3" "${TMP_GET_PIP}" --no-warn-script-location
fi

echo "[YTClip Setup] Installing Python requirements from python/requirements.txt..."
"${VENV_DIR}/bin/pip" install --no-cache-dir --upgrade pip setuptools wheel
"${VENV_DIR}/bin/pip" install --no-cache-dir --prefer-binary -r "${APP_DIR}/python/requirements.txt"

echo "[YTClip Setup] Verifying Python AI & OpenCV imports..."
"${VENV_DIR}/bin/python3" - <<'PY'
import sys
import numpy
import av
import ctranslate2
import onnxruntime
import cv2
from faster_whisper import WhisperModel

print("Python:", sys.version.split()[0])
print("faster-whisper: OK")
print("ctranslate2:", ctranslate2.__version__)
print("av:", av.__version__)
print("numpy:", numpy.__version__)
print("opencv-python-headless:", cv2.__version__)
assert hasattr(cv2, "CascadeClassifier"), "OpenCV build missing CascadeClassifier (requires opencv-python-headless <5.0.0)"
print("onnxruntime:", onnxruntime.__version__)
PY

echo "[YTClip Setup] Downloading & verifying faster-whisper model (${WHISPER_MODEL}) in ${MODEL_DIR}..."
mkdir -p "${MODEL_DIR}"
YTCLIP_WHISPER_MODEL="${WHISPER_MODEL}" YTCLIP_MODEL_DIR="${MODEL_DIR}" \
  "${VENV_DIR}/bin/python3" - <<'PY'
import os
from faster_whisper import WhisperModel

model_name = os.environ["YTCLIP_WHISPER_MODEL"]
model_dir = os.environ["YTCLIP_MODEL_DIR"]
model = WhisperModel(model_name, device="cpu", compute_type="int8", download_root=model_dir)
print(f"WhisperModel('{model_name}') loaded successfully on CPU (int8) from {model_dir}")
PY

echo "[YTClip Setup] Complete."
