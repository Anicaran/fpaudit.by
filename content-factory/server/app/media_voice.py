from __future__ import annotations

import asyncio
import math
import subprocess
import wave
from pathlib import Path


def synthesize_voice(text: str, out_mp3: Path) -> str:
    """Озвучка: edge-tts (ru), иначе локальный fallback через ffmpeg."""
    out_mp3.parent.mkdir(parents=True, exist_ok=True)
    try:
        asyncio.run(_edge_tts(text, out_mp3))
        if out_mp3.exists() and out_mp3.stat().st_size > 1000:
            return "edge-tts:ru-RU-DmitryNeural"
    except Exception:
        pass
    return _ffmpeg_fallback_voice(text, out_mp3)


async def _edge_tts(text: str, out_mp3: Path) -> None:
    import edge_tts

    communicate = edge_tts.Communicate(text=text, voice="ru-RU-DmitryNeural", rate="+4%")
    await communicate.save(str(out_mp3))


def _ffmpeg_fallback_voice(text: str, out_mp3: Path) -> str:
    """Генерирует ритмичную озвучку-заглушку длительностью по длине текста."""
    duration = max(8.0, min(48.0, len(text) / 14.0))
    wav_path = out_mp3.with_suffix(".wav")
    _write_tone_wav(wav_path, duration_sec=duration)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(wav_path),
            "-codec:a",
            "libmp3lame",
            "-q:a",
            "4",
            str(out_mp3),
        ],
        check=True,
        capture_output=True,
    )
    wav_path.unlink(missing_ok=True)
    return "ffmpeg-fallback-tone"


def _write_tone_wav(path: Path, duration_sec: float, sample_rate: int = 22050) -> None:
    import struct

    n = int(duration_sec * sample_rate)
    with wave.open(str(path), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        frames = bytearray()
        for i in range(n):
            t = i / sample_rate
            # soft pulsing tone so the file is audible and timed
            amp = 0.18 * (0.55 + 0.45 * math.sin(2 * math.pi * 1.4 * t))
            sample = int(amp * 32767 * math.sin(2 * math.pi * 220 * t))
            frames.extend(struct.pack("<h", sample))
        wf.writeframes(frames)


def probe_duration(path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    try:
        return float(result.stdout.strip())
    except ValueError:
        return 12.0
