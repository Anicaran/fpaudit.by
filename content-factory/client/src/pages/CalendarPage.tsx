import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { STATUS_LABEL, formatDate } from '../lib/format';
import type { ContentJob } from '../lib/types';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function daysInMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function mondayOffset(d: Date) {
  const day = startOfMonth(d).getDay();
  return day === 0 ? 6 : day - 1;
}

export function CalendarPage() {
  const [jobs, setJobs] = useState<ContentJob[]>([]);
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function load() {
    setJobs(await api.jobs());
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Ошибка'));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const byDay = useMemo(() => {
    const map = new Map<string, ContentJob[]>();
    for (const job of jobs) {
      const raw = job.scheduled_at || job.published_at;
      if (!raw) continue;
      const key = new Date(raw).toDateString();
      const list = map.get(key) || [];
      list.push(job);
      map.set(key, list);
    }
    return map;
  }, [jobs]);

  const cells = useMemo(() => {
    const total = daysInMonth(cursor);
    const offset = mondayOffset(cursor);
    const result: Array<{ date: Date | null }> = [];
    for (let i = 0; i < offset; i += 1) result.push({ date: null });
    for (let day = 1; day <= total; day += 1) {
      result.push({ date: new Date(cursor.getFullYear(), cursor.getMonth(), day) });
    }
    return result;
  }, [cursor]);

  const planned = jobs.filter((j) => j.status === 'scheduled' || j.status === 'published');

  async function tickPublisher() {
    setBusy(true);
    try {
      const published = await api.publisherTick();
      await load();
      setToast(published.length ? `Опубликовано: ${published.length}` : 'Нет due-публикаций');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>Календарь публикаций</h2>
          <div className="item-actions">
            <button
              className="btn btn-secondary"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            >
              ←
            </button>
            <span className="mono">
              {cursor.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
            </span>
            <button
              className="btn btn-secondary"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            >
              →
            </button>
            <button className="btn btn-signal" disabled={busy} onClick={() => void tickPublisher()}>
              Прогнать publisher
            </button>
          </div>
        </div>
        {error ? <p className="empty">{error}</p> : null}
        <div className="calendar">
          {WEEKDAYS.map((d) => (
            <div className="cal-head" key={d}>
              {d}
            </div>
          ))}
          {cells.map((cell, idx) => {
            if (!cell.date) return <div key={`e-${idx}`} />;
            const list = byDay.get(cell.date.toDateString()) || [];
            return (
              <div className="cal-cell" key={cell.date.toISOString()}>
                <strong>{cell.date.getDate()}</strong>
                {list.map((job) => (
                  <span className="cal-dot" key={job.id} title={job.title}>
                    {job.title}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>План и публикации</h3>
        </div>
        <div className="list">
          {planned.length === 0 ? (
            <p className="empty">Пока нет запланированных материалов.</p>
          ) : (
            planned.map((job) => (
              <div className="item" key={job.id}>
                <div className="item-top">
                  <h3>{job.title}</h3>
                  <span className="badge">{STATUS_LABEL[job.status]}</span>
                </div>
                <p className="mono">
                  {job.scheduled_at
                    ? `план · ${formatDate(job.scheduled_at)}`
                    : `выход · ${formatDate(job.published_at)}`}
                </p>
              </div>
            ))
          )}
        </div>
      </section>
      {toast ? <div className="toast">{toast}</div> : null}
    </>
  );
}
