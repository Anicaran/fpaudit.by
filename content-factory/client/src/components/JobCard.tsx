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

  const video = job.video;

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

      {video?.video_url ? (
        <div className="video-block">
          <video className="video-player" controls playsInline src={video.video_url} />
          <div className="video-meta mono">
            <span>{video.duration_sec ?? '—'}s</span>
            <span>{video.voice_engine}</span>
            <span>{video.visual_engine}</span>
            <span>{video.assembler}</span>
          </div>
          {video.frame_urls?.length ? (
            <div className="frame-strip">
              {video.frame_urls.map((url) => (
                <img key={url} src={url} alt="Кадр ролика" />
              ))}
            </div>
          ) : null}
          {video.scenes?.length ? (
            <div className="scene-list">
              {video.scenes.map((scene) => (
                <div className="scene" key={`${job.id}-s-${scene.index}`}>
                  <strong className="mono">
                    {String(scene.index + 1).padStart(2, '0')} · {scene.title}
                  </strong>
                  <p>{scene.narration}</p>
                </div>
              ))}
            </div>
          ) : null}
          {video.voice_url ? (
            <audio controls src={video.voice_url} style={{ width: '100%' }} />
          ) : null}
        </div>
      ) : null}

      {job.research_brief ? (
        <details>
          <summary className="mono">анализ источников</summary>
          <pre className="brief">{job.research_brief}</pre>
        </details>
      ) : null}

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
              Пересобрать ролик
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
