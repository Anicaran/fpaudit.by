import type { Task, TaskResponse } from './types';

export function normalizeTaskStatus(value: string | undefined): string {
  return (value || 'OPEN').toUpperCase();
}

/** Распаковать ответ /api/tasks (массив или Spring Page) и childTasks → responseList. */
export function normalizeTaskList(data: unknown): Task[] {
  let raw: unknown[] = [];
  if (Array.isArray(data)) {
    raw = data;
  } else if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const list = obj.content ?? obj.items ?? obj.tasks ?? obj.childTasks;
    if (Array.isArray(list)) raw = list;
  }

  return raw
    .filter((item): item is Task => !!item && typeof item === 'object' && 'id' in item)
    .map((task) => {
      const anyTask = task as Task & { childTasks?: TaskResponse[] };
      const responseList =
        Array.isArray(anyTask.responseList) && anyTask.responseList.length
          ? anyTask.responseList
          : Array.isArray(anyTask.childTasks)
            ? anyTask.childTasks
            : anyTask.responseList || [];
      return { ...anyTask, responseList };
    });
}

export function pickPrimaryResponse(
  task: Task | null,
  responses: TaskResponse[],
): TaskResponse | null {
  const list =
    responses.length > 0
      ? responses
      : Array.isArray(task?.responseList) && task.responseList.length
        ? task.responseList
        : [];
  if (!list.length) return null;
  return (
    list.find((r) => normalizeTaskStatus(r.status || r.myStatus) === 'IN_PROGRESS') ||
    list.find((r) => (r as { myResponse?: boolean }).myResponse) ||
    list[0]
  );
}

export function getWorkStatus(task: Task | null, response: TaskResponse | null): string {
  if (response) {
    const anyResp = response as TaskResponse & { taskStatus?: string };
    return normalizeTaskStatus(
      anyResp.status || anyResp.myStatus || anyResp.taskStatus,
    );
  }
  const anyTask = task as (Task & { taskStatus?: string }) | null;
  return normalizeTaskStatus(anyTask?.myStatus || anyTask?.status || anyTask?.taskStatus);
}

export function responseId(response: TaskResponse | null): number | null {
  if (!response) return null;
  const id = response.id ?? response.responseId;
  return id != null ? Number(id) : null;
}

export function canStartWork(status: string): boolean {
  return status === 'OPEN';
}

export function canCompleteWork(status: string): boolean {
  return status === 'IN_PROGRESS';
}

export function isTaskClosed(status: string): boolean {
  return status === 'CLOSED' || status === 'COMPLETED';
}

export function isRecountTask(taskType?: string): boolean {
  const t = (taskType || '').toUpperCase();
  return t === 'AUTO_RECOUNT' || t === 'MANUAL_RECOUNT';
}

export function isPrintPriceTagsTask(taskType?: string): boolean {
  return (taskType || '').toUpperCase() === 'PRINT_PRICE_TAGS';
}

export function isUnsoldGoodsTask(taskType?: string): boolean {
  return (taskType || '').toUpperCase() === 'UNSOLD_GOODS';
}

export function finishButtonLabel(taskType?: string): string {
  const t = (taskType || '').toUpperCase();
  if (t === 'AUTO_RECOUNT' || t === 'MANUAL_RECOUNT') return 'Отправить в SAP';
  if (t === 'UNSOLD_GOODS') return 'Отправить в SAP';
  if (isExpirationCheckTask(t)) return 'Отправить';
  return 'Завершить';
}

export function taskTypeActionHint(taskType?: string): string | null {
  const t = (taskType || '').toUpperCase();
  if (t === 'AUTO_RECOUNT' || t === 'MANUAL_RECOUNT') {
    return 'Укажите количество в зале и на складе по каждой позиции, затем отправьте пересчёт в SAP.';
  }
  if (t === 'PRINT_PRICE_TAGS') {
    return 'Позиции для печати загружаются автоматически. Откройте раздел «Печать» и отправьте задание.';
  }
  if (t === 'UNSOLD_GOODS') {
    return 'Укажите пересчёт и причину по каждому неликвиду, затем отправьте в SAP.';
  }
  if (isExpirationCheckTask(taskType)) {
    return 'Отметьте по каждому товару «Продано» или «Не продано», затем завершите задачу.';
  }
  return null;
}

/** API возвращает EXPIRATION_DATE_CHECK; в APK enum — CHECK_EXPIRATION_DATE. */
export function isExpirationCheckTask(taskType?: string): boolean {
  const t = (taskType || '').toUpperCase();
  return t === 'EXPIRATION_DATE_CHECK' || t === 'CHECK_EXPIRATION_DATE';
}
