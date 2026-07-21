import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Idea } from '../lib/types';

export function IdeasPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function load() {
    setIdeas(await api.ideas());
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Ошибка'));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function generate() {
    setGenerating(true);
    try {
      await api.generateIdeas(5);
      await load();
      setToast('Новые идеи добавлены в очередь');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка генерации');
    } finally {
      setGenerating(false);
    }
  }

  async function approve(id: string) {
    setBusyId(id);
    try {
      await api.approveIdea(id);
      const job = await api.createJob(id);
      await load();
      setToast(`Пайплайн завершён → ревью (${job.id})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось запустить');
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    setBusyId(id);
    try {
      await api.rejectIdea(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setBusyId(null);
    }
  }

  const pending = ideas.filter((i) => i.status === 'pending');
  const others = ideas.filter((i) => i.status !== 'pending');

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>Идеи</h2>
          <button className="btn btn-signal" disabled={generating} onClick={() => void generate()}>
            {generating ? 'Сбор сигналов…' : 'Собрать +5 идей'}
          </button>
        </div>
        {error ? <p className="empty">{error}</p> : null}
        <div className="list">
          {pending.length === 0 ? (
            <p className="empty">Нет ожидающих идей. Запустите сбор сигналов.</p>
          ) : (
            pending.map((idea) => (
              <article className="item" key={idea.id}>
                <div className="item-top">
                  <h3>{idea.title}</h3>
                  <span className="badge">score {idea.score}</span>
                </div>
                <p>{idea.angle}</p>
                <p className="mono">столп · {idea.pillar}</p>
                <div className="item-actions">
                  <button
                    className="btn btn-signal"
                    disabled={busyId === idea.id}
                    onClick={() => void approve(idea.id)}
                  >
                    В производство
                  </button>
                  <button
                    className="btn btn-danger"
                    disabled={busyId === idea.id}
                    onClick={() => void reject(idea.id)}
                  >
                    В чёрный список
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      {others.length > 0 ? (
        <section className="panel">
          <div className="panel-head">
            <h3>История решений</h3>
          </div>
          <div className="list">
            {others.map((idea) => (
              <div className="item" key={idea.id}>
                <div className="item-top">
                  <h3>{idea.title}</h3>
                  <span className={`badge ${idea.status === 'rejected' ? 'badge-rejected' : 'badge-published'}`}>
                    {idea.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </>
  );
}
