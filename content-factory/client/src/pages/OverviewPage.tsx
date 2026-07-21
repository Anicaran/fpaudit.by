import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { DashboardPayload } from '../lib/types';
import { STATUS_LABEL, formatDate } from '../lib/format';

export function OverviewPage() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setData(await api.dashboard());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function generate() {
    setBusy(true);
    try {
      await api.generateIdeas(5);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сгенерировать идеи');
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) {
    return <div className="panel empty">{error}</div>;
  }

  if (!data) {
    return <div className="panel empty">Загружаем завод…</div>;
  }

  const { stats, events, jobs } = data;
  const active = jobs.filter((j) => !['published', 'rejected'].includes(j.status)).slice(0, 4);

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>Обзор конвейера</h2>
          <button className="btn btn-signal" disabled={busy} onClick={() => void generate()}>
            {busy ? 'Собираем…' : 'Собрать идеи'}
          </button>
        </div>
        <div className="stats">
          <div className="stat">
            <span>идеи</span>
            <strong>{stats.ideas_pending}</strong>
          </div>
          <div className="stat">
            <span>в пайплайне</span>
            <strong>{stats.in_pipeline}</strong>
          </div>
          <div className="stat">
            <span>на ревью</span>
            <strong>{stats.awaiting_review}</strong>
          </div>
          <div className="stat">
            <span>в календаре</span>
            <strong>{stats.scheduled}</strong>
          </div>
          <div className="stat">
            <span>опубликовано / 7д</span>
            <strong>{stats.published_this_week}</strong>
          </div>
          <div className="stat">
            <span>avg quality</span>
            <strong>{stats.avg_quality ?? '—'}</strong>
          </div>
          <div className="stat">
            <span>ролики готовы</span>
            <strong>{stats.videos_ready ?? 0}</strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>Активные задания</h3>
          <Link className="btn btn-ghost" to="/app/review">
            Вся очередь →
          </Link>
        </div>
        <div className="list">
          {active.length === 0 ? (
            <p className="empty">Пока тихо. Одобрите идею и запустите производство.</p>
          ) : (
            active.map((job) => (
              <div className="item" key={job.id}>
                <div className="item-top">
                  <h3>{job.title}</h3>
                  <span className="badge">{STATUS_LABEL[job.status]}</span>
                </div>
                <p className="mono">{formatDate(job.updated_at)}</p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>Лента событий</h3>
        </div>
        <div className="list">
          {events.length === 0 ? (
            <p className="empty">Событий пока нет.</p>
          ) : (
            events.slice(0, 8).map((ev, idx) => (
              <div className="item" key={`${ev.job_id}-${ev.at}-${idx}`}>
                <div className="item-top">
                  <h3>{STATUS_LABEL[ev.status]}</h3>
                  <span className="mono">{formatDate(ev.at)}</span>
                </div>
                <p>
                  {ev.message} · <span className="mono">{ev.job_id}</span>
                </p>
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}
