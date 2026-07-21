import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../lib/api';
import type { BrandProfile } from '../lib/types';

export function BrandPage() {
  const [brand, setBrand] = useState<BrandProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    void api
      .brand()
      .then(setBrand)
      .catch((err) => setError(err instanceof Error ? err.message : 'Ошибка'));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!brand) return;
    setSaving(true);
    try {
      const saved = await api.updateBrand({
        name: brand.name,
        niche: brand.niche,
        audience: brand.audience,
        voice: brand.voice,
        pillars: brand.pillars,
        banned_topics: brand.banned_topics,
        channels: brand.channels,
      });
      setBrand(saved);
      setToast('Профиль бренда сохранён');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  if (!brand) {
    return <div className="panel empty">{error || 'Загрузка профиля…'}</div>;
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Голос бренда</h2>
        <span className="mono">foundation layer</span>
      </div>
      <p style={{ marginTop: 0, color: 'var(--muted)' }}>
        Как в успешных content engine: один раз фиксируем ICP, столпы и тон — и каждый черновик
        проходит через эти ограничения.
      </p>
      {error ? <p className="empty">{error}</p> : null}
      <form className="form-grid" onSubmit={(e) => void onSubmit(e)}>
        <label>
          Название
          <input
            value={brand.name}
            onChange={(e) => setBrand({ ...brand, name: e.target.value })}
            required
          />
        </label>
        <label>
          Ниша
          <input
            value={brand.niche}
            onChange={(e) => setBrand({ ...brand, niche: e.target.value })}
            required
          />
        </label>
        <label>
          Аудитория
          <textarea
            rows={3}
            value={brand.audience}
            onChange={(e) => setBrand({ ...brand, audience: e.target.value })}
            required
          />
        </label>
        <label>
          Голос
          <textarea
            rows={4}
            value={brand.voice}
            onChange={(e) => setBrand({ ...brand, voice: e.target.value })}
            required
          />
        </label>
        <label>
          Столпы контента (через запятую)
          <textarea
            rows={3}
            value={brand.pillars.join(', ')}
            onChange={(e) =>
              setBrand({
                ...brand,
                pillars: e.target.value
                  .split(',')
                  .map((x) => x.trim())
                  .filter(Boolean),
              })
            }
          />
        </label>
        <label>
          Запретные темы (через запятую)
          <input
            value={brand.banned_topics.join(', ')}
            onChange={(e) =>
              setBrand({
                ...brand,
                banned_topics: e.target.value
                  .split(',')
                  .map((x) => x.trim())
                  .filter(Boolean),
              })
            }
          />
        </label>
        <div className="item-actions">
          <button className="btn" disabled={saving} type="submit">
            {saving ? 'Сохраняем…' : 'Сохранить профиль'}
          </button>
        </div>
      </form>
      {toast ? <div className="toast">{toast}</div> : null}
    </section>
  );
}
