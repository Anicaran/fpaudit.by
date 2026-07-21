from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class Channel(str, Enum):
    TELEGRAM = "telegram"
    VK = "vk"
    BLOG = "blog"
    REELS = "reels"
    NEWSLETTER = "newsletter"


class JobStatus(str, Enum):
    IDEA = "idea"
    ANALYZING = "analyzing"
    SCRIPTING = "scripting"
    VOICING = "voicing"
    VISUALIZING = "visualizing"
    ASSEMBLING = "assembling"
    REVIEW = "review"
    SCHEDULED = "scheduled"
    PUBLISHED = "published"
    REJECTED = "rejected"
    # legacy aliases kept for old seeded rows
    RESEARCHING = "researching"
    DRAFTING = "drafting"
    ADAPTING = "adapting"


class BrandProfile(BaseModel):
    id: str
    name: str
    niche: str
    audience: str
    voice: str
    pillars: list[str] = Field(default_factory=list)
    banned_topics: list[str] = Field(default_factory=list)
    channels: list[Channel] = Field(default_factory=list)


class BrandUpdate(BaseModel):
    name: str | None = None
    niche: str | None = None
    audience: str | None = None
    voice: str | None = None
    pillars: list[str] | None = None
    banned_topics: list[str] | None = None
    channels: list[Channel] | None = None


class SourceItem(BaseModel):
    id: str
    title: str
    url: str | None = None
    kind: str = "manual"
    snippet: str = ""
    score: float = 0.7


class Idea(BaseModel):
    id: str
    source_id: str | None = None
    title: str
    angle: str
    pillar: str
    score: float
    status: str = "pending"


class ChannelDraft(BaseModel):
    channel: Channel
    title: str
    body: str
    hashtags: list[str] = Field(default_factory=list)
    cta: str = ""
    meta_description: str | None = None


class ScriptScene(BaseModel):
    index: int
    title: str
    narration: str
    on_screen_text: str
    visual_prompt: str = ""


class VideoPackage(BaseModel):
    analysis: str = ""
    script_title: str = ""
    hook: str = ""
    cta: str = ""
    scenes: list[ScriptScene] = Field(default_factory=list)
    full_narration: str = ""
    voice_url: str | None = None
    frame_urls: list[str] = Field(default_factory=list)
    video_url: str | None = None
    duration_sec: float | None = None
    voice_engine: str = ""
    visual_engine: str = ""
    assembler: str = ""


class ContentJob(BaseModel):
    id: str
    brand_id: str
    idea_id: str
    title: str
    status: JobStatus
    research_brief: str = ""
    drafts: list[ChannelDraft] = Field(default_factory=list)
    video: VideoPackage | None = None
    quality_score: float | None = None
    scheduled_at: str | None = None
    published_at: str | None = None
    created_at: str
    updated_at: str
    notes: str = ""


class CreateJobRequest(BaseModel):
    idea_id: str


class ScheduleRequest(BaseModel):
    scheduled_at: str | None = None


class GenerateIdeasRequest(BaseModel):
    count: int = 5


class DashboardStats(BaseModel):
    ideas_pending: int
    in_pipeline: int
    awaiting_review: int
    scheduled: int
    published_this_week: int
    avg_quality: float | None
    videos_ready: int = 0


class PipelineEvent(BaseModel):
    job_id: str
    status: JobStatus
    message: str
    at: str


class ApiEnvelope(BaseModel):
    ok: bool = True
    data: Any = None
    error: str | None = None
