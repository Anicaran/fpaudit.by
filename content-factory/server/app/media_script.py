from __future__ import annotations

from pathlib import Path

from .models import BrandProfile, Idea, SourceItem, ScriptScene


def analyze_sources(
    brand: BrandProfile,
    idea: Idea,
    sources: list[SourceItem],
) -> str:
    """Собрать и проанализировать релевантные источники под идею."""
    related: list[SourceItem] = []
    title_l = idea.title.lower()
    angle_l = idea.angle.lower()
    for src in sources:
        blob = f"{src.title} {src.snippet}".lower()
        overlap = any(tok in blob for tok in _tokens(title_l + " " + angle_l) if len(tok) > 4)
        if overlap or src.score >= 0.84:
            related.append(src)
    related = sorted(related, key=lambda s: s.score, reverse=True)[:5]
    if not related:
        related = sorted(sources, key=lambda s: s.score, reverse=True)[:3]

    lines = [
        f"Анализ для «{idea.title}»",
        f"Бренд: {brand.name} · ниша: {brand.niche}",
        f"Аудитория: {brand.audience}",
        f"Угол: {idea.angle}",
        f"Столп: {idea.pillar}",
        "",
        "Сигналы и выводы:",
    ]
    for i, src in enumerate(related, start=1):
        lines.append(
            f"{i}. [{src.kind}] {src.title} (score={src.score:.2f}) — "
            f"{src.snippet or 'сигнал без расшифровки'}"
        )
    lines.extend(
        [
            "",
            "Редакционное решение:",
            "— формат: короткий вертикальный ролик 35–55 сек",
            "— структура: хук → проблема → механизм → доказательство → CTA",
            "— тон: " + brand.voice[:160],
            f"— избегать: {', '.join(brand.banned_topics) or 'нет ограничений'}",
        ]
    )
    return "\n".join(lines)


def build_video_script(
    brand: BrandProfile,
    idea: Idea,
    analysis: str,
) -> tuple[str, str, str, list[ScriptScene], str]:
    """Сценарий ролика: hook, scenes, cta, full narration."""
    hook = f"{idea.title} — и вот как это работает без хаоса."
    cta = f"Подпишитесь на {brand.name}, чтобы собрать свой контент-завод."
    scenes = [
        ScriptScene(
            index=0,
            title="Хук",
            narration=f"{idea.title}. Если контент съедает команду — смотрите дальше.",
            on_screen_text=idea.title[:64],
            visual_prompt="крупный заголовок на тёмном фоне, акцент на бренд",
        ),
        ScriptScene(
            index=1,
            title="Проблема",
            narration=(
                f"Аудитория «{brand.audience}» устала от разовых постов. "
                "Нужен конвейер: анализ, текст, голос, визуал, сборка."
            ),
            on_screen_text="Проблема: нет системы",
            visual_prompt="иконки хаоса / разрозненные каналы",
        ),
        ScriptScene(
            index=2,
            title="Механизм",
            narration=(
                f"Угол «{idea.angle}». "
                "Завод сам собирает сигналы, пишет сценарий, озвучивает и монтирует ролик."
            ),
            on_screen_text="Анализ → Текст → Голос → Визуал",
            visual_prompt="схема конвейера из четырёх блоков",
        ),
        ScriptScene(
            index=3,
            title="Доказательство",
            narration=(
                f"Столп контента: {idea.pillar}. "
                "Один бриф превращается в пакет для площадок и готовый Shorts/Reels."
            ),
            on_screen_text="1 бриф → пакет + видео",
            visual_prompt="карточки площадок и превью ролика",
        ),
        ScriptScene(
            index=4,
            title="CTA",
            narration=cta,
            on_screen_text="Собрать свой завод",
            visual_prompt="финальный кадр с CTA и логотипом",
        ),
    ]
    narration = " ".join(s.narration for s in scenes)
    title = f"Ролик: {idea.title}"
    # Keep analysis referenced so callers can persist it with the package.
    _ = analysis
    return title, hook, cta, scenes, narration


def _tokens(text: str) -> list[str]:
    raw = "".join(ch.lower() if ch.isalnum() or ch.isspace() else " " for ch in text)
    return [t for t in raw.split() if t]


def job_media_dir(root: Path, job_id: str) -> Path:
    path = root / "jobs" / job_id
    path.mkdir(parents=True, exist_ok=True)
    return path
