import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../context/SessionContext';
import { normalizeTaskList, normalizeTaskStatus } from '../taskUtils';
import type { Task } from '../types';

export function isTaskNotInWork(task: Task): boolean {
  const st = normalizeTaskStatus(task.myStatus || task.status);
  if (st === 'IN_PROGRESS' || st === 'CLOSED' || st === 'COMPLETED') return false;
  const responses = task.responseList || [];
  const hasInProgress = responses.some(
    (r) => normalizeTaskStatus(r.status || r.myStatus) === 'IN_PROGRESS',
  );
  return !hasInProgress && st === 'OPEN';
}

export function countTasksNotInWork(tasks: Task[]): number {
  return tasks.filter(isTaskNotInWork).length;
}

export function useNewTasksCount(enabled = true) {
  const { api } = useSession();
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const url = new URL('/api/tasks', location.origin);
      url.searchParams.set('page', '0');
      url.searchParams.set('per_page', '50');
      url.searchParams.set('status', 'OPEN');
      const data = await api<unknown>(url.pathname + url.search);
      setCount(countTasksNotInWork(normalizeTaskList(data)));
    } catch {
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, [api, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { count, loading, refresh };
}
