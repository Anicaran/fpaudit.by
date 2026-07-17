import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '../context/SessionContext';
import type { ExpirationGoodItem, ExpirationSellStatus } from '../types';
import { displayLocalCode, formatDate, padLocalCodeForApi } from '../utils';
import { ProductImage } from './ProductImage';

interface Props {
  responseId: number;
  taskId?: number;
  initialItems?: ExpirationGoodItem[];
  disabled?: boolean;
  onReadyChange: (ready: boolean) => void;
  onSubmitPayload: (payload: Array<{ orderNumber: number; localcode: string; countWriteOff: number | null }>) => void;
}

type Row = ExpirationGoodItem & { _key: string };

function formatExpirationDate(value: unknown): string {
  if (!value) return '—';
  const str = String(value);
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  return formatDate(value);
}

/** orderNumber как в Audit (можно 0); не перенумеровывать — APK шлёт entity.getOrderNumber(). */
function keepOrderNumber(value: unknown, idx: number): number {
  const n = Number(value);
  if (Number.isFinite(n)) return Math.trunc(n);
  return idx + 1;
}

function normalizeItems(raw: ExpirationGoodItem[]): Row[] {
  return raw.map((g, idx) => ({
    ...g,
    orderNumber: keepOrderNumber(g.orderNumber, idx),
    sellStatus: g.sellStatus ?? null,
    _key: `${keepOrderNumber(g.orderNumber, idx)}-${g.localcode || ''}-${idx}`,
  }));
}

export function ExpirationGoodsCheck({
  responseId,
  taskId,
  initialItems,
  disabled,
  onReadyChange,
  onSubmitPayload,
}: Props) {
  const { api } = useSession();
  const [items, setItems] = useState<Row[]>(() =>
    initialItems?.length ? normalizeItems(initialItems) : [],
  );
  const [loading, setLoading] = useState(!initialItems?.length);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const url = new URL(`/api/tasks/expiration/${responseId}/goods`, location.origin);
      if (taskId) url.searchParams.set('taskId', String(taskId));
      const data = await api<{ items?: ExpirationGoodItem[] }>(url.pathname + url.search);
      const next = normalizeItems(data.items || []);
      setItems(next);
      if (!next.length) {
        setError('Сервер не вернул товары для этой задачи.');
      }
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

  const allMarked = useMemo(
    () => items.length > 0 && items.every((g) => g.sellStatus === 'sold' || g.sellStatus === 'unsold'),
    [items],
  );

  useEffect(() => {
    onReadyChange(allMarked);
  }, [allMarked, onReadyChange]);

  useEffect(() => {
    if (!allMarked) {
      onSubmitPayload([]);
      return;
    }
    // APK CheckDatesGoodRequest: orderNumber / localcode / countWriteOff
    onSubmitPayload(
      items.map((g, idx) => ({
        orderNumber: keepOrderNumber(g.orderNumber, idx),
        localcode: padLocalCodeForApi(String(g.localcode || '')),
        countWriteOff: g.sellStatus === 'sold' ? 0 : Number(g.countWriteOff ?? 1) || 1,
      })),
    );
  }, [allMarked, items, onSubmitPayload]);

  function setStatusByKey(key: string, status: ExpirationSellStatus) {
    setItems((prev) => prev.map((g) => (g._key === key ? { ...g, sellStatus: status } : g)));
  }

  function setAllStatus(status: ExpirationSellStatus) {
    setItems((prev) => prev.map((g) => ({ ...g, sellStatus: status })));
  }

  if (loading) {
    return (
      <div className="expiration-goods-loading card">
        <p className="section-label">Товары для проверки</p>
        <p className="muted">Загрузка товаров…</p>
      </div>
    );
  }

  if (error || !items.length) {
    return (
      <div className="expiration-goods-empty card">
        <p className="section-label">Товары для проверки</p>
        <p className="error">{error || 'Список товаров пуст.'}</p>
        <p className="muted small">
          Если в FP Audit товары есть, нажмите «Повторить» или потяните список задач вниз для обновления.
        </p>
        <button type="button" className="btn sm block" disabled={disabled} onClick={() => void load()}>
          Повторить
        </button>
      </div>
    );
  }

  const markedCount = items.filter((g) => g.sellStatus).length;

  return (
    <div className="expiration-goods">
      <p className="section-label">
        Товары для проверки ({markedCount}/{items.length} отмечено)
      </p>
      <div className="expiration-good-actions" style={{ marginBottom: '0.65rem' }}>
        <button
          type="button"
          className="btn sm"
          disabled={disabled}
          onClick={() => setAllStatus('sold')}
        >
          Все продано
        </button>
        <button
          type="button"
          className="btn sm"
          disabled={disabled}
          onClick={() => setAllStatus('unsold')}
        >
          Все не продано
        </button>
      </div>
      <div className="expiration-goods-list">
        {items.map((item) => {
          const lc = displayLocalCode({ localcode: item.localcode });
          return (
            <div key={item._key} className="card expiration-good-card">
              <div className="expiration-good-head">
                <ProductImage
                  info={{ image: item.image, localcode: item.localcode }}
                  fallbackLocal={lc}
                  alt={item.name || 'Товар'}
                  className="expiration-good-image"
                  placeholderClassName="expiration-good-image placeholder"
                />
                <div className="expiration-good-info">
                  <strong>{item.name || '—'}</strong>
                  <div className="muted small">Лок. код: {lc}</div>
                  <div className="muted small">Срок годности: {formatExpirationDate(item.expirationDate)}</div>
                </div>
              </div>
              <div className="expiration-good-actions">
                <button
                  type="button"
                  className={'btn sm' + (item.sellStatus === 'sold' ? ' primary' : '')}
                  disabled={disabled}
                  onClick={() => setStatusByKey(item._key, 'sold')}
                >
                  Продано
                </button>
                <button
                  type="button"
                  className={'btn sm' + (item.sellStatus === 'unsold' ? ' primary' : '')}
                  disabled={disabled}
                  onClick={() => setStatusByKey(item._key, 'unsold')}
                >
                  Не продано
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {!allMarked ? (
        <p className="muted small">Отметьте каждый товар «Продано» или «Не продано», чтобы завершить задачу.</p>
      ) : null}
    </div>
  );
}
