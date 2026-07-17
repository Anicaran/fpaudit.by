import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '../context/SessionContext';
import type { UnsoldGoodItem } from '../types';
import { displayLocalCode, formatDate, formatGoodsCount } from '../utils';
import { ProductImage } from './ProductImage';

interface Props {
  responseId: number;
  taskId?: number;
  sap: string;
  disabled?: boolean;
  onReadyChange: (ready: boolean) => void;
  onSubmitPayload: (payload: Array<{ id: number; recount: number; comment: string }>) => void;
}

function normalizeItems(raw: UnsoldGoodItem[]): UnsoldGoodItem[] {
  return raw.map((g) => ({
    ...g,
    recount: g.recount ?? null,
    comment: g.comment ?? '',
  }));
}

function itemReady(item: UnsoldGoodItem): boolean {
  return item.recount != null && item.recount >= 0 && Boolean(item.comment?.trim());
}

export function UnsoldGoodsCheck({
  responseId,
  taskId,
  sap,
  disabled,
  onReadyChange,
  onSubmitPayload,
}: Props) {
  const { api } = useSession();
  const [items, setItems] = useState<UnsoldGoodItem[]>([]);
  const [reasons, setReasons] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const goodsUrl = new URL(`/api/tasks/unsold/${responseId}/goods`, location.origin);
      if (taskId) goodsUrl.searchParams.set('taskId', String(taskId));
      const [goodsData, reasonsData] = await Promise.all([
        api<{ items?: UnsoldGoodItem[] }>(goodsUrl.pathname + goodsUrl.search),
        api<{ reasons?: string[] }>('/api/tasks/unsold/reasons'),
      ]);
      const next = normalizeItems(goodsData.items || []);
      setItems(next);
      setReasons(Array.isArray(reasonsData.reasons) ? reasonsData.reasons : []);
      if (!next.length) setError('Сервер не вернул неликвиды для этой задачи.');
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : String(ex));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [api, responseId, taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  const allReady = useMemo(
    () => items.length > 0 && items.every(itemReady),
    [items],
  );

  useEffect(() => {
    onReadyChange(allReady && submitted);
  }, [allReady, submitted, onReadyChange]);

  useEffect(() => {
    if (!allReady || !submitted) {
      onSubmitPayload([]);
      return;
    }
    onSubmitPayload(
      items.map((g) => ({
        id: g.id,
        recount: g.recount ?? 0,
        comment: g.comment?.trim() || '',
      })),
    );
  }, [allReady, submitted, items, onSubmitPayload]);

  function setRecount(id: number, value: string) {
    const num = value === '' ? null : Math.max(0, Number(value) || 0);
    setItems((prev) => prev.map((g) => (g.id === id ? { ...g, recount: num } : g)));
    setSubmitted(false);
  }

  function setComment(id: number, comment: string) {
    setItems((prev) => prev.map((g) => (g.id === id ? { ...g, comment } : g)));
    setSubmitted(false);
  }

  async function sendToSap() {
    if (!allReady || !sap) return;
    setSubmitting(true);
    setError('');
    try {
      await api('/api/tasks/unsold/submit', {
        method: 'POST',
        body: JSON.stringify({
          sap,
          items: items.map((g) => ({
            id: g.id,
            recount: g.recount ?? 0,
            comment: g.comment?.trim() || '',
          })),
        }),
      });
      setSubmitted(true);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : String(ex));
      setSubmitted(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="muted">Загрузка неликвидов…</p>;
  if (error && !items.length) return <p className="error">{error}</p>;

  return (
    <div className="task-goods-check unsold-check">
      <p className="section-label">Неликвиды ({items.length})</p>
      <ul className="task-goods-list">
        {items.map((item) => {
          const lc = displayLocalCode({ localcode: item.localcode }, item.localcode);
          return (
            <li key={item.id} className="task-goods-row card">
              <div className="task-goods-head">
                <ProductImage
                  info={{ localcode: item.localcode, image: item.image }}
                  fallbackLocal={item.localcode}
                  alt={item.name || lc}
                  className="task-goods-thumb"
                  placeholderClassName="task-goods-thumb placeholder"
                />
                <div>
                  <strong>{item.name || lc}</strong>
                  <div className="muted small">Код {lc}</div>
                  {item.daysWithoutSales != null ? (
                    <div className="muted small">Дней без продаж: {item.daysWithoutSales}</div>
                  ) : null}
                  {item.quantity != null ? (
                    <div className="muted small">Кол-во: {formatGoodsCount(item.quantity)}</div>
                  ) : null}
                  {item.lastDeliveryDate ? (
                    <div className="muted small">
                      Поставка: {formatDate(item.lastDeliveryDate)}
                    </div>
                  ) : null}
                </div>
              </div>
              <label>
                Пересчёт
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  disabled={disabled || submitting}
                  value={item.recount ?? ''}
                  onChange={(e) => setRecount(item.id, e.target.value)}
                />
              </label>
              <label>
                Причина
                {reasons.length ? (
                  <select
                    disabled={disabled || submitting}
                    value={item.comment || ''}
                    onChange={(e) => setComment(item.id, e.target.value)}
                  >
                    <option value="">— выберите —</option>
                    {reasons.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    disabled={disabled || submitting}
                    value={item.comment || ''}
                    onChange={(e) => setComment(item.id, e.target.value)}
                    placeholder="Комментарий / причина"
                  />
                )}
              </label>
            </li>
          );
        })}
      </ul>
      {error ? <p className="error small">{error}</p> : null}
      <button
        type="button"
        className="btn primary block"
        disabled={disabled || submitting || !allReady}
        onClick={() => void sendToSap()}
      >
        {submitting ? 'Отправка…' : submitted ? 'Отправлено в SAP ✓' : 'Отправить неликвиды в SAP'}
      </button>
    </div>
  );
}
