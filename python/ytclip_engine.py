#!/usr/bin/env python3
"""
YTClip Production AI & Computer Vision Engine
Free, locally runnable open-source stack:
- faster-whisper + ctranslate2 + av + onnxruntime (speech transcription with word-level timestamps)
- opencv-python-headless + numpy (face detection & active speaker crop keyframe tracking)
- FFmpeg (audio extraction, silence detection, scene change detection)
"""

import os

# Prevent third-party libraries from polluting stdout JSON or deadlocking tokenizers
os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

import argparse
import json
import math
import re
import struct
import subprocess
import sys
import wave
from typing import Any, Dict, List, Optional, Tuple

HAS_FASTER_WHISPER = False
HAS_CTRANSLATE2 = False
HAS_AV = False
HAS_OPENCV = False
HAS_NUMPY = False
HAS_ONNXRUNTIME = False

CTRANSLATE2_VERSION = None
OPENCV_VERSION = None

try:
    import ctranslate2  # type: ignore

    HAS_CTRANSLATE2 = True
    CTRANSLATE2_VERSION = getattr(ctranslate2, "__version__", "unknown")
except Exception:
    HAS_CTRANSLATE2 = False

try:
    import av  # type: ignore  # noqa: F401

    HAS_AV = True
except Exception:
    HAS_AV = False

try:
    import onnxruntime  # type: ignore  # noqa: F401

    HAS_ONNXRUNTIME = True
except Exception:
    HAS_ONNXRUNTIME = False

try:
    from faster_whisper import WhisperModel  # type: ignore

    HAS_FASTER_WHISPER = True
except Exception:
    HAS_FASTER_WHISPER = False

try:
    import numpy as np  # type: ignore

    HAS_NUMPY = True
except Exception:
    HAS_NUMPY = False

try:
    import cv2  # type: ignore

    HAS_OPENCV = hasattr(cv2, "CascadeClassifier")
    OPENCV_VERSION = getattr(cv2, "__version__", "unknown")
except Exception:
    HAS_OPENCV = False


HOOK_PATTERNS = [
    r"\b(why|how|what if|stop|never|always|secret|truth|mistake|biggest|problem|actually|nobody tells|listen|here is|the reason)\b",
    r"\?",
    r"\b(\d+\s+(things|ways|reasons|mistakes|steps|rules|seconds|minutes))\b",
]
EMOTION_PATTERNS = [
    r"\b(amazing|crazy|insane|critical|essential|massive|changed|tripled|doubled|wrong|failed|breakthrough|surprising|shocking|love|hate|best|worst)\b",
    r"!",
]
STORY_PATTERNS = [
    r"\b(when we|remember when|at first|turned out|suddenly|because|instead of|the moment|finally)\b",
]


def _find_cached_model_bin(model_name: str, model_dir: str) -> Optional[str]:
    if os.path.isdir(model_name) and os.path.isfile(os.path.join(model_name, "model.bin")):
        return os.path.join(model_name, "model.bin")
    if not os.path.isdir(model_dir):
        return None
    slug = model_name.replace("/", "--")
    for root, _dirs, files in os.walk(model_dir):
        if "model.bin" in files and (slug in root or "faster-whisper" in root or "models--" in root):
            return os.path.join(root, "model.bin")
    return None


def probe_capabilities(model_name: str, model_dir: str, verify_model: bool = False) -> Dict[str, Any]:
    cached_bin = _find_cached_model_bin(model_name, model_dir)
    whisper_model_ready = cached_bin is not None
    model_error: Optional[str] = None

    if HAS_FASTER_WHISPER and verify_model:
        try:
            os.makedirs(model_dir, exist_ok=True)
            WhisperModel(
                model_name,
                device=os.environ.get("YTCLIP_WHISPER_DEVICE", "cpu"),
                compute_type=os.environ.get("YTCLIP_WHISPER_COMPUTE", "int8"),
                download_root=model_dir,
            )
            cached_bin = _find_cached_model_bin(model_name, model_dir)
            whisper_model_ready = True
        except Exception as exc:
            whisper_model_ready = False
            model_error = str(exc)

    return {
        "fasterWhisperAvailable": HAS_FASTER_WHISPER,
        "ctranslate2Available": HAS_CTRANSLATE2,
        "ctranslate2Version": CTRANSLATE2_VERSION,
        "avAvailable": HAS_AV,
        "onnxruntimeAvailable": HAS_ONNXRUNTIME,
        "opencvAvailable": HAS_OPENCV,
        "opencvVersion": OPENCV_VERSION,
        "numpyAvailable": HAS_NUMPY,
        "whisperModelReady": whisper_model_ready,
        "whisperModelBin": cached_bin,
        "whisperModelError": model_error,
        "pythonExecutable": sys.executable,
        "pythonVersion": sys.version.split()[0],
    }


def detect_silences(audio_path: str, noise_db: str = "-32dB", min_dur: float = 0.45) -> List[Tuple[float, float]]:
    proc = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-i",
            audio_path,
            "-af",
            f"silencedetect=noise={noise_db}:d={min_dur}",
            "-f",
            "null",
            "-",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    silences: List[Tuple[float, float]] = []
    current_start: Optional[float] = None
    for line in proc.stderr.splitlines():
        m_start = re.search(r"silence_start:\s*([0-9.]+)", line)
        if m_start:
            current_start = float(m_start.group(1))
        m_end = re.search(r"silence_end:\s*([0-9.]+)", line)
        if m_end and current_start is not None:
            silences.append((current_start, float(m_end.group(1))))
            current_start = None
    return silences


def detect_scene_changes(video_path: str, threshold: float = 0.28) -> List[float]:
    # Downscale to 320px width before scene detection so long 1080p/4K videos scan quickly with low RAM
    proc = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-i",
            video_path,
            "-filter:v",
            f"scale=320:-1,select='gt(scene,{threshold})',showinfo",
            "-f",
            "null",
            "-",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    timestamps: List[float] = []
    for line in proc.stderr.splitlines():
        m = re.search(r"pts_time:([0-9.]+)", line)
        if m:
            timestamps.append(float(m.group(1)))
    return timestamps


def compute_audio_rms_envelope(wav_path: str, bin_seconds: float = 0.5) -> Tuple[List[float], float]:
    try:
        with wave.open(wav_path, "rb") as wf:
            sample_rate = wf.getframerate()
            n_channels = wf.getnchannels()
            sample_width = wf.getsampwidth()
            total_frames = wf.getnframes()
            if total_frames == 0 or sample_width != 2:
                return ([0.0], 0.0)

            frames_per_bin = max(1, int(sample_rate * bin_seconds))
            rms_bins: List[float] = []
            while True:
                raw = wf.readframes(frames_per_bin)
                if not raw:
                    break
                count = len(raw) // 2
                if count == 0:
                    break
                samples = struct.unpack(f"<{count}h", raw)
                if n_channels > 1:
                    samples = samples[::n_channels]
                sq = sum(s * s for s in samples)
                rms = math.sqrt(sq / max(1, len(samples))) / 32768.0
                rms_bins.append(rms)

            duration = total_frames / float(sample_rate)
            return (rms_bins if rms_bins else [0.0], duration)
    except Exception:
        return ([0.0], 0.0)


def build_word_timestamps(text: str, start: float, end: float) -> List[Dict[str, Any]]:
    words = [w for w in text.strip().split() if w]
    if not words:
        return []
    dur = max(0.2, end - start)
    total_chars = sum(max(2, len(w)) for w in words)
    cursor = start
    out: List[Dict[str, Any]] = []
    for w in words:
        share = (max(2, len(w)) / total_chars) * dur
        w_end = min(end, cursor + share)
        out.append({"word": w, "start": round(cursor, 3), "end": round(max(cursor + 0.08, w_end), 3)})
        cursor = w_end
    return out


def transcribe_audio(audio_path: str, model_name: str, model_dir: str) -> Dict[str, Any]:
    if not HAS_FASTER_WHISPER or not HAS_CTRANSLATE2 or not HAS_AV:
        missing = []
        if not HAS_FASTER_WHISPER:
            missing.append("faster-whisper")
        if not HAS_CTRANSLATE2:
            missing.append("ctranslate2")
        if not HAS_AV:
            missing.append("av")
        return {
            "engine": "unavailable",
            "error": (
                f"Required Python transcription package(s) missing: {', '.join(missing)}. "
                "Silence detection cannot be used as a substitute for AI transcription. "
                "Run `npm run setup:python` (or `bash scripts/install_python_deps.sh`) to install them."
            ),
            "segments": [],
        }

    if not os.path.isfile(audio_path):
        return {
            "engine": "unavailable",
            "error": f"Audio input file not found: {audio_path}",
            "segments": [],
        }

    os.makedirs(model_dir, exist_ok=True)
    device = os.environ.get("YTCLIP_WHISPER_DEVICE", "cpu")
    compute_type = os.environ.get("YTCLIP_WHISPER_COMPUTE", "int8")
    cpu_threads = int(os.environ.get("YTCLIP_CPU_THREADS", "0"))
    local_only = _find_cached_model_bin(model_name, model_dir) is not None

    sys.stderr.write(
        f"[ytclip-asr] Loading WhisperModel('{model_name}', device='{device}', compute='{compute_type}', cached={local_only})\n"
    )
    sys.stderr.flush()

    model = WhisperModel(
        model_name,
        device=device,
        compute_type=compute_type,
        cpu_threads=cpu_threads,
        download_root=model_dir,
        local_files_only=local_only,
    )

    # faster-whisper decodes via PyAV streaming chunks and yields segments iteratively
    # so long audio files do not load entire decoded PCM tensors into memory.
    raw_segments, info = model.transcribe(
        audio_path,
        beam_size=5,
        word_timestamps=True,
        vad_filter=HAS_ONNXRUNTIME,
        vad_parameters={"min_silence_duration_ms": 400} if HAS_ONNXRUNTIME else None,
        condition_on_previous_text=True,
    )

    segments: List[Dict[str, Any]] = []
    for idx, seg in enumerate(raw_segments):
        words: List[Dict[str, Any]] = []
        if getattr(seg, "words", None):
            for w in seg.words:
                w_text = (w.word or "").strip()
                if w_text:
                    words.append(
                        {
                            "word": w_text,
                            "start": round(float(w.start), 3),
                            "end": round(max(float(w.start) + 0.05, float(w.end)), 3),
                        }
                    )
        text = (seg.text or "").strip()
        if not words and text:
            words = build_word_timestamps(text, float(seg.start), float(seg.end))
        if text:
            segments.append(
                {
                    "id": f"seg-{idx + 1}",
                    "startTime": round(float(seg.start), 2),
                    "endTime": round(float(seg.end), 2),
                    "text": text,
                    "words": words,
                }
            )
            if (idx + 1) % 5 == 0:
                sys.stderr.write(f"[ytclip-asr] Transcribed {idx + 1} segments (up to {seg.end:.1f}s)\n")
                sys.stderr.flush()

    sys.stderr.write(
        f"[ytclip-asr] Completed transcription: {len(segments)} segments, language={getattr(info, 'language', 'en')}\n"
    )
    sys.stderr.flush()

    return {
        "engine": "faster-whisper",
        "model": model_name,
        "language": getattr(info, "language", "en"),
        "languageProbability": round(float(getattr(info, "language_probability", 1.0)), 3),
        "segments": segments,
    }


def score_text_signals(text: str) -> Tuple[int, int, List[str]]:
    lower = text.lower()
    hook_hits = sum(len(re.findall(p, lower)) for p in HOOK_PATTERNS)
    emotion_hits = sum(len(re.findall(p, lower)) for p in EMOTION_PATTERNS)
    story_hits = sum(len(re.findall(p, lower)) for p in STORY_PATTERNS)

    hook_score = min(100, 42 + hook_hits * 18 + (12 if "?" in text else 0))
    narrative_score = min(100, 35 + emotion_hits * 14 + story_hits * 16)

    reasons: List[str] = []
    if "?" in text or hook_hits > 0:
        reasons.append("Strong opening question or curiosity hook")
    if emotion_hits > 0:
        reasons.append("High-impact phrasing and emotional emphasis")
    if story_hits > 0:
        reasons.append("Complete storytelling progression")
    return hook_score, narrative_score, reasons


def analyze_highlights(
    video_path: str,
    audio_path: str,
    transcript_segments: List[Dict[str, Any]],
    duration_seconds: float,
    target_duration: int,
    max_clips: int = 4,
) -> List[Dict[str, Any]]:
    rms_bins, wav_dur = compute_audio_rms_envelope(audio_path, bin_seconds=0.5)
    effective_dur = max(duration_seconds, wav_dur, 1.0)
    mean_rms = sum(rms_bins) / max(1, len(rms_bins))
    silences = detect_silences(audio_path)
    scenes = detect_scene_changes(video_path)

    clip_len = max(12.0, min(float(target_duration), effective_dur))
    candidates: List[Dict[str, Any]] = []

    if transcript_segments:
        n = len(transcript_segments)
        i = 0
        while i < n:
            start_t = float(transcript_segments[i]["startTime"])
            end_t = float(transcript_segments[i]["endTime"])
            texts = [transcript_segments[i]["text"]]
            j = i + 1
            while j < n:
                cand_end = float(transcript_segments[j]["endTime"])
                if cand_end - start_t > clip_len + 8:
                    break
                end_t = cand_end
                texts.append(transcript_segments[j]["text"])
                if (end_t - start_t) >= clip_len * 0.72 and re.search(r"[.!?]$", texts[-1].strip()):
                    j += 1
                    break
                j += 1

            if end_t - start_t >= min(8.0, effective_dur * 0.6):
                full_text = " ".join(texts).strip()
                candidates.append(
                    {
                        "startTime": round(start_t, 2),
                        "endTime": round(min(effective_dur, end_t), 2),
                        "text": full_text,
                        "sentenceComplete": bool(re.search(r"[.!?]$", full_text)),
                    }
                )
            i = max(i + 1, j - 1)

    if not candidates:
        candidates.append(
            {
                "startTime": 0.0,
                "endTime": round(min(effective_dur, clip_len), 2),
                "text": " ".join(s["text"] for s in transcript_segments[:4]).strip() or "Primary clip",
                "sentenceComplete": True,
            }
        )

    scored: List[Dict[str, Any]] = []
    for idx, cand in enumerate(candidates):
        st = cand["startTime"]
        en = cand["endTime"]
        dur = max(0.5, en - st)

        b0 = max(0, int(st / 0.5))
        b1 = min(len(rms_bins), max(b0 + 1, int(math.ceil(en / 0.5))))
        win_rms = rms_bins[b0:b1]
        avg_win_rms = sum(win_rms) / max(1, len(win_rms))
        peak_win_rms = max(win_rms) if win_rms else 0.0
        energy_ratio = (avg_win_rms / max(1e-5, mean_rms)) if mean_rms > 0 else 1.0
        audio_energy_score = int(min(100, max(35, 52 + (energy_ratio - 1.0) * 35 + peak_win_rms * 40)))

        silence_dur = 0.0
        for s_st, s_en in silences:
            ov = max(0.0, min(en, s_en) - max(st, s_st))
            silence_dur += ov
        speech_activity_ratio = max(0.0, 1.0 - (silence_dur / dur))

        scene_count = sum(1 for ts in scenes if st <= ts <= en)
        hook_score, narrative_score, text_reasons = score_text_signals(cand["text"])
        boundary_bonus = 8 if cand["sentenceComplete"] else 0

        composite = int(
            min(
                98,
                max(
                    40,
                    0.34 * hook_score
                    + 0.28 * audio_energy_score
                    + 0.16 * (speech_activity_ratio * 100.0)
                    + 0.14 * narrative_score
                    + min(10, scene_count * 3)
                    + boundary_bonus * 0.5,
                ),
            )
        )

        reasons: List[str] = list(text_reasons)
        if energy_ratio >= 1.05:
            reasons.append(f"Elevated vocal energy ({energy_ratio:.2f}x source baseline)")
        else:
            reasons.append(f"Sustained speech activity ({int(speech_activity_ratio * 100)}% active)")
        if scene_count > 0:
            reasons.append(f"{scene_count} visual scene transition(s)")
        if cand["sentenceComplete"]:
            reasons.append("Snapped to complete thought boundary")

        first_sentence = re.split(r"[.!?]", cand["text"])[0].strip()
        suggested_hook = first_sentence[:72] + ("..." if len(first_sentence) > 72 else "")

        scored.append(
            {
                "id": f"hl-{idx + 1}",
                "startTime": st,
                "endTime": en,
                "transcriptExcerpt": cand["text"][:260],
                "suggestedHook": suggested_hook or f"Highlight at {int(st // 60):02d}:{int(st % 60):02d}",
                "selectionReason": " · ".join(reasons),
                "hookScore": hook_score,
                "audioEnergyScore": audio_energy_score,
                "sceneChanges": scene_count,
                "sentenceComplete": cand["sentenceComplete"],
                "highlightScore": composite,
            }
        )

    scored.sort(key=lambda x: x["highlightScore"], reverse=True)
    selected: List[Dict[str, Any]] = []
    for cand in scored:
        overlaps = any(
            max(0.0, min(cand["endTime"], s["endTime"]) - max(cand["startTime"], s["startTime"]))
            > 0.45 * min(cand["endTime"] - cand["startTime"], s["endTime"] - s["startTime"])
            for s in selected
        )
        if not overlaps:
            cand["selected"] = len(selected) < 3
            selected.append(cand)
        if len(selected) >= max_clips:
            break

    return selected


def smooth_and_reduce_keyframes(
    samples: List[Dict[str, Any]],
    clip_start: float,
    clip_end: float,
    engine_name: str,
) -> Dict[str, Any]:
    valid_indices = [i for i, s in enumerate(samples) if s["detected"]]
    if not samples or not valid_indices:
        return {
            "engine": "center-fallback",
            "keyframes": [
                {"id": "kf-1", "time": round(clip_start, 2), "centerX": 0.5, "centerY": 0.46, "source": "auto"},
                {"id": "kf-2", "time": round(clip_end, 2), "centerX": 0.5, "centerY": 0.46, "source": "auto"},
            ],
        }

    for i, s in enumerate(samples):
        if not s["detected"]:
            prev_i = max([v for v in valid_indices if v < i], default=None)
            next_i = min([v for v in valid_indices if v > i], default=None)
            if prev_i is not None and next_i is not None:
                alpha = (i - prev_i) / float(next_i - prev_i)
                s["cx"] = samples[prev_i]["cx"] + alpha * (samples[next_i]["cx"] - samples[prev_i]["cx"])
                s["cy"] = samples[prev_i]["cy"] + alpha * (samples[next_i]["cy"] - samples[prev_i]["cy"])
            elif prev_i is not None:
                s["cx"] = samples[prev_i]["cx"]
                s["cy"] = samples[prev_i]["cy"]
            elif next_i is not None:
                s["cx"] = samples[next_i]["cx"]
                s["cy"] = samples[next_i]["cy"]

    alpha = 0.35
    smoothed: List[Dict[str, Any]] = []
    sx, sy = samples[0]["cx"], samples[0]["cy"]
    for s in samples:
        sx = alpha * s["cx"] + (1.0 - alpha) * sx
        sy = alpha * s["cy"] + (1.0 - alpha) * sy
        smoothed.append({**s, "cx": sx, "cy": sy})

    bx, by = smoothed[-1]["cx"], smoothed[-1]["cy"]
    for i in range(len(smoothed) - 1, -1, -1):
        bx = alpha * smoothed[i]["cx"] + (1.0 - alpha) * bx
        by = alpha * smoothed[i]["cy"] + (1.0 - alpha) * by
        smoothed[i]["cx"] = round(max(0.12, min(0.88, (smoothed[i]["cx"] + bx) * 0.5)), 4)
        smoothed[i]["cy"] = round(max(0.18, min(0.75, (smoothed[i]["cy"] + by) * 0.5)), 4)

    reduced: List[Dict[str, Any]] = []
    last_kept: Optional[Dict[str, Any]] = None
    for idx, s in enumerate(smoothed):
        is_edge = idx == 0 or idx == len(smoothed) - 1
        moved = (
            last_kept is None
            or abs(s["cx"] - last_kept["cx"]) >= 0.025
            or abs(s["cy"] - last_kept["cy"]) >= 0.025
            or (s["time"] - last_kept["time"]) >= 2.2
        )
        if is_edge or moved:
            kf: Dict[str, Any] = {
                "id": f"kf-{len(reduced) + 1}",
                "time": round(s["time"], 2),
                "centerX": s["cx"],
                "centerY": s["cy"],
                "source": "auto",
            }
            if s.get("faceBox"):
                kf["faceBox"] = s["faceBox"]
            reduced.append(kf)
            last_kept = s

    if reduced[0]["time"] > clip_start:
        reduced.insert(0, {**reduced[0], "id": "kf-0", "time": round(clip_start, 2)})
    if reduced[-1]["time"] < clip_end:
        reduced.append({**reduced[-1], "id": f"kf-{len(reduced) + 1}", "time": round(clip_end, 2)})

    return {"engine": engine_name, "keyframes": reduced}


def track_speaker_opencv(video_path: str, clip_start: float, clip_end: float) -> Dict[str, Any]:
    if not HAS_OPENCV or not HAS_NUMPY:
        return {
            "engine": "unavailable",
            "error": (
                "OpenCV (opencv-python-headless) or NumPy is not installed on this server. "
                "Run `npm run setup:python` to enable OpenCV speaker face tracking."
            ),
            "keyframes": [],
        }

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return smooth_and_reduce_keyframes([], clip_start, clip_end, "center-fallback")

    cascade_path = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
    face_cascade = cv2.CascadeClassifier(cascade_path)

    sample_step = 0.35
    t = clip_start
    samples: List[Dict[str, Any]] = []
    prev_gray = None

    while t <= clip_end + 0.01:
        cap.set(cv2.CAP_PROP_POS_MSEC, min(t, clip_end) * 1000.0)
        ok, frame = cap.read()
        if not ok or frame is None:
            t += sample_step
            continue

        h, w = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, scaleFactor=1.12, minNeighbors=5, minSize=(36, 36))

        best_face = None
        best_score = -1.0
        for (fx, fy, fw, fh) in faces:
            motion_score = 0.0
            if prev_gray is not None and prev_gray.shape == gray.shape:
                mouth_y1 = int(fy + fh * 0.55)
                mouth_y2 = int(min(h, fy + fh))
                roi_cur = gray[mouth_y1:mouth_y2, fx:fx + fw]
                roi_prev = prev_gray[mouth_y1:mouth_y2, fx:fx + fw]
                if roi_cur.size > 0 and roi_prev.size == roi_cur.size:
                    motion_score = float(np.mean(cv2.absdiff(roi_cur, roi_prev)))

            area_norm = (fw * fh) / float(w * h)
            score = area_norm * 100.0 + motion_score * 0.4
            if score > best_score:
                best_score = score
                best_face = (fx, fy, fw, fh)

        prev_gray = gray
        if best_face is not None:
            fx, fy, fw, fh = best_face
            face_cx = (fx + fw * 0.5) / float(w)
            face_cy = (fy + fh * 0.65) / float(h)
            samples.append(
                {
                    "time": min(clip_end, t),
                    "cx": face_cx,
                    "cy": face_cy,
                    "detected": True,
                    "faceBox": {
                        "x": round(fx / float(w), 4),
                        "y": round(fy / float(h), 4),
                        "w": round(fw / float(w), 4),
                        "h": round(fh / float(h), 4),
                    },
                }
            )
        else:
            samples.append({"time": min(clip_end, t), "cx": 0.5, "cy": 0.46, "detected": False})

        t += sample_step

    cap.release()
    return smooth_and_reduce_keyframes(samples, clip_start, clip_end, "opencv-face")


def emit_json(payload: Dict[str, Any], output_json: Optional[str]) -> None:
    serialized = json.dumps(payload)
    if output_json:
        parent = os.path.dirname(os.path.abspath(output_json))
        if parent:
            os.makedirs(parent, exist_ok=True)
        tmp_path = f"{output_json}.tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            f.write(serialized)
        os.replace(tmp_path, output_json)
    else:
        print(serialized)


def main() -> None:
    parser = argparse.ArgumentParser(description="YTClip Production AI & Vision Engine")
    sub = parser.add_subparsers(dest="command", required=True)

    p_caps = sub.add_parser("capabilities")
    p_caps.add_argument("--model", default="base.en")
    p_caps.add_argument("--model-dir", default=".ytclip_models")
    p_caps.add_argument("--verify-model", action="store_true")
    p_caps.add_argument("--output-json")

    p_transcribe = sub.add_parser("transcribe")
    p_transcribe.add_argument("--audio", required=True)
    p_transcribe.add_argument("--model", default="base.en")
    p_transcribe.add_argument("--model-dir", default=".ytclip_models")
    p_transcribe.add_argument("--output-json")

    p_highlights = sub.add_parser("highlights")
    p_highlights.add_argument("--video", required=True)
    p_highlights.add_argument("--audio", required=True)
    p_highlights.add_argument("--transcript-json", required=True)
    p_highlights.add_argument("--duration", type=float, required=True)
    p_highlights.add_argument("--target-duration", type=int, default=45)
    p_highlights.add_argument("--output-json")

    p_track = sub.add_parser("track")
    p_track.add_argument("--video", required=True)
    p_track.add_argument("--start", type=float, required=True)
    p_track.add_argument("--end", type=float, required=True)
    p_track.add_argument("--output-json")

    args = parser.parse_args()

    if args.command == "capabilities":
        emit_json(probe_capabilities(args.model, args.model_dir, args.verify_model), args.output_json)
    elif args.command == "transcribe":
        emit_json(transcribe_audio(args.audio, args.model, args.model_dir), args.output_json)
    elif args.command == "highlights":
        with open(args.transcript_json, "r", encoding="utf-8") as f:
            data = json.load(f)
        segs = data.get("segments", [])
        res = analyze_highlights(args.video, args.audio, segs, args.duration, args.target_duration)
        emit_json({"highlights": res}, args.output_json)
    elif args.command == "track":
        emit_json(track_speaker_opencv(args.video, args.start, args.end), args.output_json)


if __name__ == "__main__":
    main()
