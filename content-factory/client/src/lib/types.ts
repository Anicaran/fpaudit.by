export type Channel = 'telegram' | 'vk' | 'blog' | 'reels' | 'newsletter';

export type JobStatus =
  | 'idea'
  | 'researching'
  | 'drafting'
  | 'adapting'
  | 'review'
  | 'scheduled'
  | 'published'
  | 'rejected';

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

export interface ContentJob {
  id: string;
  brand_id: string;
  idea_id: string;
  title: string;
  status: JobStatus;
  research_brief: string;
  drafts: ChannelDraft[];
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
