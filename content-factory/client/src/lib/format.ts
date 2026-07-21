import type { JobStatus } from './types';

export const STATUS_LABEL: Record<JobStatus, string> = {
  idea: 'Идея',
  researching: 'Исследование',
  drafting: 'Черновик',
  adapting: 'Адаптация',
  review: 'На ревью',
  scheduled: 'В календаре',
  published: 'Опубликовано',
  rejected: 'Отклонено',
};

export const CHANNEL_LABEL: Record<string, string> = {
  telegram: 'Telegram',
  vk: 'VK',
  blog: 'Блог',
  reels: 'Reels / Shorts',
  newsletter: 'Рассылка',
};

export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setMinutes(0, 0, 0);
  return d.toISOString().slice(0, 16);
}
