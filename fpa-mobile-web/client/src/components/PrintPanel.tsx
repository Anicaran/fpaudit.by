import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import type { usePrintSession } from '../hooks/usePrintSession';
import { buildPrintPayloadFromSession } from '../printUtils';
import { extractJobIdFromSubmitResponse, payloadToJobDetail, savePrintJobCache } from '../printJobCache';
import type { GoodsInfo, PrintJobSummary, PrintQueueItem } from '../types';
import {
  displayLocalCode,
  escapeHtml,
  formatDate,
  formatGoodsCount,
  formatGoodsPrice,
  goodsCodeType,
  normalizeLocalCodeInput,
  padLocalCodeForApi,
} from '../utils';
import { PrintJobDialog } from './PrintJobDialog';
import { ScannerDialog } from './ScannerDialog';

interface Props {
  printSession: ReturnType<typeof usePrintSession>;
}

interface PrintPreviewDoc {
  docId: string;
  fileName: string;
}

function normalizeJobs(data: unknown): PrintJobSummary[] {
  const raw = Array.isArray(data)
    ? data
    : (data as { content?: unknown; items?: unknown; results?: unknown } | null)?.content ||
      (data as { content?: unknown; items?: unknown; results?: unknown } | null)?.items ||
      (data as { content?: unknown; items?: unknown; results?: unknown } | null)?.results ||
      [];
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is PrintJobSummary => !!row && typeof row === 'object');
}

function defaultCopies(): number {
  return 1;
}

function parsePriceNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
}

function hasCardDiscount(info: GoodsInfo): boolean {
  const card = parsePriceNumber(info.cardPrice);
  const regular = parsePriceNumber(info.price);
  if (card == null || regular == null) return false;
  // В API для обычных товаров cardPrice иногда приходит 0.
  // Считаем акцией только валидную положительную цену по карте ниже обычной.
  if (card <= 0 || regular <= 0) return false;
  return card < regular;
}

function isCardType(value: string): boolean {
  return (value || '').toUpperCase().endsWith('_CARD');
}

function filterTypesByProductPromo(
  info: GoodsInfo | null,
  types: Array<{ value: string; label: string }>,
): Array<{ value: string; label: string }> {
  if (!info) return types;
  const promo = hasCardDiscount(info);
  const filtered = types.filter((t) => (promo ? isCardType(t.value) : !isCardType(t.value)));
  return filtered.length ? filtered : types;
}

function pickDefaultPriceTagType(info: GoodsInfo, types: Array<{ value: string; label: string }>): string | null {
  const promo = hasCardDiscount(info);
  const preferred = promo ? '65X57_CARD' : '65X57';
  const hit = types.find((t) => (t.value || '').toUpperCase() === preferred);
  return hit?.value || null;
}

function extractPreviewDoc(data: unknown): PrintPreviewDoc | null {
  if (!data || typeof data !== 'object') return null;
  const raw = data as Record<string, unknown>;
  const docId = String(raw.docId ?? raw.docID ?? raw.id ?? '').trim();
  if (!docId) return null;
  const fileName = String(raw.fileName ?? raw.filename ?? raw.name ?? 'preview.pdf').trim() || 'preview.pdf';
  return { docId, fileName };
}

export function PrintPanel({ printSession }: Props) {
  const { session, api } = useSession();
  const { toast } = useToast();
  const {
    session: workSession,
    createSession,
    cancelSession,
    addItem,
    removeItem,
    setInStock,
    setJobType,
    importFromJob,
    clearAfterSubmit,
  } = printSession;

  const jobType = workSession?.jobType || 'PRICE_TAGS';
  const isPriceListJob = jobType.toUpperCase() === 'PRICE_LISTS';

  const [types, setTypes] = useState<{ value: string; label: string }[]>([]);
  const [printType, setPrintType] = useState('');
  const [barcode, setBarcode] = useState('');
  const [localcode, setLocalcode] = useState('');
  const [copies, setCopies] = useState(1);
  const [found, setFound] = useState<GoodsInfo | null>(null);
  const [finding, setFinding] = useState(false);
  const [findError, setFindError] = useState('');

  const [jobs, setJobs] = useState<PrintJobSummary[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [resultHtml, setResultHtml] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerTarget, setScannerTarget] = useState<'barcode' | 'local'>('barcode');
  const [openJobId, setOpenJobId] = useState<number | null>(null);
  const [openJobFallback, setOpenJobFallback] = useState<PrintJobSummary | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [printTab, setPrintTab] = useState<'active' | 'archive'>('active');
  const [plFrom, setPlFrom] = useState('');
  const [plTo, setPlTo] = useState('');
  const [plName, setPlName] = useState('');
  const [plModFrom, setPlModFrom] = useState('');
  const [plModTo, setPlModTo] = useState('');
  const [pendingJobType, setPendingJobType] = useState<'PRICE_TAGS' | 'PRICE_LISTS'>('PRICE_TAGS');
  const filteredTypes = filterTypesByProductPromo(found, types);

  useEffect(() => {
    if (!filteredTypes.length) return;
    if (!filteredTypes.some((t) => t.value === printType)) {
      setPrintType(filteredTypes[0].value);
    }
  }, [filteredTypes, printType]);

  const loadPrintTypes = useCallback(async () => {
    if (!session?.sap) return;
    try {
      const data = await api<Array<Record<string, unknown>>>(
        `/api/print/types?sap=${encodeURIComponent(session.sap)}`,
      );
      const list = (Array.isArray(data) ? data : []).map((t) => {
        const name = String(t.name ?? t.title ?? '').trim();
        const id = String(t.id ?? t.code ?? '').trim();
        const value = name || id;
        return { value, label: name || id || value };
      }).filter((t) => t.value);
      const resolved = list.length
        ? list
        : [
            { value: '65X57', label: '65X57' },
            { value: 'A4', label: 'A4' },
            { value: '70X50', label: '70X50' },
            { value: 'A5', label: 'A5' },
            { value: '65X57_CARD', label: '65X57_CARD' },
            { value: 'A4_CARD', label: 'A4_CARD' },
            { value: '70X50_CARD', label: '70X50_CARD' },
            { value: 'A5_CARD', label: 'A5_CARD' },
          ];
      setTypes(resolved);
      setPrintType((prev) => {
        if (prev && resolved.some((t) => t.value === prev)) return prev;
        return resolved[0]?.value || '65X57';
      });
    } catch {
      const fallback = [
        { value: '65X57', label: '65X57' },
        { value: 'A4', label: 'A4' },
        { value: '70X50', label: '70X50' },
        { value: 'A5', label: 'A5' },
        { value: '65X57_CARD', label: '65X57_CARD' },
        { value: 'A4_CARD', label: 'A4_CARD' },
        { value: '70X50_CARD', label: '70X50_CARD' },
        { value: 'A5_CARD', label: 'A5_CARD' },
      ];
      setTypes(fallback);
      setPrintType((prev) => prev || '65X57');
    }
  }, [api, session?.sap]);

  const loadPrintJobs = useCallback(async () => {
    if (!session?.sap) return;
    setJobsLoading(true);
    try {
      const data = await api<unknown>(
        `/api/print/jobs?sap=${encodeURIComponent(session.sap)}&size=10`,
      );
      setJobs(normalizeJobs(data));
    } catch {
      setJobs([]);
    } finally {
      setJobsLoading(false);
    }
  }, [api, session?.sap]);

  useEffect(() => {
    void loadPrintTypes();
    void loadPrintJobs();
  }, [loadPrintTypes, loadPrintJobs]);

  function resetSearchForm() {
    setBarcode('');
    setLocalcode('');
    setCopies(1);
    setFound(null);
    setFindError('');
  }

  function normalizedLocalCodeForPrint(value: string): string {
    return normalizeLocalCodeInput(value);
  }

  async function findProduct(searchBarcode = barcode, searchLocal = localcode) {
    if (!session?.sap) {
      toast('Укажите SAP в разделе «Профиль»', 'err');
      return;
    }
    const bc = searchBarcode.trim();
    const lc = normalizeLocalCodeInput(searchLocal);
    if (!bc && !lc) {
      toast('Введите штрих-код или локальный код', 'err');
      return;
    }

    setFinding(true);
    setFindError('');
    setFound(null);
    try {
      const url = new URL('/api/goods/info', location.origin);
      url.searchParams.set('sap', session.sap);
      if (bc) {
        url.searchParams.set('code', bc);
        url.searchParams.set('codeType', goodsCodeType('barcode'));
      } else {
        url.searchParams.set('code', padLocalCodeForApi(lc));
        url.searchParams.set('codeType', goodsCodeType('local'));
      }
      const info = await api<GoodsInfo>(url.pathname + url.search);
      setFound(info);
      const resolvedLc = displayLocalCode(info, lc);
      const resolvedBc = info.barcode || info.barcodes?.[0] || bc;
      if (resolvedLc) setLocalcode(resolvedLc);
      if (resolvedBc) setBarcode(resolvedBc);
      setCopies(defaultCopies());
      const autoType = pickDefaultPriceTagType(info, filterTypesByProductPromo(info, types));
      if (autoType) setPrintType(autoType);
      toast('Товар найден', 'ok');
    } catch (ex) {
      const message = ex instanceof Error ? ex.message : String(ex);
      setFindError(message);
      toast(message, 'err');
    } finally {
      setFinding(false);
    }
  }

  function handleAddToList() {
    if (!workSession) {
      toast('Сначала создайте задание', 'err');
      return;
    }
    if (!found) {
      toast('Сначала найдите товар', 'err');
      return;
    }
    const lc = displayLocalCode(found, localcode);
    if (!lc) {
      toast('Не удалось определить локальный код', 'err');
      return;
    }
    if (!printType || printType.toUpperCase() === 'STANDARD') {
      toast('Выберите тип ценника', 'err');
      return;
    }
    if (!filteredTypes.some((t) => t.value === printType)) {
      toast('Для этого товара выбран неподходящий тип ценника', 'err');
      return;
    }
    addItem({
      localCodeFrom: normalizedLocalCodeForPrint(lc),
      localCodeTo: normalizedLocalCodeForPrint(lc),
      productName: found.name?.trim() || '',
      priceTagType: printType,
      copyCount: copies || 1,
    });
    toast('Добавлено в список', 'ok');
    resetSearchForm();
  }

  function validatePrintItems(queue: PrintQueueItem[], type: string): string | null {
    if (!queue.length) return 'Добавьте хотя бы одну позицию в задание';
    const priceList = type.toUpperCase() === 'PRICE_LISTS';
    for (let i = 0; i < queue.length; i += 1) {
      const item = queue[i];
      if (!item.localCodeFrom && !item.localCodeTo) {
        return `Позиция ${i + 1}: не указан локальный код`;
      }
      if (priceList) continue;
      const tag = (item.priceTagType || '').trim();
      if (!tag || tag.toUpperCase() === 'STANDARD') {
        return `Позиция ${i + 1}: выберите тип ценника`;
      }
    }
    return null;
  }

  function toIsoDateStart(dateStr: string): string | null {
    if (!dateStr.trim()) return null;
    return `${dateStr.trim()}T00:00:00.000Z`;
  }

  function handleAddPriceList() {
    if (!workSession) {
      toast('Сначала создайте задание', 'err');
      return;
    }
    const from = normalizedLocalCodeForPrint(plFrom);
    const to = normalizedLocalCodeForPrint(plTo || plFrom);
    if (!from) {
      toast('Укажите код «от»', 'err');
      return;
    }
    addItem({
      localCodeFrom: from,
      localCodeTo: to,
      productName: plName.trim() || `Прайс ${from}${to !== from ? `–${to}` : ''}`,
      priceTagType: '',
      copyCount: 1,
      modifiedFrom: toIsoDateStart(plModFrom),
      modifiedTo: toIsoDateStart(plModTo),
    });
    toast('Диапазон добавлен', 'ok');
    setPlFrom('');
    setPlTo('');
    setPlName('');
  }

  async function submitJob() {
    if (!session?.sap) {
      const msg = 'Укажите SAP в разделе «Профиль»';
      toast(msg, 'err');
      setResultHtml(`<span class="error">${escapeHtml(msg)}</span>`);
      return;
    }
    const validationError = validatePrintItems(workSession?.items ?? [], jobType);
    if (validationError) {
      toast(validationError, 'err');
      setResultHtml(`<span class="error">${escapeHtml(validationError)}</span>`);
      return;
    }
    if (!workSession) {
      toast('Сначала создайте задание', 'err');
      return;
    }
    setSubmitting(true);
    setResultHtml('Отправка в SAP…');
    try {
      const payload = buildPrintPayloadFromSession(session.sap, workSession);
      const result = await api('/api/print/submit', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const newId = extractJobIdFromSubmitResponse(result);
      if (newId != null) {
        savePrintJobCache(payloadToJobDetail(newId, payload));
      }
      setResultHtml(
        `<span class="ok">Задание отправлено (${workSession.items.length} поз.)</span>`,
      );
      toast('Ценники отправлены', 'ok');
      clearAfterSubmit();
      resetSearchForm();
      void loadPrintJobs();
    } catch (ex) {
      const message = ex instanceof Error ? ex.message : String(ex);
      setResultHtml(`<span class="error">${escapeHtml(message)}</span>`);
      toast(message, 'err');
    } finally {
      setSubmitting(false);
    }
  }

  async function previewJob() {
    if (!session?.sap) {
      const msg = 'Укажите SAP в разделе «Профиль»';
      toast(msg, 'err');
      setResultHtml(`<span class="error">${escapeHtml(msg)}</span>`);
      return;
    }
    const validationError = validatePrintItems(workSession?.items ?? [], jobType);
    if (validationError) {
      toast(validationError, 'err');
      setResultHtml(`<span class="error">${escapeHtml(validationError)}</span>`);
      return;
    }
    setResultHtml('Превью…');
    try {
      const payload = buildPrintPayloadFromSession(session.sap, workSession);
      const result = await api('/api/print/preview', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const previewDoc = extractPreviewDoc(result);
      if (previewDoc) {
        const fileUrl = `/api/print/files/${encodeURIComponent(previewDoc.docId)}?fileName=${encodeURIComponent(previewDoc.fileName)}`;
        window.open(fileUrl, '_blank', 'noopener,noreferrer');
        setResultHtml(
          `<span class="ok">Превью открыто в новой вкладке</span><br/><a href="${fileUrl}" target="_blank" rel="noopener noreferrer">Открыть PDF снова</a>`,
        );
      } else {
        setResultHtml(
          `<strong>Превью (${workSession.items.length} поз.)</strong><pre class="muted">${JSON.stringify(result, null, 2)}</pre>`,
        );
      }
    } catch (ex) {
      const message = ex instanceof Error ? ex.message : String(ex);
      setResultHtml(`<span class="error">${escapeHtml(message)}</span>`);
      toast(message, 'err');
    }
  }

  const items = workSession?.items ?? [];
  const foundLc = found ? displayLocalCode(found, localcode) : '';
  const regularPrice = found ? parsePriceNumber(found.price) : null;
  const cardPrice = found ? parsePriceNumber(found.cardPrice) : null;
  const promo = found ? hasCardDiscount(found) : false;
  const foundPrice = promo
    ? (found?.cardPrice ?? found?.price)
    : (found?.price ?? found?.cardPrice);

  return (
    <div className="panel active">
      <div className="chips print-tabs">
        <button
          type="button"
          className={'chip' + (printTab === 'active' ? ' active' : '')}
          onClick={() => setPrintTab('active')}
        >
          Активный
        </button>
        <button
          type="button"
          className={'chip' + (printTab === 'archive' ? ' active' : '')}
          onClick={() => setPrintTab('archive')}
        >
          Архив
        </button>
      </div>

      {printTab === 'active' ? (
        <>
          {!workSession ? (
            <div className="card print-intro">
              <h3 className="card-title">Печать ценников</h3>
              <p className="muted small">
                Создайте задание: ценники по товарам или прайс-листы по диапазону кодов.
              </p>
              <div className="chips print-job-type-chips">
                <button
                  type="button"
                  className={'chip' + (pendingJobType === 'PRICE_TAGS' ? ' active' : '')}
                  onClick={() => setPendingJobType('PRICE_TAGS')}
                >
                  Ценники
                </button>
                <button
                  type="button"
                  className={'chip' + (pendingJobType === 'PRICE_LISTS' ? ' active' : '')}
                  onClick={() => setPendingJobType('PRICE_LISTS')}
                >
                  Прайс-листы
                </button>
              </div>
              <button
                type="button"
                className="btn primary block"
                onClick={() => {
                  createSession(pendingJobType);
                  toast('Задание создано', 'ok');
                }}
              >
                Создать задание на печать
              </button>
            </div>
          ) : (
            <>
              <div className="card print-work-header">
                <div className="print-work-title-row">
                  <h3 className="card-title">
                    {isPriceListJob ? 'Прайс-листы' : 'Ценники'}
                  </h3>
                  <span className="print-queue-count">{items.length} поз.</span>
                </div>
                <div className="chips print-job-type-chips">
                  <button
                    type="button"
                    className={'chip' + (!isPriceListJob ? ' active' : '')}
                    onClick={() => setJobType('PRICE_TAGS')}
                  >
                    Ценники
                  </button>
                  <button
                    type="button"
                    className={'chip' + (isPriceListJob ? ' active' : '')}
                    onClick={() => setJobType('PRICE_LISTS')}
                  >
                    Прайс-листы
                  </button>
                </div>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={workSession.inStock ?? true}
                    onChange={(e) => setInStock(e.target.checked)}
                  />
                  Только в наличии
                </label>
                <button type="button" className="btn sm block" onClick={cancelSession}>
                  Отменить задание
                </button>
              </div>

              <div className="card print-search-card">
                <h3 className="card-title">{isPriceListJob ? 'Добавить диапазон' : 'Добавить товар'}</h3>
                {isPriceListJob ? (
                  <>
                    <label>
                      Код от
                      <input
                        value={plFrom}
                        onChange={(e) => setPlFrom(normalizeLocalCodeInput(e.target.value))}
                        inputMode="numeric"
                        placeholder="локальный код"
                      />
                    </label>
                    <label>
                      Код до
                      <input
                        value={plTo}
                        onChange={(e) => setPlTo(normalizeLocalCodeInput(e.target.value))}
                        inputMode="numeric"
                        placeholder="необязательно"
                      />
                    </label>
                    <label>
                      Название
                      <input
                        value={plName}
                        onChange={(e) => setPlName(e.target.value)}
                        placeholder="необязательно"
                      />
                    </label>
                    <label>
                      Изменения с
                      <input type="date" value={plModFrom} onChange={(e) => setPlModFrom(e.target.value)} />
                    </label>
                    <label>
                      Изменения по
                      <input type="date" value={plModTo} onChange={(e) => setPlModTo(e.target.value)} />
                    </label>
                    <button type="button" className="btn primary block" onClick={handleAddPriceList}>
                      Добавить диапазон
                    </button>
                  </>
                ) : (
                  <>
                <label>
                  1. Штрих-код
                  <div className="input-row">
                    <input
                      value={barcode}
                      onChange={(e) => {
                        setBarcode(e.target.value);
                        setFound(null);
                        setFindError('');
                      }}
                      inputMode="numeric"
                      placeholder="EAN-13"
                    />
                    <button
                      type="button"
                      className="btn icon"
                      onClick={() => {
                        setScannerTarget('barcode');
                        setScannerOpen(true);
                      }}
                    >
                      📷
                    </button>
                  </div>
                </label>
                <label>
                  2. Локальный код
                  <div className="input-row">
                    <input
                      value={localcode}
                      onChange={(e) => {
                        setLocalcode(normalizeLocalCodeInput(e.target.value));
                        setFound(null);
                        setFindError('');
                      }}
                      inputMode="numeric"
                      placeholder="до 7 цифр"
                    />
                    <button
                      type="button"
                      className="btn icon"
                      onClick={() => {
                        setScannerTarget('local');
                        setScannerOpen(true);
                      }}
                    >
                      📷
                    </button>
                  </div>
                </label>
                <button
                  type="button"
                  className="btn primary block"
                  disabled={finding}
                  onClick={() => void findProduct()}
                >
                  {finding ? 'Поиск…' : 'Найти'}
                </button>
                {findError ? <p className="error small">{findError}</p> : null}

                {found ? (
                  <div className="print-found-card">
                    <strong>{found.name || '—'}</strong>
                    <div className="muted small">Лок. код: {foundLc || '—'}</div>
                    <div className="muted small">
                      Штрих-код: {found.barcode || found.barcodes?.[0] || barcode || '—'}
                    </div>
                    <div className="print-price-preview">
                      <div className="print-found-price">
                        {foundPrice != null && foundPrice !== ''
                          ? `${formatGoodsPrice(foundPrice)} ₽`
                          : 'Цена не указана'}
                      </div>
                      {promo && regularPrice != null && cardPrice != null ? (
                        <div className="print-price-promo-row">
                          <span className="print-price-old">{formatGoodsPrice(regularPrice)} ₽</span>
                          <span className="print-price-card">{formatGoodsPrice(cardPrice)} ₽ по карте</span>
                        </div>
                      ) : (
                        <div className="muted small">Без акции</div>
                      )}
                    </div>
                    {found.leftover != null ? (
                      <div className="muted small">Остаток: {formatGoodsCount(found.leftover)}</div>
                    ) : null}
                    <label>
                      Количество ценников
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={copies}
                        onChange={(e) => setCopies(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
                      />
                    </label>
                    <label>
                      Тип ценника
                      <select value={printType} onChange={(e) => setPrintType(e.target.value)}>
                        {filteredTypes.map((t) => (
                          <option key={t.value || t.label} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="button" className="btn primary block" onClick={handleAddToList}>
                      Добавить
                    </button>
                  </div>
                ) : null}
                  </>
                )}
              </div>

              <p className="section-title">Список на печать</p>
              {items.length > 0 ? (
                <div className="list compact-list">
                  {items.map((item, idx) => (
                    <div key={item.id} className="item print-queue-item">
                      <div className="print-queue-item-head">
                        <strong>
                          {idx + 1}. {item.productName || displayLocalCode({ localcode: item.localCodeFrom })}
                        </strong>
                        <button type="button" className="btn-remove" onClick={() => removeItem(item.id)}>
                          ✕
                        </button>
                      </div>
                      <div className="meta">
                        Код: {displayLocalCode({ localcode: item.localCodeFrom })}
                        {item.localCodeTo && item.localCodeTo !== item.localCodeFrom
                          ? ` – ${displayLocalCode({ localcode: item.localCodeTo })}`
                          : ''}
                      </div>
                      <div className="meta">
                        {isPriceListJob
                          ? [item.modifiedFrom, item.modifiedTo].filter(Boolean).join(' · ') || 'Прайс-лист'
                          : `${item.priceTagType || 'STANDARD'} · ${item.copyCount} шт.`}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty">
                  {isPriceListJob
                    ? 'Список пуст — добавьте диапазон кодов'
                    : 'Список пуст — найдите товар и нажмите «Добавить»'}
                </p>
              )}

              <div className="card print-footer-actions">
                <div className="row-actions">
                  <button type="button" className="btn" disabled={submitting} onClick={() => void previewJob()}>
                    Просмотр
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={submitting || items.length === 0}
                    onClick={() => void submitJob()}
                  >
                    {submitting ? 'Отправка…' : 'Отправить на печать'}
                  </button>
                </div>
              </div>
            </>
          )}

          {resultHtml ? (
            <div className="card result" dangerouslySetInnerHTML={{ __html: resultHtml }} />
          ) : null}
        </>
      ) : (
        <>
          <p className="pull-hint muted">Нажмите задание — просмотр и повторная отправка</p>
          <div className="list">
            {jobsLoading ? (
              <div className="skeleton" />
            ) : !jobs.length ? (
              <p className="empty">В архиве пока нет заданий</p>
            ) : (
              jobs.map((j, i) => {
                const id = j.id != null ? Number(j.id) : null;
                return (
                  <div
                    key={String(id ?? i)}
                    className="item print-job-item"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (id != null && !Number.isNaN(id)) {
                        setOpenJobFallback(j);
                        setOpenJobId(id);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && id != null && !Number.isNaN(id)) {
                        setOpenJobFallback(j);
                        setOpenJobId(id);
                      }
                    }}
                  >
                    <strong>#{String(j.id ?? '—')}</strong>
                    <div className="meta">
                      {j.jobType || j.type || 'PRICE_TAGS'} · {formatDate(j.createDate)}
                    </div>
                    <div className="meta print-job-hint">Открыть · повторить печать</div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      <PrintJobDialog
        jobId={openJobId}
        fallback={openJobFallback}
        onClose={() => {
          setOpenJobId(null);
          setOpenJobFallback(null);
        }}
        onImportToSession={(job) => {
          importFromJob(job);
          setOpenJobId(null);
          setPrintTab('active');
          toast('Задание загружено в текущий список', 'ok');
        }}
        onResubmitted={loadPrintJobs}
      />

      <ScannerDialog
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={(code) => {
          const cleaned = code.replace(/\D/g, '').slice(0, 20) || code.trim();
          if (!cleaned) {
            toast('Штрих-код не распознан', 'err');
            return;
          }
          if (scannerTarget === 'barcode') {
            setBarcode(cleaned);
            void findProduct(cleaned, '');
          } else {
            setLocalcode(normalizeLocalCodeInput(cleaned));
            void findProduct('', cleaned);
          }
        }}
      />
    </div>
  );
}
