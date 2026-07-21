from __future__ import annotations

from datetime import datetime, timezone

from . import ai
from .models import ContentJob, Idea, JobStatus
from . import store


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def harvest_and_ideate(count: int = 5) -> list[Idea]:
    brand = store.get_brand()
    harvested = ai.harvest_trends(brand)
    existing_sources = {s.title: s for s in store.list_sources()}

    def mut_sources(data: dict) -> None:
        for item in harvested:
            if item.title in existing_sources:
                continue
            row = item.model_dump(mode="json")
            row["id"] = store.new_id("src")
            data["sources"].append(row)

    store.update_state(mut_sources)
    sources = store.list_sources()
    generated = ai.generate_ideas(brand, sources, count=count)
    saved: list[Idea] = []
    for idea in generated:
        idea.id = store.new_id("idea")
        store.upsert_idea(idea)
        saved.append(idea)
    return saved


def set_idea_status(idea_id: str, status: str) -> Idea:
    idea = store.get_idea(idea_id)
    if not idea:
        raise ValueError("Идея не найдена")
    if status not in {"pending", "approved", "rejected"}:
        raise ValueError("Некорректный статус")
    idea.status = status
    return store.upsert_idea(idea)


def create_job_from_idea(idea_id: str) -> ContentJob:
    idea = store.get_idea(idea_id)
    if not idea:
        raise ValueError("Идея не найдена")
    if idea.status != "approved":
        idea.status = "approved"
        store.upsert_idea(idea)

    brand = store.get_brand()
    now = _now()
    job = ContentJob(
        id=store.new_id("job"),
        brand_id=brand.id,
        idea_id=idea.id,
        title=idea.title,
        status=JobStatus.IDEA,
        created_at=now,
        updated_at=now,
    )
    store.upsert_job(job)
    store.append_event(job.id, JobStatus.IDEA, "Задание создано из идеи")
    return run_pipeline(job.id)


def run_pipeline(job_id: str) -> ContentJob:
    job = store.get_job(job_id)
    if not job:
        raise ValueError("Задание не найдено")
    idea = store.get_idea(job.idea_id)
    if not idea:
        raise ValueError("Идея задания не найдена")
    brand = store.get_brand()

    job.status = JobStatus.RESEARCHING
    job.updated_at = _now()
    store.upsert_job(job)
    store.append_event(job.id, JobStatus.RESEARCHING, "Сбор брифа и фактуры")
    job.research_brief = ai.research_brief(brand, idea)

    job.status = JobStatus.DRAFTING
    job.updated_at = _now()
    store.upsert_job(job)
    store.append_event(job.id, JobStatus.DRAFTING, "Черновик основного материала")

    job.status = JobStatus.ADAPTING
    job.updated_at = _now()
    store.upsert_job(job)
    store.append_event(job.id, JobStatus.ADAPTING, "Адаптация под каналы")
    channels = list(brand.channels)
    if not channels:
        from .models import Channel

        channels = [Channel.TELEGRAM, Channel.BLOG]
    job.drafts = ai.draft_for_channels(brand, idea, job.research_brief, channels)
    job.quality_score = ai.score_quality(job.drafts, brand)

    job.status = JobStatus.REVIEW
    job.updated_at = _now()
    store.upsert_job(job)
    store.append_event(
        job.id,
        JobStatus.REVIEW,
        f"Готово к модерации (quality={job.quality_score})",
    )
    return job


def approve_job(job_id: str, scheduled_at: str | None = None) -> ContentJob:
    job = store.get_job(job_id)
    if not job:
        raise ValueError("Задание не найдено")
    if job.status not in {JobStatus.REVIEW, JobStatus.SCHEDULED}:
        raise ValueError("Одобрить можно только материал на ревью")
    now = _now()
    if scheduled_at:
        job.status = JobStatus.SCHEDULED
        job.scheduled_at = scheduled_at
        store.append_event(job.id, JobStatus.SCHEDULED, f"Запланировано на {scheduled_at}")
    else:
        job.status = JobStatus.PUBLISHED
        job.published_at = now
        store.append_event(job.id, JobStatus.PUBLISHED, "Опубликовано (stub publisher)")
    job.updated_at = now
    return store.upsert_job(job)


def reject_job(job_id: str, notes: str = "") -> ContentJob:
    job = store.get_job(job_id)
    if not job:
        raise ValueError("Задание не найдено")
    job.status = JobStatus.REJECTED
    job.notes = notes
    job.updated_at = _now()
    store.append_event(job.id, JobStatus.REJECTED, notes or "Отклонено редактором")
    return store.upsert_job(job)


def publish_due() -> list[ContentJob]:
    now = datetime.now(timezone.utc)
    published: list[ContentJob] = []
    for job in store.list_jobs():
        if job.status != JobStatus.SCHEDULED or not job.scheduled_at:
            continue
        try:
            when = datetime.fromisoformat(job.scheduled_at)
        except ValueError:
            continue
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        if when <= now:
            job.status = JobStatus.PUBLISHED
            job.published_at = _now()
            job.updated_at = job.published_at
            store.upsert_job(job)
            store.append_event(job.id, JobStatus.PUBLISHED, "Автопубликация по расписанию")
            published.append(job)
    return published
