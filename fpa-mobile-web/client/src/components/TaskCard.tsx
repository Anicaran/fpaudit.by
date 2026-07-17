import { useState, type MouseEvent } from 'react';
import type { Task } from '../types';
import { badgeClass, formatDate, statusLabel } from '../utils';

const TITLE_LIMIT = 72;
const DESC_LIMIT = 100;

interface CollapsibleTextProps {
  text: string;
  className?: string;
  maxLines?: number;
  charLimit?: number;
  as?: 'div' | 'h3';
}

function CollapsibleText({
  text,
  className = '',
  maxLines = 2,
  charLimit = 90,
  as: Tag = 'div',
}: CollapsibleTextProps) {
  const [expanded, setExpanded] = useState(false);
  const lineCount = text.split('\n').length;
  const collapsible = text.length > charLimit || lineCount > maxLines;

  function toggle(e: MouseEvent) {
    e.stopPropagation();
    setExpanded((v) => !v);
  }

  return (
    <div className={'collapsible' + (collapsible ? ' collapsible-has-toggle' : '')}>
      <Tag
        className={
          className + (collapsible && !expanded ? ` text-clamp text-clamp-${maxLines}` : '')
        }
      >
        {text}
      </Tag>
      {collapsible ? (
        <button type="button" className="btn-expand" onClick={toggle}>
          {expanded ? 'Свернуть' : 'Развернуть'}
        </button>
      ) : null}
    </div>
  );
}

interface Props {
  task: Task;
  respId?: number;
  onOpen: (task: Task, respId?: number) => void;
}

export function TaskCard({ task, respId, onOpen }: Props) {
  const st = task.myStatus || task.status;
  const stNorm = (st || 'OPEN').toUpperCase();
  const title = task.name || 'Без названия';
  const hasLongBody =
    (task.description && task.description.length > DESC_LIMIT) ||
    (task.executorName && task.executorName.length > 40) ||
    title.length > TITLE_LIMIT;

  return (
    <article
      className={'item task-card' + (hasLongBody ? ' task-card-collapsible' : '')}
      onClick={() => onOpen(task, respId)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(task, respId)}
      role="button"
      tabIndex={0}
    >
      <CollapsibleText text={title} className="task-title" maxLines={2} charLimit={TITLE_LIMIT} as="h3" />
      <div className="meta task-meta-row">
        <span className={'badge ' + badgeClass(st) + (task.overdue ? ' overdue' : '')}>
          {statusLabel(st)}
        </span>
        {task.taskType} · до {formatDate(task.deadlineDate)}
      </div>
      {task.description ? (
        <CollapsibleText
          text={task.description}
          className="meta task-desc"
          maxLines={2}
          charLimit={DESC_LIMIT}
        />
      ) : null}
      {task.executorName ? (
        <CollapsibleText
          text={task.executorName}
          className="meta task-executor"
          maxLines={1}
          charLimit={40}
        />
      ) : null}
      {stNorm === 'OPEN' ? (
        <div className="task-card-hint muted">Откройте задачу и нажмите «В работу»</div>
      ) : null}
    </article>
  );
}
