import type { BrandProfile, ContentJob, DashboardPayload, Idea, SourceItem } from './types';

interface Envelope<T> {
  ok: boolean;
  data: T;
  error?: string | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || body.error || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  const json = (await res.json()) as Envelope<T>;
  return json.data;
}

export const api = {
  dashboard: () => request<DashboardPayload>('/api/dashboard'),
  brand: () => request<BrandProfile>('/api/brand'),
  updateBrand: (patch: Partial<BrandProfile>) =>
    request<BrandProfile>('/api/brand', { method: 'PATCH', body: JSON.stringify(patch) }),
  sources: () => request<SourceItem[]>('/api/sources'),
  ideas: () => request<Idea[]>('/api/ideas'),
  generateIdeas: (count = 5) =>
    request<Idea[]>('/api/ideas/generate', {
      method: 'POST',
      body: JSON.stringify({ count }),
    }),
  approveIdea: (id: string) => request<Idea>(`/api/ideas/${id}/approve`, { method: 'POST' }),
  rejectIdea: (id: string) => request<Idea>(`/api/ideas/${id}/reject`, { method: 'POST' }),
  jobs: () => request<ContentJob[]>('/api/jobs'),
  job: (id: string) => request<ContentJob>(`/api/jobs/${id}`),
  createJob: (ideaId: string) =>
    request<ContentJob>('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({ idea_id: ideaId }),
    }),
  approveJob: (id: string, scheduledAt?: string) =>
    request<ContentJob>(`/api/jobs/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify(scheduledAt ? { scheduled_at: scheduledAt } : {}),
    }),
  rejectJob: (id: string) => request<ContentJob>(`/api/jobs/${id}/reject`, { method: 'POST' }),
  rerunJob: (id: string) => request<ContentJob>(`/api/jobs/${id}/rerun`, { method: 'POST' }),
  publisherTick: () => request<ContentJob[]>('/api/publisher/tick', { method: 'POST' }),
};
