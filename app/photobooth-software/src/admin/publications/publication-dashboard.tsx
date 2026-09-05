import { useEffect, useState } from 'react';
import { publicationApi } from './api';
import type { Publication, PublicationStatus } from './types';

const statuses: PublicationStatus[] = ['queued', 'in_progress', 'uploaded', 'failed'];

export function PublicationDashboard() {
  const [publications, setPublications] = useState<Publication[]>([]);
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = () =>
      publicationApi
        .list()
        .then((items) => {
          if (active) setPublications(items);
        })
        .catch((cause: Error) => {
          if (active) setError(cause.message);
        });
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const retry = async (publication: Publication) => {
    setRetrying(publication.id);
    setError('');
    try {
      const updated = await publicationApi.retry(publication.id);
      setPublications((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRetrying(null);
    }
  };

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="admin-eyebrow">PUBLICATION QUEUE</p>
          <h1>Online delivery</h1>
          <p className="admin-muted">
            Finalized outputs stay local while delivery jobs are processed.
          </p>
        </div>
      </header>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      <div className="publication-summary">
        {statuses.map((status) => (
          <div key={status}>
            <strong>{publications.filter((item) => item.status === status).length}</strong>
            <span>{status.replace('_', ' ')}</span>
          </div>
        ))}
      </div>
      {publications.length === 0 ? (
        <div className="admin-empty">
          <strong>No publication jobs yet.</strong>
          <span>Confirmed Photo Strips and Flipbooks will appear here.</span>
        </div>
      ) : (
        <div className="publication-list">
          {publications.map((publication) => (
            <article key={publication.id}>
              <div>
                <strong>
                  {publication.eventName} · {publication.publicId}
                </strong>
                <span>
                  {publication.mediaType === 'image/gif' ? 'Flipbook' : 'Photo Strip'} ·{' '}
                  {publication.eventDate}
                </span>
                {publication.lastError && <small>{publication.lastError}</small>}
                {publication.status === 'queued' && publication.nextAttemptAt && (
                  <small>Next retry scheduled</small>
                )}
                {publication.status === 'uploaded' && publication.cloudinaryUrl && (
                  <a href={publication.cloudinaryUrl} target="_blank" rel="noreferrer">
                    View cloud asset
                  </a>
                )}
              </div>
              <div className="publication-meta">
                <span
                  className={`status ${publication.status === 'uploaded' ? 'active' : publication.status === 'failed' ? 'failed' : ''}`}
                >
                  {publication.status.replace('_', ' ')}
                </span>
                <small>
                  {publication.retryCount} attempt{publication.retryCount === 1 ? '' : 's'}
                </small>
                {publication.status === 'failed' && (
                  <button
                    className="secondary-button compact"
                    disabled={retrying === publication.id}
                    onClick={() => retry(publication)}
                    type="button"
                  >
                    {retrying === publication.id ? 'Retrying...' : 'Retry'}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
