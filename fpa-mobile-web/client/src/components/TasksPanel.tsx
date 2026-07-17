import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '../context/SessionContext';
import { useToast } from '../context/ToastContext';
import { normalizeTaskList, normalizeTaskStatus } from '../taskUtils';
import type { PrintWorkSession, Task } from '../types';
import { TaskCard } from './TaskCard';
import { TaskDialog } from './TaskDialog';

const FILTERS = [
  { label: 'Активные', status: 'OPEN,IN_PROGRESS' },
  { label: 'В работе', status: 'IN_PROGRESS' },
  { label: 'Открытые', status: 'OPEN' },
  { label: 'Закрытые', status: 'CLOSED,COMPLETED' },
];

export function TasksPanel({
  onImportPrintTask,
  onGoPrint,
  sap,
}: {
  onImportPrintTask?: (session: PrintWorkSession) => void;
  onGoPrint?: () => void;
  sap?: string;
}) {
  const { api } = useSession();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('OPEN,IN_PROGRESS');
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef(search);
  searchRef.current = search;

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const url = new URL('/api/tasks', location.origin);
      url.searchParams.set('page', '0');
      url.searchParams.set('per_page', '50');
      url.searchParams.set('status', statusFilter);
      const q = searchRef.current.trim();
      if (q) url.searchParams.set('name', q);
      const data = await api<unknown>(url.pathname + url.search);
      setTasks(normalizeTaskList(data));
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : String(ex));
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [api, statusFilter]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    let startY = 0;
    let pulling = false;

    const onStart = (e: TouchEvent) => {
      if (panel.scrollTop <= 0) {
        startY = e.touches[0].clientY;
        pulling = true;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (!pulling) return;
      if (e.touches[0].clientY - startY > 80) {
        pulling = false;
        void loadTasks();
        toast('Обновлено', 'ok');
      }
    };
    const onEnd = () => {
      pulling = false;
    };

    panel.addEventListener('touchstart', onStart, { passive: true });
    panel.addEventListener('touchmove', onMove, { passive: true });
    panel.addEventListener('touchend', onEnd);
    return () => {
      panel.removeEventListener('touchstart', onStart);
      panel.removeEventListener('touchmove', onMove);
      panel.removeEventListener('touchend', onEnd);
    };
  }, [loadTasks, toast]);

  function openTaskFromItem(t: Task, respId?: number) {
    setOpenTask({ ...t, childTaskId: respId ?? t.childTaskId });
  }

  return (
    <div ref={panelRef} className={'panel active' + (loading ? ' refreshing' : '')}>
      <div className="chips">
        {FILTERS.map((f) => (
          <button
            key={f.status}
            type="button"
            className={'chip' + (statusFilter === f.status ? ' active' : '')}
            onClick={() => setStatusFilter(f.status)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Поиск по названию…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void loadTasks()}
        />
        <button type="button" className="btn sm" title="Обновить" onClick={() => void loadTasks()}>
          ↻
        </button>
      </div>
      <p className="pull-hint muted">Потяните вниз для обновления</p>
      <div className="list">
        {loading ? (
          <>
            <div className="skeleton" />
            <div className="skeleton" />
          </>
        ) : error ? (
          <p className="empty error">{error}</p>
        ) : !tasks.length ? (
          <p className="empty">Задач не найдено</p>
        ) : (
          tasks.map((t) => {
            const responses = t.responseList || [];
            const myResp =
              responses.find(
                (r) => normalizeTaskStatus(r.status || r.myStatus) === 'IN_PROGRESS',
              ) ||
              responses.find((r) => (r as { myResponse?: boolean }).myResponse) ||
              responses[0];
            const respId = myResp?.id ?? myResp?.responseId ?? t.childTaskId;
            return (
              <TaskCard
                key={t.id}
                task={t}
                respId={respId != null ? Number(respId) : undefined}
                onOpen={openTaskFromItem}
              />
            );
          })
        )}
      </div>
      <TaskDialog
        task={openTask}
        onClose={() => setOpenTask(null)}
        onUpdated={loadTasks}
        sap={sap}
        onImportPrintTask={onImportPrintTask}
        onGoPrint={() => {
          onGoPrint?.();
          setOpenTask(null);
        }}
      />
    </div>
  );
}
