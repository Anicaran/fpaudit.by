import type { Task } from './types';

export function parseDeadlineDate(value: unknown): Date | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isNaN(n) && n > 1e11) return new Date(n);
  const str = String(value);
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  if (!Number.isNaN(n) && n > 0) return new Date(n);
  return null;
}

export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function groupTasksByDeadline(tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  for (const task of tasks) {
    const d = parseDeadlineDate(task.deadlineDate);
    if (!d) continue;
    const key = dateKey(d);
    const list = map.get(key) ?? [];
    list.push(task);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => {
      const da = parseDeadlineDate(a.deadlineDate)?.getTime() ?? 0;
      const db = parseDeadlineDate(b.deadlineDate)?.getTime() ?? 0;
      return da - db;
    });
  }
  return map;
}

export interface CalendarCell {
  date: Date;
  inMonth: boolean;
  key: string;
}

export function buildMonthGrid(year: number, month: number): CalendarCell[] {
  const first = new Date(year, month, 1);
  let startOffset = first.getDay() - 1;
  if (startOffset < 0) startOffset = 6;

  const startDate = new Date(year, month, 1 - startOffset);
  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
    cells.push({
      date,
      inMonth: date.getMonth() === month,
      key: dateKey(date),
    });
  }
  return cells;
}

export const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function monthTitle(year: number, month: number): string {
  const title = new Date(year, month, 1).toLocaleDateString('ru-RU', {
    month: 'long',
    year: 'numeric',
  });
  return title.charAt(0).toUpperCase() + title.slice(1);
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}

export function dayHasOverdue(tasks: Task[]): boolean {
  return tasks.some((t) => t.overdue);
}
