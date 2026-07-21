from __future__ import annotations

import subprocess
from pathlib import Path

from .media_voice import probe_duration


def assemble_video(
    frames: list[Path],
    voice_path: Path,
    out_mp4: Path,
) -> tuple[float, str]:
    """Собрать вертикальный mp4: кадры + озвучка."""
    if not frames:
        raise ValueError("Нет кадров для сборки")
    out_mp4.parent.mkdir(parents=True, exist_ok=True)
    duration = probe_duration(voice_path)
    per = max(1.2, duration / len(frames))

    list_path = out_mp4.parent / "frames.txt"
    lines: list[str] = []
    for frame in frames:
        lines.append(f"file '{frame.resolve()}'")
        lines.append(f"duration {per:.3f}")
    # concat demuxer requires repeating the last file
    lines.append(f"file '{frames[-1].resolve()}'")
    list_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    cmd = [
        "ffmpeg",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(list_path),
        "-i",
        str(voice_path),
        "-vf",
        "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        "-movflags",
        "+faststart",
        str(out_mp4),
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    final_duration = probe_duration(out_mp4)
    return final_duration, "ffmpeg-concat+aac"
