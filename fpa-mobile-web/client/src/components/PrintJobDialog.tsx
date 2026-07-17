import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { loadPrintJobCache } from '../printJobCache';
import { buildPrintPayloadFromJob } from '../printUtils';
import type { PrintJobDetail, PrintJobSummary } from '../types';
import { formatDate } from '../utils';

interface Props {
  jobId: number | null;
  fallback?: PrintJobSummary | null;
  onClose: () => void;
  onImportToSession: (job: PrintJobDetail) => void;
  onResubmitted: () => void;
}

interface PrintPreviewDoc {
  docId: string;
  fileName: string;
}

function extractPreviewDoc(data: unknown): PrintPreviewDoc | null {
  if (!data || typeof data !== 'object') return null;
  const raw = data as Record<string, unknown>;
  const docId = String(raw.docId ?? raw.docID ?? raw.id ?? '').trim();
  if (!docId) return null;
  const fileName = String(raw.fileName ?? raw.filename ?? raw.name ?? 'preview.pdf').trim() || 'preview.pdf';
  return { docId, fileName };
}

export function PrintJobDialog({ jobId, fallback, onClose, onImportToSession, onResubmitted }: Props) {
  const { session, api } = useSession();
  const { toast } = useToast();
  const [job, setJob] = useState<PrintJobDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [fromCache, setFromCache] = useState(false);

  useEffect(() => {
    if (jobId == null) {
      setJob(null);
      setError('');
      setResult('');
      setPreviewUrl('');
      setFromCache(false);
      return;
    }
    setLoading(true);
    setError('');
    setResult('');
    setPreviewUrl('');
    setJob(null);
    setFromCache(false);

    void (async () => {
      const cached = loadPrintJobCache(jobId);
      try {
        const q = session?.sap ? `?sap=${encodeURIComponent(session.sap)}` : '';
        const data = await api<PrintJobDetail>(`/api/print/jobs/${jobId}${q}`);
        setJob(data);
      } catch (ex) {
        const msg = ex instanceof Error ? ex.message : String(ex);
        if (cached?.elements?.length) {
          setJob(cached);
          setFromCache(true);
          setError('С сервера детали недоступны — показана локальная копия задания.');
        } else if (fallback) {
          setJob({
            id: jobId,
            jobType: fallback.jobType || fallback.type || 'PRICE_TAGS',
            createDate: fallback.createDate,
            elements: [],
          });
          setError(
            msg.includes('404') || msg.includes('Not Found')
              ? 'Детали задания на сервере не найдены (404). Повторная отправка недоступна без позиций.'
              : `Не удалось загрузить: ${msg}`,
          );
        } else {
          setError(msg);
          toast('Не удалось загрузить задание: ' + msg, 'err');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [jobId, api, session?.sap, fallback, toast]);

  useEffect(() => {
    if (jobId == null) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [jobId]);

  async function runAction(action: 'preview' | 'submit') {
    if (!job?.elements?.length) {
      toast('Нет позиций для печати', 'err');
      return;
    }
    const payload = buildPrintPayloadFromJob(job);
    if (!payload.sap) {
      toast('SAP не указан в задании', 'err');
      return;
    }
    setBusy(action === 'preview' ? 'Превью…' : 'Отправка в SAP…');
    setResult('');
    setPreviewUrl('');
    try {
      const path = action === 'preview' ? '/api/print/preview' : '/api/print/submit';
      const data = await api(path, { method: 'POST', body: JSON.stringify(payload) });
      if (action === 'submit') {
        setResult(JSON.stringify(data, null, 2));
        toast('Задание отправлено повторно', 'ok');
        onResubmitted();
      } else {
        const previewDoc = extractPreviewDoc(data);
        if (previewDoc) {
          const fileUrl = `/api/print/files/${encodeURIComponent(previewDoc.docId)}?fileName=${encodeURIComponent(previewDoc.fileName)}`;
          setPreviewUrl(fileUrl);
          setResult('Превью открыто в новой вкладке');
          window.open(fileUrl, '_blank', 'noopener,noreferrer');
        } else {
          setResult(JSON.stringify(data, null, 2));
        }
        toast('Превью готово', 'ok');
      }
    } catch (ex) {
      const msg = ex instanceof Error ? ex.message : String(ex);
      setResult(msg);
      toast(msg, 'err');
    } finally {
      setBusy('');
    }
  }

  if (jobId == null) return null;

  const hasElements = (job?.elements?.length ?? 0) > 0;

  return createPortal(
    <div
      className="modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-sheet print-job-sheet" role="dialog" aria-modal="true">
        <div className="modal-sheet-header">
          <h2>Задание #{jobId}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>

        {loading ? <p className="muted">Загрузка…</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {fromCache ? <p className="muted small">Данные из локального кэша</p> : null}

        {job ? (
          <>
            <div className="print-job-meta muted">
              <div>Тип: {job.jobType || 'PRICE_TAGS'}</div>
              <div>Дата: {formatDate(job.createDate)}</div>
              <div>Только в наличии: {job.inStock == null ? '—' : job.inStock ? 'да' : 'нет'}</div>
              <div>SAP: {job.sap || session?.sap || '—'}</div>
            </div>
            <p className="section-label">Позиции ({job.elements?.length ?? 0})</p>
            <div className="list compact">
              {hasElements ? (
                (job.elements || []).map((el, i) => (
                  <div key={i} className="item print-job-element">
                    <strong>{el.productName || 'Без названия'}</strong>
                    <div className="meta">
                      Код: {el.localCodeFrom || el.localCodeTo || '—'}
                      {el.localCodeTo && el.localCodeTo !== el.localCodeFrom ? ` → ${el.localCodeTo}` : ''}
                    </div>
                    <div className="meta">
                      Тип: {el.priceTagType || '—'} · Копий: {el.copyCount ?? 1}
                    </div>
                  </div>
                ))
              ) : (
                <p className="muted">Позиции не загружены</p>
              )}
            </div>
            <div className="row-actions">
              <button
                type="button"
                className="btn primary"
                disabled={!!busy || !hasElements}
                onClick={() => void runAction('submit')}
              >
                {busy === 'Отправка в SAP…' ? busy : 'Отправить снова'}
              </button>
              <button
                type="button"
                className="btn"
                disabled={!!busy || !hasElements}
                onClick={() => void runAction('preview')}
              >
                {busy === 'Превью…' ? busy : 'Превью'}
              </button>
              {hasElements ? (
                <button type="button" className="btn" onClick={() => onImportToSession(job)}>
                  В новое задание
                </button>
              ) : null}
            </div>
            {previewUrl ? (
              <p className="small">
                <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                  Открыть PDF снова
                </a>
              </p>
            ) : null}
            {result ? <pre className="print-job-result muted">{result}</pre> : null}
          </>
        ) : null}

        {!loading && !job ? (
          <button type="button" className="btn block" onClick={onClose}>
            Закрыть
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
