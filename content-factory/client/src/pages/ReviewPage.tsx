import { useEffect, useState } from 'react';
import { JobCard } from '../components/JobCard';
import { api } from '../lib/api';
import { tomorrowIso } from '../lib/format';
import type { ContentJob } from '../lib/types';

export function ReviewPage() {
  const [jobs, setJobs] = useState<ContentJob[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function load() {
    const all = await api.jobs();
    setJobs(all.filter((j) => j.status === 'review'));
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Ошибка'));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function approve(id: string, schedule: boolean) {
    setBusyId(id);
    try {
      await api.approveJob(id, schedule ? new Date(tomorrowIso()).toISOString() : undefined);
      await load();
      setToast(schedule ? 'Материал поставлен в календарь' : 'Опубликовано');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    setBusyId(id);
    try {
      await api.rejectJob(id);
      await load();
      setToast('Отклонено');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setBusyId(null);
    }
  }

  async function rerun(id: string) {
    setBusyId(id);
    try {
      await api.rerunJob(id);
      await load();
      setToast('Пайплайн пересобран');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Очередь ревью</h2>
        <span className="mono">{jobs.length} материалов</span>
      </div>
      {error ? <p className="empty">{error}</p> : null}
      <div className="list">
        {jobs.length === 0 ? (
          <p className="empty">Очередь пуста. Одобрите идею — завод соберёт пакет под каналы.</p>
        ) : (
          jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              busy={busyId === job.id}
              onApprove={(scheduled) => void approve(job.id, Boolean(scheduled))}
              onReject={() => void reject(job.id)}
              onRerun={() => void rerun(job.id)}
            />
          ))
        )}
      </div>
      {toast ? <div className="toast">{toast}</div> : null}
    </section>
  );
}
