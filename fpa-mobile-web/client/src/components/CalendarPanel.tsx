import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '../context/SessionContext';
import {
  buildMonthGrid,
  dateKey,
  dayHasOverdue,
  groupTasksByDeadline,
  isSameDay,
  isToday,
  monthTitle,
  WEEKDAY_LABELS,
} from '../calendarUtils';
import { normalizeTaskList, normalizeTaskStatus } from '../taskUtils';
import type { PrintWorkSession, Task } from '../types';
import { TaskCard } from './TaskCard';
import { TaskDialog } from './TaskDialog';

const STATUS_FILTER = 'OPEN,IN_PROGRESS,CLOSED,COMPLETED';

interface Props {
  onImportPrintTask?: (session: PrintWorkSession) => void;
  onGoPrint?: () => void;
  sap?: string;
}

export function CalendarPanel({ onImportPrintTask, onGoPrint, sap }: Props) {
  const { api } = useSession();
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(today);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openTask, setOpenTask] = useState<Task | null>(null);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const url = new URL('/api/tasks', location.origin);
      url.searchParams.set('page', '0');
      url.searchParams.set('per_page', '200');
      url.searchParams.set('status', STATUS_FILTER);
      const data = await api<unknown>(url.pathname + url.search);
      setTasks(normalizeTaskList(data));
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : String(ex));
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const tasksByDay = useMemo(() => groupTasksByDeadline(tasks), [tasks]);
  const monthCells = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const selectedKey = dateKey(selectedDate);
  const selectedTasks = tasksByDay.get(selectedKey) ?? [];

  const monthTaskCount = useMemo(() => {
    let count = 0;
    for (const cell of monthCells) {
      if (!cell.inMonth) continue;
      count += tasksByDay.get(cell.key)?.length ?? 0;
    }
    return count;
  }, [monthCells, tasksByDay]);

  function shiftMonth(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  function goToday() {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setSelectedDate(now);
  }

  function openTaskFromItem(t: Task, respId?: number) {
    setOpenTask({ ...t, childTaskId: respId ?? t.childTaskId });
  }

  function renderTaskCard(t: Task) {
    const responses = t.responseList || [];
    const myResp =
      responses.find((r) => normalizeTaskStatus(r.status || r.myStatus) === 'IN_PROGRESS') ||
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
  }

  return (
    <div className={'panel active calendar-panel' + (loading ? ' refreshing' : '')}>
      <div className="card calendar-card">
        <div className="calendar-header">
          <button type="button" className="btn sm calendar-nav" onClick={() => shiftMonth(-1)} aria-label="Предыдущий месяц">
            ‹
          </button>
          <div className="calendar-title-wrap">
            <strong className="calendar-title">{monthTitle(viewYear, viewMonth)}</strong>
            <span className="muted small">
              {monthTaskCount > 0 ? `${monthTaskCount} задач с дедлайном` : 'Нет задач с дедлайном'}
            </span>
          </div>
          <button type="button" className="btn sm calendar-nav" onClick={() => shiftMonth(1)} aria-label="Следующий месяц">
            ›
          </button>
        </div>

        <div className="calendar-weekdays">
          {WEEKDAY_LABELS.map((label) => (
            <span key={label} className="calendar-weekday">
              {label}
            </span>
          ))}
        </div>

        <div className="calendar-grid">
          {monthCells.map((cell) => {
            const dayTasks = tasksByDay.get(cell.key) ?? [];
            const selected = isSameDay(cell.date, selectedDate);
            const todayCell = isToday(cell.date);
            const overdue = dayHasOverdue(dayTasks);
            return (
              <button
                key={cell.key}
                type="button"
                className={
                  'calendar-day' +
                  (cell.inMonth ? '' : ' calendar-day-outside') +
                  (selected ? ' calendar-day-selected' : '') +
                  (todayCell ? ' calendar-day-today' : '') +
                  (dayTasks.length ? ' calendar-day-has-tasks' : '') +
                  (overdue ? ' calendar-day-overdue' : '')
                }
                onClick={() => setSelectedDate(cell.date)}
                aria-label={`${cell.date.getDate()} ${monthTitle(cell.date.getFullYear(), cell.date.getMonth())}`}
                aria-pressed={selected}
              >
                <span className="calendar-day-num">{cell.date.getDate()}</span>
                {dayTasks.length ? (
                  <span className="calendar-day-dots" aria-hidden="true">
                    {dayTasks.length <= 3 ? (
                      Array.from({ length: dayTasks.length }).map((_, i) => (
                        <span key={i} className={'calendar-dot' + (overdue ? ' overdue' : '')} />
                      ))
                    ) : (
                      <span className="calendar-dot-count">{dayTasks.length > 9 ? '9+' : dayTasks.length}</span>
                    )}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="calendar-actions">
          <button type="button" className="btn sm ghost" onClick={goToday}>
            Сегодня
          </button>
          <button type="button" className="btn sm" onClick={() => void loadTasks()} title="Обновить">
            ↻
          </button>
        </div>
      </div>

      <div className="calendar-day-panel">
        <h3 className="calendar-day-title">
          {selectedDate.toLocaleDateString('ru-RU', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </h3>
        {loading ? (
          <div className="skeleton" />
        ) : error ? (
          <p className="empty error">{error}</p>
        ) : !selectedTasks.length ? (
          <p className="empty muted">На этот день задач с дедлайном нет</p>
        ) : (
          <div className="list calendar-task-list">{selectedTasks.map(renderTaskCard)}</div>
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
