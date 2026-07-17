import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '../context/SessionContext';
import type { RecountGoodItem } from '../types';
import { displayLocalCode, formatGoodsCount } from '../utils';
import { ProductImage } from './ProductImage';

interface Props {
  responseId: number;
  taskId?: number;
  disabled?: boolean;
  onReadyChange: (ready: boolean) => void;
}

function normalizeItems(raw: RecountGoodItem[]): RecountGoodItem[] {
  return raw.map((g) => ({
    ...g,
    inShop: g.inShop ?? null,
    inStock: g.inStock ?? null,
  }));
}

function itemReady(item: RecountGoodItem): boolean {
  return item.inShop != null && item.inStock != null;
}

export function RecountGoodsCheck({ responseId, taskId, disabled, onReadyChange }: Props) {
  const { api } = useSession();
  const [items, setItems] = useState<RecountGoodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const url = new URL(`/api/tasks/recount/${responseId}/goods`, location.origin);
      if (taskId) url.searchParams.set('taskId', String(taskId));
      const data = await api<{ items?: RecountGoodItem[] }>(url.pathname + url.search);
      const next = normalizeItems(data.items || []);
      setItems(next);
      if (!next.length) setError('Сервер не вернул товары для пересчёта.');
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
    onReadyChange(allReady && saved);
  }, [allReady, saved, onReadyChange]);

  function setCount(localcode: string, field: 'inShop' | 'inStock', value: string) {
    const num = value === '' ? null : Math.max(0, Number(value) || 0);
    setItems((prev) =>
      prev.map((g) => (g.localcode === localcode ? { ...g, [field]: num } : g)),
    );
    setSaved(false);
  }

  async function sendToSap() {
    if (!allReady) return;
    setSaving(true);
    setError('');
    try {
      await api(`/api/tasks/recount/${responseId}/save`, {
        method: 'POST',
        body: JSON.stringify({
          items: items.map((g) => ({
            localcode: g.localcode,
            name: g.name || '',
            leftover: Number(g.leftover) || 0,
            inShop: g.inShop ?? 0,
            inStock: g.inStock ?? 0,
            quantity: Number(g.quantity) || 0,
          })),
        }),
      });
      setSaved(true);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : String(ex));
      setSaved(false);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="muted">Загрузка товаров…</p>;
  if (error && !items.length) return <p className="error">{error}</p>;

  return (
    <div className="task-goods-check recount-check">
      <p className="section-label">Пересчёт ({items.length})</p>
      <ul className="task-goods-list">
        {items.map((item) => {
          const lc = displayLocalCode({ localcode: item.localcode }, item.localcode);
          const leftover = Number(item.leftover) || 0;
          const inShop = item.inShop ?? '';
          const inStock = item.inStock ?? '';
          const total =
            item.inShop != null && item.inStock != null ? item.inShop + item.inStock : null;
          const writeOff =
            total != null ? Math.max(0, Math.round(leftover - total)) : null;
          return (
            <li key={item.localcode} className="task-goods-row card">
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
                  <div className="muted small">Остаток SAP: {formatGoodsCount(leftover)}</div>
                </div>
              </div>
              <div className="recount-inputs">
                <label>
                  В зале
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    disabled={disabled || saving}
                    value={inShop}
                    onChange={(e) => setCount(item.localcode, 'inShop', e.target.value)}
                  />
                </label>
                <label>
                  На складе
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    disabled={disabled || saving}
                    value={inStock}
                    onChange={(e) => setCount(item.localcode, 'inStock', e.target.value)}
                  />
                </label>
              </div>
              {writeOff != null && writeOff > 0 ? (
                <p className="muted small">К списанию: {writeOff}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
      {error ? <p className="error small">{error}</p> : null}
      <button
        type="button"
        className="btn primary block"
        disabled={disabled || saving || !allReady}
        onClick={() => void sendToSap()}
      >
        {saving ? 'Отправка…' : saved ? 'Отправлено в SAP ✓' : 'Отправить пересчёт в SAP'}
      </button>
    </div>
  );
}
