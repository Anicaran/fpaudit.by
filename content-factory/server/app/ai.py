from __future__ import annotations

import os
import re
from typing import Iterable

import httpx

from .models import BrandProfile, Channel, ChannelDraft, Idea, SourceItem


def _has_openrouter() -> bool:
    return bool(os.getenv("OPENROUTER_API_KEY", "").strip())


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def harvest_trends(brand: BrandProfile) -> list[SourceItem]:
    """Stub trend harvest — deterministic, niche-aware."""
    seeds = [
        (f"Что ищут в нише «{brand.niche}» на этой неделе", 0.9, "trend"),
        ("Форматы коротких видео, которые держат удержание", 0.86, "trend"),
        ("Как компании режут стоимость контента без потери качества", 0.88, "rss"),
        (f"Вопросы аудитории: {brand.audience}", 0.8, "telegram"),
        ("Кейсы автоматизации публикаций в RU-сегменте", 0.84, "rss"),
    ]
    items: list[SourceItem] = []
    for i, (title, score, kind) in enumerate(seeds, start=1):
        items.append(
            SourceItem(
                id=f"harvest_{i}",
                title=title,
                kind=kind,
                snippet=f"Сигнал для бренда {brand.name}: {title.lower()}.",
                score=score,
            )
        )
    return items


def generate_ideas(
    brand: BrandProfile,
    sources: Iterable[SourceItem],
    count: int = 5,
) -> list[Idea]:
    sources_list = list(sources)
    pillars = brand.pillars or ["экспертность"]
    ideas: list[Idea] = []
    for i in range(count):
        src = sources_list[i % len(sources_list)] if sources_list else None
        pillar = pillars[i % len(pillars)]
        title_base = src.title if src else f"Тема недели для {brand.name}"
        ideas.append(
            Idea(
                id=f"gen_{i+1}",
                source_id=src.id if src else None,
                title=_clean(f"{title_base}: угол «{pillar}»"),
                angle=_clean(
                    f"Раскрыть через {pillar} для аудитории «{brand.audience}». "
                    f"Тон: {brand.voice[:120]}"
                ),
                pillar=pillar,
                score=round(0.78 + (i % 5) * 0.03, 2),
                status="pending",
            )
        )
    if _has_openrouter():
        # Optional live enhancement — keep stub results if call fails.
        try:
            live = _openrouter_ideas(brand, sources_list[:3], count)
            if live:
                return live
        except Exception:
            pass
    return ideas


def research_brief(brand: BrandProfile, idea: Idea) -> str:
    return (
        f"Бриф для «{idea.title}».\n"
        f"Ниша: {brand.niche}.\n"
        f"Аудитория: {brand.audience}.\n"
        f"Угол: {idea.angle}.\n"
        f"Столп контента: {idea.pillar}.\n"
        f"Ключевые тезисы: проблема → механизм → пример → действие.\n"
        f"Ограничения: {', '.join(brand.banned_topics) or 'нет'}."
    )


def draft_for_channels(
    brand: BrandProfile,
    idea: Idea,
    brief: str,
    channels: list[Channel],
) -> list[ChannelDraft]:
    drafts: list[ChannelDraft] = []
    for channel in channels:
        drafts.append(_stub_draft(brand, idea, brief, channel))
    return drafts


def score_quality(drafts: list[ChannelDraft], brand: BrandProfile) -> float:
    if not drafts:
        return 0.0
    length_score = min(1.0, sum(len(d.body) for d in drafts) / (180 * len(drafts)))
    voice_hits = sum(1 for d in drafts if any(w in d.body.lower() for w in ("вы", "результат", "шаг")))
    voice_score = min(1.0, 0.5 + voice_hits * 0.1)
    channel_score = min(1.0, len(drafts) / max(1, len(brand.channels) or 1))
    return round(0.55 * length_score + 0.25 * voice_score + 0.2 * channel_score, 2)


def _stub_draft(
    brand: BrandProfile,
    idea: Idea,
    brief: str,
    channel: Channel,
) -> ChannelDraft:
    if channel == Channel.TELEGRAM:
        return ChannelDraft(
            channel=channel,
            title=idea.title,
            body=(
                f"**{idea.title}**\n\n"
                f"{idea.angle}\n\n"
                f"Для кого: {brand.audience}.\n"
                f"Почему сейчас: тема из вашего контент-потока.\n\n"
                f"Короткий разбор:\n"
                f"— зафиксируйте голос бренда\n"
                f"— дайте ИИ источники\n"
                f"— оставьте финальный контроль за собой\n\n"
                f"#{brand.name.replace(' ', '')}"
            ),
            hashtags=["контентзавод", "маркетинг"],
            cta="Напишите «демо» в комментариях",
        )
    if channel == Channel.VK:
        return ChannelDraft(
            channel=channel,
            title=idea.title,
            body=(
                f"{idea.title}\n\n"
                f"{idea.angle}\n\n"
                f"Мы в {brand.name} собираем контент так, чтобы он звучал как вы — "
                f"просто выходил регулярно."
            ),
            hashtags=["бизнес", "контент"],
            cta="Сохранить пост",
        )
    if channel == Channel.BLOG:
        return ChannelDraft(
            channel=channel,
            title=idea.title,
            body=(
                f"# {idea.title}\n\n"
                f"## Зачем это бизнесу\n{idea.angle}\n\n"
                f"## Контекст\n{brief}\n\n"
                f"## Как внедрить\n"
                f"1. Опишите голос бренда\n"
                f"2. Подключите источники\n"
                f"3. Запустите пайплайн с модерацией\n"
                f"4. Переведите часть потока на автопилот\n\n"
                f"## Итог\nРегулярность без выгорания команды."
            ),
            hashtags=["seo", "content"],
            cta="Запросить пилот",
            meta_description=f"{idea.title} — практический разбор для {brand.audience}.",
        )
    if channel == Channel.REELS:
        return ChannelDraft(
            channel=channel,
            title=f"Хук: {idea.title}",
            body=(
                f"Хук (3 сек): {idea.title}?\n"
                f"Проблема: контент есть, системы нет.\n"
                f"Решение: конвейер с 5 этапами.\n"
                f"Доказательство: один бриф → несколько площадок.\n"
                f"CTA: подпишитесь, чтобы собрать свой завод"
            ),
            hashtags=["reels", "smm"],
            cta="Подписаться",
        )
    return ChannelDraft(
        channel=channel,
        title=f"Дайджест: {idea.title}",
        body=(
            f"Привет!\n\n"
            f"На этой неделе разбираем: {idea.title}.\n"
            f"{idea.angle}\n\n"
            f"Если хотите такой же конвейер у себя — ответьте на это письмо."
        ),
        hashtags=[],
        cta="Ответить на письмо",
    )


def _openrouter_ideas(
    brand: BrandProfile,
    sources: list[SourceItem],
    count: int,
) -> list[Idea]:
    key = os.environ["OPENROUTER_API_KEY"]
    source_lines = "\n".join(f"- {s.title}" for s in sources) or "- (нет источников)"
    prompt = (
        f"Сгенерируй {count} идей контента для бренда {brand.name}.\n"
        f"Ниша: {brand.niche}\nАудитория: {brand.audience}\nГолос: {brand.voice}\n"
        f"Столпы: {', '.join(brand.pillars)}\nИсточники:\n{source_lines}\n"
        "Верни только строки вида: TITLE | ANGLE | PILLAR"
    )
    with httpx.Client(timeout=40.0) as client:
        resp = client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json={
                "model": os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini"),
                "messages": [
                    {"role": "system", "content": "Ты редактор контент-завода."},
                    {"role": "user", "content": prompt},
                ],
            },
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
    ideas: list[Idea] = []
    for i, line in enumerate(content.splitlines()):
        if "|" not in line:
            continue
        parts = [p.strip(" -*\t") for p in line.split("|")]
        if len(parts) < 3:
            continue
        ideas.append(
            Idea(
                id=f"or_{i+1}",
                source_id=sources[i % len(sources)].id if sources else None,
                title=parts[0][:140],
                angle=parts[1][:280],
                pillar=parts[2][:80],
                score=0.9,
                status="pending",
            )
        )
        if len(ideas) >= count:
            break
    return ideas
