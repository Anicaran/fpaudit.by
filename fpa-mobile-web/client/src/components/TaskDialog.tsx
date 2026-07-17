import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { elementsToQueueItems } from '../printUtils';
import {
  canCompleteWork,
  canStartWork,
  finishButtonLabel,
  getWorkStatus,
  isExpirationCheckTask,
  isPrintPriceTagsTask,
  isRecountTask,
  isTaskClosed,
  isUnsoldGoodsTask,
  pickPrimaryResponse,
  responseId,
  taskTypeActionHint,
} from '../taskUtils';
import type { PrintJobElement, PrintWorkSession, Task, TaskResponse } from '../types';
import { badgeClass, formatDate, statusLabel } from '../utils';
import { ExpirationGoodsCheck } from './ExpirationGoodsCheck';
import { RecountGoodsCheck } from './RecountGoodsCheck';
import { UnsoldGoodsCheck } from './UnsoldGoodsCheck';

interface Props {
  task: Task | null;
  onClose: () => void;
  onUpdated: () => void;
  sap?: string;
  onImportPrintTask?: (session: PrintWorkSession) => void;
  onGoPrint?: () => void;
}

function pickResponses(task: Task | null, apiData: { items?: TaskResponse[] } | null): TaskResponse[] {
  const fromApi = apiData?.items;
  if (Array.isArray(fromApi) && fromApi.length) return fromApi;
  const anyTask = task as (Task & { childTasks?: TaskResponse[] }) | null;
  const embedded =
    (Array.isArray(anyTask?.responseList) && anyTask.responseList.length
      ? anyTask.responseList
      : null) ||
    (Array.isArray(anyTask?.childTasks) && anyTask.childTasks.length ? anyTask.childTasks : null);
  if (embedded) return embedded;
  return [];
}

export function TaskDialog({
  task,
  onClose,
  onUpdated,
  sap,
  onImportPrintTask,
  onGoPrint,
}: Props) {
  const { api } = useSession();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [responses, setResponses] = useState<TaskResponse[]>([]);
  const [selected, setSelected] = useState<TaskResponse | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [expirationReady, setExpirationReady] = useState(false);
  const [expirationPayload, setExpirationPayload] = useState<
    Array<{ orderNumber: number; localcode: string; countWriteOff: number | null }>
  >([]);
  const [recountReady, setRecountReady] = useState(false);
  const [unsoldReady, setUnsoldReady] = useState(false);
  const [printLoaded, setPrintLoaded] = useState(false);
  const [printCount, setPrintCount] = useState(0);
  const [printLoadError, setPrintLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [forceInProgress, setForceInProgress] = useState(false);

  const handleExpirationReady = useCallback((ready: boolean) => {
    setExpirationReady(ready);
  }, []);

  const handleExpirationPayload = useCallback(
    (payload: Array<{ orderNumber: number; localcode: string; countWriteOff: number | null }>) => {
      setExpirationPayload(payload);
    },
    [],
  );

  const handleRecountReady = useCallback((ready: boolean) => {
    setRecountReady(ready);
  }, []);

  const handleUnsoldReady = useCallback((ready: boolean) => {
    setUnsoldReady(ready);
  }, []);

  const reload = useCallback(async () => {
    if (!task) return;
    setLoading(true);
    setLoadError('');
    let display = pickResponses(task, null);
    try {
      const data = await api<{ items?: TaskResponse[] }>(`/api/tasks/${task.id}/responses`);
      display = pickResponses(task, data);
    } catch (ex) {
      if (!display.length) {
        setLoadError(ex instanceof Error ? ex.message : String(ex));
        setResponses([]);
        setSelected(null);
        setLoading(false);
        return;
      }
    }
    setResponses(display);
    setSelected((prev) => {
      const primary = pickPrimaryResponse(task, display);
      if (!primary) return null;
      const prevId = responseId(prev);
      if (prevId != null) {
        const same = display.find((r) => responseId(r) === prevId);
        if (same) return same;
      }
      return primary;
    });
    setLoading(false);
  }, [api, task]);

  useEffect(() => {
    if (!task) return;
    setComment('');
    setExpirationReady(false);
    setExpirationPayload([]);
    setRecountReady(false);
    setUnsoldReady(false);
    setPrintLoaded(false);
    setPrintCount(0);
    setPrintLoadError('');
    setActionError('');
    setForceInProgress(false);
    void reload();
  }, [task, reload]);

  const workStatus = forceInProgress ? 'IN_PROGRESS' : getWorkStatus(task, selected);
  const showStart = canStartWork(workStatus) && !forceInProgress;
  const showComplete = canCompleteWork(workStatus) || forceInProgress;
  const closed = isTaskClosed(workStatus) && !forceInProgress;
  const expirationTask = isExpirationCheckTask(task?.taskType);
  const recountTask = isRecountTask(task?.taskType);
  const unsoldTask = isUnsoldGoodsTask(task?.taskType);
  const printTask = isPrintPriceTagsTask(task?.taskType);
  const actionHint = taskTypeActionHint(task?.taskType);
  const finishLabel = finishButtonLabel(task?.taskType);
  const selectedId = responseId(selected);
  // Только version ответа (child). version родительской задачи ломает start → 400/409.
  const selectedVersion = selected?.version ?? selected?.childVersion ?? null;

  const canFinish =
    (!expirationTask || expirationReady) &&
    (!recountTask || recountReady) &&
    (!unsoldTask || unsoldReady);

  useEffect(() => {
    if (!printTask || !selectedId || !showComplete || !onImportPrintTask) {
      return;
    }
    let cancelled = false;
    void (async () => {
      setPrintLoadError('');
      try {
        const url = new URL(`/api/tasks/print-task/${selectedId}/items`, location.origin);
        if (task?.id) url.searchParams.set('taskId', String(task.id));
        const data = await api<{
          elements?: PrintJobElement[];
          inStock?: boolean;
        }>(url.pathname + url.search);
        if (cancelled) return;
        const elements = data.elements || [];
        if (!elements.length) {
          setPrintLoadError('Позиции для печати не найдены в задаче.');
          return;
        }
        onImportPrintTask({
          inStock: data.inStock ?? true,
          jobType: 'PRICE_TAGS',
          items: elementsToQueueItems(elements),
        });
        setPrintCount(elements.length);
        setPrintLoaded(true);
        toast(`Загружено ${elements.length} поз. в печать`, 'ok');
      } catch (ex) {
        if (!cancelled) {
          setPrintLoadError(ex instanceof Error ? ex.message : String(ex));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [printTask, selectedId, showComplete, task?.id, api, onImportPrintTask, toast]);

  async function resolveResponseVersion(forceRefresh = false): Promise<number | null> {
    if (!forceRefresh && selectedVersion != null && Number.isFinite(Number(selectedVersion))) {
      return Number(selectedVersion);
    }
    if (!selectedId) throw new Error('Не найден ответ по задаче');
    const url = new URL(`/api/tasks/responses/${selectedId}/executable`, location.origin);
    if (task?.id) url.searchParams.set('taskId', String(task.id));
    const data = await api<{
      task?: {
        version?: number;
        childVersion?: number;
        responseVersion?: number;
        childTask?: { version?: number; childVersion?: number };
      } | null;
    }>(url.pathname + url.search);
    const nested = data.task?.childTask;
    const version =
      data.task?.version ??
      data.task?.childVersion ??
      data.task?.responseVersion ??
      nested?.version ??
      nested?.childVersion ??
      null;
    if (version == null) return null;
    setSelected((prev) => (prev ? { ...prev, version: Number(version) } : prev));
    return Number(version);
  }

  function startUrl(responseId: number): string {
    const url = new URL(`/api/tasks/responses/${responseId}/start`, location.origin);
    if (task?.id) url.searchParams.set('taskId', String(task.id));
    return url.pathname + url.search;
  }

  function completeUrl(responseId: number): string {
    const url = new URL(`/api/tasks/responses/${responseId}/complete`, location.origin);
    if (task?.id) url.searchParams.set('taskId', String(task.id));
    return url.pathname + url.search;
  }

  async function startWork() {
    if (!selectedId) {
      const msg = 'Не найден ответ по задаче';
      setActionError(msg);
      toast(msg, 'err');
      return;
    }
    setBusy(true);
    setActionError('');
    try {
      // Всегда освежаем version с сервера — устаревший/version родителя даёт 400
      const version = await resolveResponseVersion(true);
      await api(startUrl(selectedId), {
        method: 'POST',
        body: JSON.stringify({
          version: version ?? undefined,
          comment: comment.trim() || '',
        }),
      });
      setSelected((prev) =>
        prev
          ? {
              ...prev,
              status: 'IN_PROGRESS',
              myStatus: 'IN_PROGRESS',
              version: version != null ? Number(version) + 1 : prev.version,
            }
          : prev,
      );
      setForceInProgress(true);
      toast('Задача взята в работу', 'ok');
      onUpdated();
      try {
        await reload();
      } catch {
        /* список уже открыт оптимистично */
      }
    } catch (ex) {
      const msg = (ex instanceof Error ? ex.message : String(ex)) || 'Не удалось взять задачу в работу';
      setActionError(msg);
      toast(msg, 'err');
    } finally {
      setBusy(false);
    }
  }

  async function completeWork() {
    if (!selectedId) {
      const msg = 'Не найден ответ по задаче';
      setActionError(msg);
      toast(msg, 'err');
      return;
    }
    if (expirationTask && !expirationReady) {
      const msg = 'Отметьте все товары: «Продано» или «Не продано»';
      setActionError(msg);
      toast(msg, 'err');
      return;
    }
    if (recountTask && !recountReady) {
      toast('Сначала отправьте пересчёт в SAP', 'err');
      return;
    }
    if (unsoldTask && !unsoldReady) {
      toast('Сначала отправьте неликвиды в SAP', 'err');
      return;
    }
    setBusy(true);
    setActionError('');
    try {
      // 1) Сначала check (как APK sendGoods), 2) потом stop со свежим version
      if (expirationTask) {
        if (!expirationPayload.length) {
          throw new Error('Нет данных для отправки. Отметьте все товары ещё раз.');
        }
        await api(`/api/tasks/expiration/${selectedId}/check`, {
          method: 'POST',
          body: JSON.stringify(expirationPayload),
        });
      }
      // version после check — APK увеличивает version ответа
      const version = await resolveResponseVersion(true);
      await api(completeUrl(selectedId), {
        method: 'POST',
        body: JSON.stringify({
          version: version ?? undefined,
          comment: comment.trim() || '',
        }),
      });
      toast(expirationTask ? 'Проверка отправлена' : 'Задача завершена', 'ok');
      onUpdated();
      onClose();
    } catch (ex) {
      const msg =
        (ex instanceof Error ? ex.message : String(ex)) ||
        'Не удалось отправить задачу (пустой ответ сервера). Проверьте магазин и повторите.';
      setActionError(msg);
      toast(msg, 'err');
    } finally {
      setBusy(false);
    }
  }

  if (!task) return null;

  const showTaskForm =
    showComplete && (expirationTask || recountTask || unsoldTask || printTask);

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-sheet task-detail-sheet" role="dialog" aria-modal="true">
        <div className="modal-sheet-header">
          <h2>{task.name || `Задача #${task.id}`}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>

        {loading ? (
          <p className="muted">Загрузка…</p>
        ) : loadError ? (
          <p className="error">{loadError}</p>
        ) : (
          <>
            <div className="task-detail-info">
              <div className="task-detail-meta">
                <span className={'badge ' + badgeClass(workStatus) + (task.overdue ? ' overdue' : '')}>
                  {statusLabel(workStatus)}
                </span>
                {task.taskType ? <span className="muted">{task.taskType}</span> : null}
              </div>
              <div className="muted small">Срок: {formatDate(task.deadlineDate)}</div>
              {task.executorName ? (
                <div className="muted small">Исполнитель: {task.executorName}</div>
              ) : null}
              {selectedId ? <div className="muted small">Ответ #{selectedId}</div> : null}
              {task.description && !showTaskForm ? (
                <p className="task-detail-desc">{task.description}</p>
              ) : null}
            </div>

            {showComplete && expirationTask && selectedId ? (
              <div className="task-detail-phase task-detail-phase-primary">
                <ExpirationGoodsCheck
                  responseId={selectedId}
                  taskId={task.id}
                  initialItems={selected?.expirationDateGoods}
                  disabled={busy}
                  onReadyChange={handleExpirationReady}
                  onSubmitPayload={handleExpirationPayload}
                />
              </div>
            ) : null}

            {showComplete && recountTask && selectedId ? (
              <div className="task-detail-phase task-detail-phase-primary">
                <RecountGoodsCheck
                  responseId={selectedId}
                  taskId={task.id}
                  disabled={busy}
                  onReadyChange={handleRecountReady}
                />
              </div>
            ) : null}

            {showComplete && unsoldTask && selectedId ? (
              <div className="task-detail-phase task-detail-phase-primary">
                <UnsoldGoodsCheck
                  responseId={selectedId}
                  taskId={task.id}
                  sap={sap || ''}
                  disabled={busy}
                  onReadyChange={handleUnsoldReady}
                  onSubmitPayload={() => {}}
                />
              </div>
            ) : null}

            {showComplete && printTask ? (
              <div className="task-detail-phase">
                {printLoaded ? (
                  <div className="card task-action-box">
                    <strong>Печать ценников</strong>
                    <p className="muted small">
                      В задание на печать загружено {printCount} поз. Откройте раздел «Печать» и
                      отправьте в SAP.
                    </p>
                    {onGoPrint ? (
                      <button type="button" className="btn primary block" onClick={onGoPrint}>
                        Открыть печать
                      </button>
                    ) : null}
                  </div>
                ) : printLoadError ? (
                  <p className="error small">{printLoadError}</p>
                ) : (
                  <p className="muted small">Загрузка позиций для печати…</p>
                )}
              </div>
            ) : null}

            {!selected ? (
              <p className="muted">Ответ по задаче не найден. Обратитесь к автору в FP Audit.</p>
            ) : responses.length > 1 ? (
              <div className="task-response-picker">
                <p className="section-label">Ответы</p>
                <div className="list compact">
                  {responses.map((r) => {
                    const id = responseId(r);
                    const st = r.status || r.myStatus || '—';
                    const isSelected = id === selectedId;
                    return (
                      <div
                        key={String(id)}
                        className={'item' + (isSelected ? ' selected' : '')}
                        onClick={() => setSelected(r)}
                        onKeyDown={(e) => e.key === 'Enter' && setSelected(r)}
                        role="button"
                        tabIndex={0}
                      >
                        <strong>Ответ #{id}</strong>
                        <div className="meta">
                          <span className={'badge ' + badgeClass(String(st))}>{statusLabel(String(st))}</span>
                          {r.executorName}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {actionError ? <p className="error">{actionError}</p> : null}

            {showStart ? (
              <div className="task-detail-phase">
                <p className="muted small">
                  {expirationTask
                    ? 'Нажмите «В работу» — откроется список товаров с кнопками «Продано» / «Не продано».'
                    : 'Сначала возьмите задачу в работу, затем откроются действия по выполнению.'}
                </p>
                <button type="button" className="btn primary block" disabled={busy} onClick={() => void startWork()}>
                  {busy ? 'Отправка…' : 'В работу'}
                </button>
              </div>
            ) : null}

            {showComplete ? (
              <div className="task-detail-phase">
                {actionHint && !showTaskForm ? (
                  <div className="card task-action-box">
                    <strong>Действия</strong>
                    <p className="muted small">{actionHint}</p>
                  </div>
                ) : actionHint && printTask ? (
                  <p className="muted small">{actionHint}</p>
                ) : null}
                {expirationTask && expirationReady ? (
                  <p className="muted small">Все товары отмечены. Можно отправить результат.</p>
                ) : null}
                <label>
                  Комментарий
                  <textarea
                    rows={2}
                    placeholder="Необязательно"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="btn primary block"
                  disabled={busy || !canFinish}
                  onClick={() => void completeWork()}
                >
                  {busy ? 'Отправка…' : finishLabel}
                </button>
              </div>
            ) : null}

            {closed ? (
              <div className="task-detail-phase">
                <p className="muted">Задача закрыта.</p>
                {selected?.comment ? <p className="small">{selected.comment}</p> : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
