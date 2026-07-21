from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from .models import BrandProfile, ScriptScene

W, H = 1080, 1920


def render_scene_frames(
    brand: BrandProfile,
    scenes: list[ScriptScene],
    out_dir: Path,
    hook: str,
) -> tuple[list[Path], str]:
    out_dir.mkdir(parents=True, exist_ok=True)
    font_title = _font(64)
    font_body = _font(48)
    font_meta = _font(34)
    paths: list[Path] = []

    for scene in scenes:
        img = Image.new("RGB", (W, H), "#0c1210")
        draw = ImageDraw.Draw(img)
        # atmosphere
        draw.rectangle((0, 0, W, 420), fill="#17201c")
        draw.rectangle((0, H - 280, W, H), fill="#1a1510")
        draw.ellipse((640, 180, 1180, 720), fill="#1f7a5c")
        draw.ellipse((-80, 1200, 420, 1700), fill="#d97706")

        draw.text((72, 72), brand.name.upper(), fill="#f3efe4", font=font_meta)
        draw.text((72, 130), "КОНТЕНТЗАВОД · AUTO FRAME", fill="#d97706", font=font_meta)

        title = _wrap(scene.on_screen_text or scene.title, 18)
        y = 520
        for line in title:
            draw.text((72, y), line, fill="#f3efe4", font=font_title)
            y += 78

        body = _wrap(scene.narration, 28)
        y += 40
        for line in body[:8]:
            draw.text((72, y), line, fill="#e7e0d0", font=font_body)
            y += 58

        draw.text(
            (72, H - 180),
            f"{scene.index + 1:02d} / {len(scenes):02d}  ·  {scene.title}",
            fill="#f3efe4",
            font=font_meta,
        )
        draw.text((72, H - 120), _wrap(hook, 34)[0], fill="#d97706", font=font_meta)

        path = out_dir / f"frame_{scene.index:02d}.png"
        img.save(path, "PNG")
        paths.append(path)

    return paths, "pillow-vertical-1080x1920"


def _font(size: int) -> ImageFont.ImageFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size=size)
    return ImageFont.load_default()


def _wrap(text: str, width: int) -> list[str]:
    words = text.split()
    if not words:
        return [""]
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        trial = f"{current} {word}"
        if len(trial) <= width:
            current = trial
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines
