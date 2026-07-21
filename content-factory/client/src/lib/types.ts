export type Channel = 'telegram' | 'vk' | 'blog' | 'reels' | 'newsletter';

export type JobStatus =
  | 'idea'
  | 'analyzing'
  | 'scripting'
  | 'voicing'
  | 'visualizing'
  | 'assembling'
  | 'review'
  | 'scheduled'
  | 'published'
  | 'rejected'
  | 'researching'
  | 'drafting'
  | 'adapting';

export interface BrandProfile {
  id: string;
  name: string;
  niche: string;
  audience: string;
  voice: string;
  pillars: string[];
  banned_topics: string[];
  channels: Channel[];
}

export interface SourceItem {
  id: string;
  title: string;
  url?: string | null;
  kind: string;
  snippet: string;
  score: number;
}

export interface Idea {
  id: string;
  source_id?: string | null;
  title: string;
  angle: string;
  pillar: string;
  score: number;
  status: 'pending' | 'approved' | 'rejected';
}

export interface ChannelDraft {
  channel: Channel;
  title: string;
  body: string;
  hashtags: string[];
  cta: string;
  meta_description?: string | null;
}

export interface ScriptScene {
  index: number;
  title: string;
  narration: string;
  on_screen_text: string;
  visual_prompt: string;
}

export interface VideoPackage {
  analysis: string;
  script_title: string;
  hook: string;
  cta: string;
  scenes: ScriptScene[];
  full_narration: string;
  voice_url?: string | null;
  frame_urls: string[];
  video_url?: string | null;
  duration_sec?: number | null;
  voice_engine: string;
  visual_engine: string;
  assembler: string;
}

export interface ContentJob {
  id: string;
  brand_id: string;
  idea_id: string;
  title: string;
  status: JobStatus;
  research_brief: string;
  drafts: ChannelDraft[];
  video?: VideoPackage | null;
  quality_score?: number | null;
  scheduled_at?: string | null;
  published_at?: string | null;
  created_at: string;
  updated_at: string;
  notes: string;
}

export interface DashboardStats {
  ideas_pending: number;
  in_pipeline: number;
  awaiting_review: number;
  scheduled: number;
  published_this_week: number;
  avg_quality: number | null;
  videos_ready: number;
}

export interface PipelineEvent {
  job_id: string;
  status: JobStatus;
  message: string;
  at: string;
}

export interface DashboardPayload {
  stats: DashboardStats;
  events: PipelineEvent[];
  jobs: ContentJob[];
  ideas: Idea[];
}
