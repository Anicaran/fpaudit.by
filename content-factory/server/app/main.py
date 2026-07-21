from __future__ import annotations

from pathlib import Path

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import pipeline, store
from .models import (
    ApiEnvelope,
    BrandUpdate,
    CreateJobRequest,
    GenerateIdeasRequest,
    ScheduleRequest,
)

CLIENT_DIST = Path(__file__).resolve().parents[2] / "client" / "dist"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    store.ensure_db()
    store.MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title="КонтентЗавод API", version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

store.MEDIA_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=store.MEDIA_DIR), name="media")


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "service": "content-factory", "video_pipeline": True}


@app.get("/api/dashboard")
def dashboard() -> ApiEnvelope:
    return ApiEnvelope(
        data={
            "stats": store.dashboard_stats(),
            "events": store.list_events(),
            "jobs": [j.model_dump(mode="json") for j in store.list_jobs()],
            "ideas": [i.model_dump(mode="json") for i in store.list_ideas()],
        }
    )


@app.get("/api/brand")
def get_brand() -> ApiEnvelope:
    return ApiEnvelope(data=store.get_brand().model_dump(mode="json"))


@app.patch("/api/brand")
def patch_brand(body: BrandUpdate) -> ApiEnvelope:
    from .models import BrandProfile

    brand = store.get_brand()
    data = brand.model_dump(mode="json")
    data.update(body.model_dump(exclude_unset=True, mode="json"))
    saved = store.save_brand(BrandProfile.model_validate(data))
    return ApiEnvelope(data=saved.model_dump(mode="json"))


@app.get("/api/sources")
def sources() -> ApiEnvelope:
    return ApiEnvelope(data=[s.model_dump(mode="json") for s in store.list_sources()])


@app.get("/api/ideas")
def ideas() -> ApiEnvelope:
    return ApiEnvelope(data=[i.model_dump(mode="json") for i in store.list_ideas()])


@app.post("/api/ideas/generate")
def generate_ideas(body: GenerateIdeasRequest) -> ApiEnvelope:
    created = pipeline.harvest_and_ideate(count=max(1, min(body.count, 12)))
    return ApiEnvelope(data=[i.model_dump(mode="json") for i in created])


@app.post("/api/ideas/{idea_id}/approve")
def approve_idea(idea_id: str) -> ApiEnvelope:
    try:
        idea = pipeline.set_idea_status(idea_id, "approved")
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return ApiEnvelope(data=idea.model_dump(mode="json"))


@app.post("/api/ideas/{idea_id}/reject")
def reject_idea(idea_id: str) -> ApiEnvelope:
    try:
        idea = pipeline.set_idea_status(idea_id, "rejected")
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return ApiEnvelope(data=idea.model_dump(mode="json"))


@app.get("/api/jobs")
def jobs() -> ApiEnvelope:
    return ApiEnvelope(data=[j.model_dump(mode="json") for j in store.list_jobs()])


@app.get("/api/jobs/{job_id}")
def job_detail(job_id: str) -> ApiEnvelope:
    job = store.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Задание не найдено")
    return ApiEnvelope(data=job.model_dump(mode="json"))


@app.post("/api/jobs")
def create_job(body: CreateJobRequest) -> ApiEnvelope:
    try:
        job = pipeline.create_job_from_idea(body.idea_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ApiEnvelope(data=job.model_dump(mode="json"))


@app.post("/api/jobs/{job_id}/rerun")
def rerun_job(job_id: str) -> ApiEnvelope:
    try:
        job = pipeline.run_pipeline(job_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ApiEnvelope(data=job.model_dump(mode="json"))


@app.post("/api/jobs/{job_id}/approve")
def approve_job(job_id: str, body: ScheduleRequest | None = None) -> ApiEnvelope:
    try:
        scheduled = body.scheduled_at if body else None
        job = pipeline.approve_job(job_id, scheduled_at=scheduled)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ApiEnvelope(data=job.model_dump(mode="json"))


@app.post("/api/jobs/{job_id}/reject")
def reject_job(job_id: str) -> ApiEnvelope:
    try:
        job = pipeline.reject_job(job_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ApiEnvelope(data=job.model_dump(mode="json"))


@app.post("/api/publisher/tick")
def publisher_tick() -> ApiEnvelope:
    published = pipeline.publish_due()
    return ApiEnvelope(data=[j.model_dump(mode="json") for j in published])


if CLIENT_DIST.exists():
    assets = CLIENT_DIST / "assets"
    if assets.exists():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        index = CLIENT_DIST / "index.html"
        candidate = CLIENT_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(index)
