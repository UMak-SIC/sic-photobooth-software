import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { publicationApi } from './api';
import type { Publication, PublicationStatus } from './types';

const statuses: PublicationStatus[] = ['queued', 'in_progress', 'uploaded', 'failed'];
const PAGE_SIZE = 20;
const PUBLIC_APP_URL = (import.meta.env.VITE_APP_URL ?? 'https://myphotobooth.com').replace(/\/$/, '');

function publicationState(status: PublicationStatus) {
  if (status === 'uploaded') return 'Uploaded';
  if (status === 'in_progress') return 'Uploading';
  return 'Not uploaded';
}

export function PublicationDashboard() {
  const [publications, setPublications] = useState<Publication[]>([]);
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [printing, setPrinting] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<Publication | null>(null);
  const [qrPublication, setQrPublication] = useState<Publication | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);

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

  useEffect(() => {
    if (!qrPublication) return;
    void QRCode.toDataURL(`${PUBLIC_APP_URL}/${qrPublication.publicId}`, {
      margin: 1,
      width: 360,
      color: { dark: '#0b3b32', light: '#ffffff' },
    }).then(setQrDataUrl);
  }, [qrPublication]);

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

  const removeLocal = async (publication: Publication) => {
    if (!window.confirm(`Delete the local copy of ${publication.publicId}? This cannot be undone.`)) return;
    setDeleting(`local:${publication.id}`);
    setError('');
    try {
      await publicationApi.removeLocal(publication.id);
      setPublications((items) => items.filter((item) => item.id !== publication.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setDeleting(null);
    }
  };

  const removeCloud = async (publication: Publication) => {
    if (!window.confirm(`Delete ${publication.publicId} from the cloud? The local copy will remain.`)) return;
    setDeleting(`cloud:${publication.id}`);
    setError('');
    try {
      const updated = await publicationApi.removeCloud(publication.id);
      setPublications((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setDeleting(null);
    }
  };

  const print = async (publication: Publication) => {
    setPrinting(publication.id);
    setError('');
    try {
      await publicationApi.print(publication.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPrinting(null);
    }
  };

  const pageCount = Math.max(1, Math.ceil(publications.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visiblePublications = publications.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const imageUrl = (publication: Publication, preview = false) =>
    `${import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000'}/photos/${publication.publicId}${preview ? '?preview=true' : ''}`;
  const closePreview = () => {
    setPreview(null);
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  };

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="admin-eyebrow">OUTPUT LIBRARY</p>
          <h1>Online delivery</h1>
          <p className="admin-muted">
            Local captures and their cloud delivery status, in one place.
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
        <>
          <div className="publication-grid">
            {visiblePublications.map((publication) => (
            <article className="publication-card" key={publication.id}>
              <button className="publication-thumbnail" onClick={() => setPreview(publication)} type="button">
                <img
                  alt={`${publication.eventName} ${publication.mediaType === 'image/gif' ? 'flipbook' : 'photo strip'}`}
                  loading="lazy"
                  onMouseEnter={(event) => {
                    if (publication.mediaType === 'image/gif') event.currentTarget.src = imageUrl(publication);
                  }}
                  onMouseLeave={(event) => {
                    if (publication.mediaType === 'image/gif') event.currentTarget.src = imageUrl(publication, true);
                  }}
                  src={imageUrl(publication, publication.mediaType === 'image/gif')}
                />
              </button>
              <div className="publication-card-body">
                <div>
                  <p className="publication-id">{publication.publicId}</p>
                  <h2>{publication.eventName}</h2>
                  <p className="publication-detail">
                    {publication.mediaType === 'image/gif' ? 'Flipbook' : 'Photo Strip'} · {publication.eventDate}
                  </p>
                  <p className="publication-retries">
                    {publication.retryCount} upload {publication.retryCount === 1 ? 'retry' : 'retries'}
                  </p>
                </div>
                {publication.status === 'failed' && publication.lastError && (
                  <p className="publication-error">{publication.lastError}</p>
                )}
                {publication.status === 'queued' && publication.nextAttemptAt && (
                  <p className="publication-detail">Next retry scheduled</p>
                )}
              </div>
              <div className="publication-card-meta">
                <span className={`status ${publication.status === 'uploaded' ? 'active' : publication.status === 'failed' ? 'failed' : ''}`}>
                  {publicationState(publication.status)}
                </span>
              </div>
              <div className="publication-actions">
                <button className="publication-link" disabled={printing === publication.id} onClick={() => print(publication)} type="button">
                  {printing === publication.id ? 'Printing...' : 'Print'}
                </button>
                <button className="publication-link" onClick={() => setQrPublication(publication)} type="button">View QR</button>
                <details className="publication-more-actions">
                  <summary aria-label={`More actions for ${publication.publicId}`}>•••</summary>
                  <div>
                    {publication.status === 'failed' && (
                      <button disabled={retrying === publication.id} onClick={() => retry(publication)} type="button">
                        {retrying === publication.id ? 'Retrying...' : 'Retry upload'}
                      </button>
                    )}
                    {publication.cloudinaryUrl && (
                      <a href={publication.cloudinaryUrl} target="_blank" rel="noreferrer">Open cloud</a>
                    )}
                    <button className="publication-delete" disabled={publication.status === 'in_progress' || deleting === `local:${publication.id}`} onClick={() => removeLocal(publication)} type="button">
                      {deleting === `local:${publication.id}` ? 'Deleting...' : 'Delete local'}
                    </button>
                    {publication.status === 'uploaded' && (
                      <button className="publication-delete" disabled={deleting === `cloud:${publication.id}`} onClick={() => removeCloud(publication)} type="button">
                        {deleting === `cloud:${publication.id}` ? 'Deleting...' : 'Delete cloud'}
                      </button>
                    )}
                  </div>
                </details>
              </div>
            </article>
            ))}
          </div>
          <nav className="publication-pagination" aria-label="Publication pages">
            <span>
              {publications.length} output{publications.length === 1 ? '' : 's'} · Page {currentPage} of {pageCount}
            </span>
            <div>
              <button className="secondary-button compact" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} type="button">Previous</button>
              <button className="secondary-button compact" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)} type="button">Next</button>
            </div>
          </nav>
        </>
      )}
      {preview && (
        <div className="publication-lightbox" role="presentation" onClick={closePreview}>
          <div className="publication-lightbox-toolbar" onClick={(event) => event.stopPropagation()}>
            <strong>{preview.publicId}</strong>
            <span>Scroll to zoom · Drag to pan</span>
            <button onClick={closePreview} type="button">Close</button>
          </div>
          <img
            alt={`${preview.eventName} full size`}
            className="publication-lightbox-image"
            draggable={false}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => {
              drag.current = { x: event.clientX - position.x, y: event.clientY - position.y };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (drag.current) setPosition({ x: event.clientX - drag.current.x, y: event.clientY - drag.current.y });
            }}
            onPointerUp={() => { drag.current = null; }}
            onWheel={(event) => {
              event.preventDefault();
              setZoom((value) => Math.min(4, Math.max(1, value - event.deltaY * 0.002)));
            }}
            src={imageUrl(preview)}
            style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})` }}
          />
        </div>
      )}
      {qrPublication && (
        <div className="modal-backdrop" role="presentation" onClick={() => setQrPublication(null)}>
          <section aria-label="Photo QR code" className="publication-qr-modal" onClick={(event) => event.stopPropagation()}>
            <button className="publication-modal-close" onClick={() => setQrPublication(null)} type="button">Close</button>
            <p className="admin-eyebrow">SCAN TO DOWNLOAD</p>
            <img alt={`QR code for ${qrPublication.publicId}`} src={qrDataUrl} />
            <strong>{qrPublication.publicId}</strong>
            <span>{PUBLIC_APP_URL}/{qrPublication.publicId}</span>
          </section>
        </div>
      )}
    </div>
  );
}
