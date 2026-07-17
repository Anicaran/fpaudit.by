import { useEffect, useState } from 'react';
import { useSession } from '../context/SessionContext';
import type { FeatureUrlResponse } from '../types';

interface Props {
  featurePath: string;
  emptyTitle: string;
}

export function WebViewPanel({ featurePath, emptyTitle }: Props) {
  const { api } = useSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feature, setFeature] = useState<FeatureUrlResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const data = await api<FeatureUrlResponse>(featurePath);
        if (!cancelled) setFeature(data);
      } catch (ex) {
        if (!cancelled) {
          setFeature(null);
          setError(ex instanceof Error ? ex.message : String(ex));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, featurePath]);

  if (loading) {
    return (
      <div className="panel active webview-panel">
        <div className="card muted">Загрузка…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel active webview-panel">
        <div className="card error-text">{error}</div>
      </div>
    );
  }

  if (!feature?.available || !feature.url) {
    return (
      <div className="panel active webview-panel">
        <div className="card">
          <h3 className="card-title">{emptyTitle}</h3>
          <p className="muted">{feature?.reason || 'Раздел недоступен для вашего аккаунта'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel active webview-panel">
      <iframe
        className="feature-iframe"
        src={feature.url}
        title={emptyTitle}
        referrerPolicy="no-referrer-when-downgrade"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
