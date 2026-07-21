from __future__ import annotations

import json
import threading
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from .models import (
    BrandProfile,
    Channel,
    ChannelDraft,
    ContentJob,
    Idea,
    JobStatus,
    SourceItem,
)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "factory.json"
_lock = threading.RLock()


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _week_ago() -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=7)


def _default_brand() -> BrandProfile:
    return BrandProfile(
        id="brand_demo",
        name="Molly Web Studio",
        niche="digital-агентство и веб-продукты для бизнеса",
        audience="владельцы малого и среднего бизнеса, маркетологи, e-commerce команды",
        voice=(
            "уверенный, конкретный, без воды. Говорим языком результата: цифры, "
            "сроки, понятные шаги. Без корпоративного пафоса и канцелярита."
        ),
        pillars=[
            "кейсы и результаты клиентов",
            "практика запуска продуктов",
            "автоматизация контента и маркетинга",
            "ошибки и уроки команд",
        ],
        banned_topics=["политика", "сенсации без фактов"],
        channels=[
            Channel.TELEGRAM,
            Channel.VK,
            Channel.BLOG,
            Channel.REELS,
            Channel.NEWSLETTER,
        ],
    )


def _seed() -> dict[str, Any]:
    brand = _default_brand()
    sources = [
        SourceItem(
            id="src_1",
            title="Бизнес перестаёт нанимать копирайтеров на рутину",
            kind="trend",
            snippet="Компании ищут конвейеры контента с human-in-the-loop вместо разовых заказов.",
            score=0.92,
            url="https://example.com/trend-content-ops",
        ),
        SourceItem(
            id="src_2",
            title="Мультиканальная публикация без потери голоса бренда",
            kind="rss",
            snippet="Один смысл — пять форматов: Telegram, VK, блог, Reels, рассылка.",
            score=0.88,
        ),
        SourceItem(
            id="src_3",
            title="SEO-статьи из мониторинга Telegram-каналов",
            kind="telegram",
            snippet="Источники как сырьё, не как копипаст: уникальная структура и тон.",
            score=0.84,
        ),
    ]
    ideas = [
        Idea(
            id="idea_1",
            source_id="src_1",
            title="Почему контент-завод бьёт агентство по unit-экономике",
            angle="Сравнить стоимость одного поста: фриланс vs конвейер с контролем качества",
            pillar="автоматизация контента и маркетинга",
            score=0.91,
            status="pending",
        ),
        Idea(
            id="idea_2",
            source_id="src_2",
            title="Один бриф — пять площадок без «одного и того же текста»",
            angle="Показать адаптацию форматов на примере реального пайплайна",
            pillar="практика запуска продуктов",
            score=0.87,
            status="pending",
        ),
        Idea(
            id="idea_3",
            source_id="src_3",
            title="Как не скатиться в роботизированный контент",
            angle="Голос бренда + QA-агент + ручное одобрение на старте",
            pillar="ошибки и уроки команд",
            score=0.85,
            status="approved",
        ),
    ]
    now = _now()
    scheduled = (datetime.now(timezone.utc) + timedelta(days=1)).replace(microsecond=0).isoformat()
    jobs = [
        ContentJob(
            id="job_1",
            brand_id=brand.id,
            idea_id="idea_3",
            title="Как не скатиться в роботизированный контент",
            status=JobStatus.REVIEW,
            research_brief=(
                "Аудитория устала от шаблонных ИИ-текстов. Системы с проверкой фактов, "
                "рубриками и голосом бренда дают рост доверия. Human-in-the-loop на старте "
                "снижает риск репутационных провалов."
            ),
            drafts=[
                ChannelDraft(
                    channel=Channel.TELEGRAM,
                    title="Робот пишет — вы управляете",
                    body=(
                        "Контент-завод ≠ кнопка «сгенерировать пост».\n\n"
                        "Рабочая схема:\n"
                        "1) источники и темы\n"
                        "2) бриф и черновик\n"
                        "3) адаптация под площадки\n"
                        "4) ваше одобрение\n"
                        "5) публикация по календарю\n\n"
                        "Так контент остаётся вашим — просто производится быстрее."
                    ),
                    hashtags=["контентзавод", "smm", "автоматизация"],
                    cta="Запишитесь на демо пайплайна",
                ),
                ChannelDraft(
                    channel=Channel.BLOG,
                    title="Human-in-the-loop: как контент-завод не убивает голос бренда",
                    body=(
                        "## Проблема\n"
                        "ИИ пишет быстро, но часто одинаково. Аудитория это замечает.\n\n"
                        "## Решение\n"
                        "Разделите роли: исследование, черновик, адаптация, редактор-критик, "
                        "человек на финальном гейте.\n\n"
                        "## Результат\n"
                        "Стабильный поток публикаций без потери экспертности."
                    ),
                    hashtags=["seo", "contentops"],
                    cta="Собрать свой конвейер",
                    meta_description="Как устроить контент-завод с контролем качества и голосом бренда.",
                ),
                ChannelDraft(
                    channel=Channel.REELS,
                    title="3 правила, чтобы ИИ не звучал как ИИ",
                    body=(
                        "Хук: Ваш контент пахнет ChatGPT?\n"
                        "1. Зафиксируйте голос бренда\n"
                        "2. Дайте ИИ источники, не «тему в вакууме»\n"
                        "3. Не публикуйте без гейта качества\n"
                        "CTA: Сохраните, если собираете контент-завод"
                    ),
                    hashtags=["reels", "контент"],
                    cta="Сохранить",
                ),
            ],
            quality_score=0.86,
            created_at=now,
            updated_at=now,
        ),
        ContentJob(
            id="job_2",
            brand_id=brand.id,
            idea_id="idea_2",
            title="Один бриф — пять площадок",
            status=JobStatus.SCHEDULED,
            research_brief="Мультиканальность работает, когда смысл общий, а формат — свой.",
            drafts=[
                ChannelDraft(
                    channel=Channel.VK,
                    title="Один смысл — пять форматов",
                    body="Короткий пост для ленты VK с примером адаптации брифа.",
                    hashtags=["маркетинг"],
                    cta="Посмотреть пример",
                )
            ],
            quality_score=0.81,
            scheduled_at=scheduled,
            created_at=now,
            updated_at=now,
        ),
    ]
    return {
        "brand": brand.model_dump(mode="json"),
        "sources": [s.model_dump(mode="json") for s in sources],
        "ideas": [i.model_dump(mode="json") for i in ideas],
        "jobs": [j.model_dump(mode="json") for j in jobs],
        "events": [],
    }


def ensure_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not DB_PATH.exists():
        DB_PATH.write_text(json.dumps(_seed(), ensure_ascii=False, indent=2), encoding="utf-8")


def _read() -> dict[str, Any]:
    ensure_db()
    with DB_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def _write(data: dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = DB_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(DB_PATH)


def get_state() -> dict[str, Any]:
    with _lock:
        return deepcopy(_read())


def update_state(mutator) -> dict[str, Any]:
    with _lock:
        data = _read()
        mutator(data)
        _write(data)
        return deepcopy(data)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:10]}"


def get_brand() -> BrandProfile:
    return BrandProfile.model_validate(get_state()["brand"])


def save_brand(brand: BrandProfile) -> BrandProfile:
    def mut(data: dict[str, Any]) -> None:
        data["brand"] = brand.model_dump(mode="json")

    update_state(mut)
    return brand


def list_sources() -> list[SourceItem]:
    return [SourceItem.model_validate(x) for x in get_state()["sources"]]


def list_ideas() -> list[Idea]:
    return [Idea.model_validate(x) for x in get_state()["ideas"]]


def get_idea(idea_id: str) -> Idea | None:
    for idea in list_ideas():
        if idea.id == idea_id:
            return idea
    return None


def upsert_idea(idea: Idea) -> Idea:
    def mut(data: dict[str, Any]) -> None:
        ideas = data["ideas"]
        for i, row in enumerate(ideas):
            if row["id"] == idea.id:
                ideas[i] = idea.model_dump(mode="json")
                return
        ideas.append(idea.model_dump(mode="json"))

    update_state(mut)
    return idea


def list_jobs() -> list[ContentJob]:
    return [ContentJob.model_validate(x) for x in get_state()["jobs"]]


def get_job(job_id: str) -> ContentJob | None:
    for job in list_jobs():
        if job.id == job_id:
            return job
    return None


def upsert_job(job: ContentJob) -> ContentJob:
    def mut(data: dict[str, Any]) -> None:
        jobs = data["jobs"]
        for i, row in enumerate(jobs):
            if row["id"] == job.id:
                jobs[i] = job.model_dump(mode="json")
                return
        jobs.append(job.model_dump(mode="json"))

    update_state(mut)
    return job


def append_event(job_id: str, status: JobStatus, message: str) -> None:
    def mut(data: dict[str, Any]) -> None:
        data.setdefault("events", []).append(
            {
                "job_id": job_id,
                "status": status.value,
                "message": message,
                "at": _now(),
            }
        )
        data["events"] = data["events"][-200:]

    update_state(mut)


def list_events(limit: int = 40) -> list[dict[str, Any]]:
    events = get_state().get("events", [])
    return list(reversed(events[-limit:]))


def dashboard_stats() -> dict[str, Any]:
    ideas = list_ideas()
    jobs = list_jobs()
    week = _week_ago()
    published = []
    for j in jobs:
        if j.status == JobStatus.PUBLISHED and j.published_at:
            try:
                ts = datetime.fromisoformat(j.published_at)
                if ts >= week:
                    published.append(j)
            except ValueError:
                continue
    qualities = [j.quality_score for j in jobs if j.quality_score is not None]
    return {
        "ideas_pending": sum(1 for i in ideas if i.status == "pending"),
        "in_pipeline": sum(
            1
            for j in jobs
            if j.status
            in {
                JobStatus.RESEARCHING,
                JobStatus.DRAFTING,
                JobStatus.ADAPTING,
            }
        ),
        "awaiting_review": sum(1 for j in jobs if j.status == JobStatus.REVIEW),
        "scheduled": sum(1 for j in jobs if j.status == JobStatus.SCHEDULED),
        "published_this_week": len(published),
        "avg_quality": round(sum(qualities) / len(qualities), 2) if qualities else None,
    }
