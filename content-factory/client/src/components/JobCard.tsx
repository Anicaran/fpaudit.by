import type { ContentJob } from '../lib/types';
import { CHANNEL_LABEL, STATUS_LABEL, formatDate } from '../lib/format';

interface Props {
  job: ContentJob;
  onApprove?: (scheduled?: boolean) => void;
  onReject?: () => void;
  onRerun?: () => void;
  busy?: boolean;
}

export function JobCard({ job, onApprove, onReject, onRerun, busy }: Props) {
  const badgeClass =
    job.status === 'review'
      ? 'badge badge-review'
      : job.status === 'published'
        ? 'badge badge-published'
        : job.status === 'rejected'
          ? 'badge badge-rejected'
          : 'badge';

  return (
    <article className="item">
      <div className="item-top">
        <div>
          <h3>{job.title}</h3>
          <p className="mono">
            {job.id} · обновлено {formatDate(job.updated_at)}
          </p>
        </div>
        <span className={badgeClass}>{STATUS_LABEL[job.status]}</span>
      </div>
      {job.research_brief ? <p>{job.research_brief}</p> : null}
      {typeof job.quality_score === 'number' ? (
        <p className="mono">quality score: {job.quality_score}</p>
      ) : null}
      {job.drafts?.length ? (
        <div className="draft-grid">
          {job.drafts.map((draft) => (
            <div className="draft" key={`${job.id}-${draft.channel}`}>
              <h4>{CHANNEL_LABEL[draft.channel] || draft.channel}</h4>
              <pre>{draft.body}</pre>
            </div>
          ))}
        </div>
      ) : null}
      {(onApprove || onReject || onRerun) && (
        <div className="item-actions">
          {onApprove ? (
            <>
              <button className="btn btn-signal" disabled={busy} onClick={() => onApprove(false)}>
                Опубликовать сейчас
              </button>
              <button className="btn btn-secondary" disabled={busy} onClick={() => onApprove(true)}>
                В календарь
              </button>
            </>
          ) : null}
          {onRerun ? (
            <button className="btn btn-secondary" disabled={busy} onClick={onRerun}>
              Пересобрать
            </button>
          ) : null}
          {onReject ? (
            <button className="btn btn-danger" disabled={busy} onClick={onReject}>
              Отклонить
            </button>
          ) : null}
        </div>
      )}
    </article>
  );
}
