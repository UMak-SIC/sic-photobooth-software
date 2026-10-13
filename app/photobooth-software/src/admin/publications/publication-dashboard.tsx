import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { renderGangSheetToPng } from '../../services/flipbook-pdf';
import { publicationApi } from './api';
import type { Publication, PublicationStatus } from './types';

const statuses: PublicationStatus[] = ['queued', 'in_progress', 'uploaded', 'failed'];
const PAGE_SIZE = 20;
const PUBLIC_APP_URL = (
  import.meta.env.VITE_APP_URL ?? 'https://umak-sic-photobooth.vercel.app'
).replace(/\/$/, '');

function publicationState(status: PublicationStatus) {
  if (status === 'uploaded') return 'Uploaded';
  if (status === 'in_progress') return 'Uploading';
  return 'Not uploaded';
}

export function PublicationDashboard() {
  const [publications, setPublications] = useState<Publication[]>([]);
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [printing, setPrinting] = useState<string | null>(null);
  const [printModalPublication, setPrintModalPublication] = useState<Publication | null>(null);
  const [printCopies, setPrintCopies] = useState(1);
  const [flipbookPrintSheets, setFlipbookPrintSheets] = useState<string[]>([]);
  const [loadingFlipbookPrintSheets, setLoadingFlipbookPrintSheets] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
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

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    if (!printModalPublication) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [printModalPublication]);

  useEffect(() => {
    if (!printModalPublication || printModalPublication.mediaType !== 'image/gif') {
      setFlipbookPrintSheets([]);
      setLoadingFlipbookPrintSheets(false);
      return;
    }

    let active = true;
    const assetUrl = (path: string | null | undefined) =>
      path &&
      (path.startsWith('http')
        ? path
        : `${import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000'}${path}`);

    setLoadingFlipbookPrintSheets(true);
    setFlipbookPrintSheets([]);
    void publicationApi
      .getFlipbookData(printModalPublication.id)
      .then(async (data) => {
        const frames = [assetUrl(data.coverUrl), ...data.motionFrameUrls.map(assetUrl)].filter(
          (url): url is string => Boolean(url),
        );
        const slotsPerSheet = data.frame?.placements?.length || 4;
        const sheetCount = Math.ceil(frames.length / slotsPerSheet);
        return Promise.all(
          Array.from({ length: sheetCount }, (_, index) =>
            renderGangSheetToPng(index + 1, {
              frame: data.frame,
              allMotionFrames: frames,
              motionSheetUrl: assetUrl(data.motionSheetUrl),
            }),
          ),
        );
      })
      .then((sheets) => {
        if (active) setFlipbookPrintSheets(sheets);
      })
      .catch((cause: unknown) => {
        console.error('Failed to render Flipbook print preview:', cause);
        if (active) setFlipbookPrintSheets([]);
      })
      .finally(() => {
        if (active) setLoadingFlipbookPrintSheets(false);
      });

    return () => {
      active = false;
    };
  }, [printModalPublication]);

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

  const retryAllFailed = async () => {
    const failedPublications = publications.filter(
      (publication) => publication.status === 'failed',
    );
    if (failedPublications.length === 0) return;

    setRetryingAll(true);
    setError('');
    try {
      const results = await Promise.allSettled(
        failedPublications.map((publication) => publicationApi.retry(publication.id)),
      );
      const retried = new Map(
        results.flatMap((result) =>
          result.status === 'fulfilled' ? [[result.value.id, result.value] as const] : [],
        ),
      );
      setPublications((items) => items.map((item) => retried.get(item.id) ?? item));

      const failures = results.filter((result) => result.status === 'rejected');
      if (failures.length > 0) {
        setError(
          `Could not retry ${failures.length} failed ${failures.length === 1 ? 'upload' : 'uploads'}.`,
        );
      }
    } finally {
      setRetryingAll(false);
    }
  };

  const removeLocal = async (publication: Publication) => {
    if (!window.confirm(`Delete the local copy of ${publication.publicId}? This cannot be undone.`))
      return;
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
    if (
      !window.confirm(`Delete ${publication.publicId} from the cloud? The local copy will remain.`)
    )
      return;
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

  const print = async (publication: Publication, copies: number) => {
    setPrinting(publication.id);
    setError('');
    try {
      await publicationApi.queuePrint(publication.publicId, copies);
      setToastMessage(`${copies} ${copies === 1 ? 'copy' : 'copies'} queued for printing.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPrinting(null);
    }
  };

  const pageCount = Math.max(1, Math.ceil(publications.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visiblePublications = publications.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const failedCount = publications.filter((publication) => publication.status === 'failed').length;
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
        {failedCount > 0 && (
          <button
            className="secondary-button"
            disabled={retryingAll || retrying !== null}
            onClick={retryAllFailed}
            type="button"
          >
            {retryingAll ? 'Retrying failed uploads...' : `Retry all failed (${failedCount})`}
          </button>
        )}
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
                <button
                  className="publication-thumbnail"
                  onClick={() => setPreview(publication)}
                  type="button"
                >
                  <img
                    alt={`${publication.eventName} ${publication.mediaType === 'image/gif' ? 'flipbook' : 'photo strip'}`}
                    loading="lazy"
                    onMouseEnter={(event) => {
                      if (publication.mediaType === 'image/gif')
                        event.currentTarget.src = imageUrl(publication);
                    }}
                    onMouseLeave={(event) => {
                      if (publication.mediaType === 'image/gif')
                        event.currentTarget.src = imageUrl(publication, true);
                    }}
                    src={imageUrl(publication, publication.mediaType === 'image/gif')}
                  />
                </button>
                <div className="publication-card-body">
                  <div>
                    <p className="publication-id">{publication.publicId}</p>
                    <h2>{publication.eventName}</h2>
                    <p className="publication-detail">
                      {publication.mediaType === 'image/gif' ? 'Flipbook' : 'Photo Strip'} ·{' '}
                      {publication.eventDate}
                    </p>
                    <p className="publication-retries">
                      {publication.retryCount} upload{' '}
                      {publication.retryCount === 1 ? 'retry' : 'retries'}
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
                  <span
                    className={`status ${publication.status === 'uploaded' ? 'active' : publication.status === 'failed' ? 'failed' : ''}`}
                  >
                    {publicationState(publication.status)}
                  </span>
                </div>
                <div className="publication-actions">
                  <button
                    className="publication-link"
                    disabled={printing === publication.id}
                    onClick={() => {
                      setPrintModalPublication(publication);
                      setPrintCopies(1);
                    }}
                    type="button"
                  >
                    {printing === publication.id ? 'Queueing...' : 'Print'}
                  </button>
                  <button
                    className="publication-link"
                    onClick={() => setQrPublication(publication)}
                    type="button"
                  >
                    View QR
                  </button>
                  <details className="publication-more-actions">
                    <summary aria-label={`More actions for ${publication.publicId}`}>•••</summary>
                    <div>
                      {publication.status === 'failed' && (
                        <button
                          disabled={retryingAll || retrying === publication.id}
                          onClick={() => retry(publication)}
                          type="button"
                        >
                          {retrying === publication.id ? 'Retrying...' : 'Retry upload'}
                        </button>
                      )}
                      {publication.cloudinaryUrl && (
                        <a href={publication.cloudinaryUrl} target="_blank" rel="noreferrer">
                          Open cloud
                        </a>
                      )}
                      <button
                        className="publication-delete"
                        disabled={
                          publication.status === 'in_progress' ||
                          deleting === `local:${publication.id}`
                        }
                        onClick={() => removeLocal(publication)}
                        type="button"
                      >
                        {deleting === `local:${publication.id}` ? 'Deleting...' : 'Delete local'}
                      </button>
                      {publication.status === 'uploaded' && (
                        <button
                          className="publication-delete"
                          disabled={deleting === `cloud:${publication.id}`}
                          onClick={() => removeCloud(publication)}
                          type="button"
                        >
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
              {publications.length} output{publications.length === 1 ? '' : 's'} · Page{' '}
              {currentPage} of {pageCount}
            </span>
            <div>
              <button
                className="secondary-button compact"
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
                type="button"
              >
                Previous
              </button>
              <button
                className="secondary-button compact"
                disabled={currentPage === pageCount}
                onClick={() => setPage(currentPage + 1)}
                type="button"
              >
                Next
              </button>
            </div>
          </nav>
        </>
      )}
      {preview && (
        <div className="publication-lightbox" role="presentation" onClick={closePreview}>
          <div
            className="publication-lightbox-toolbar"
            onClick={(event) => event.stopPropagation()}
          >
            <strong>{preview.publicId}</strong>
            <span>Scroll to zoom · Drag to pan</span>
            <button onClick={closePreview} type="button">
              Close
            </button>
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
              if (drag.current)
                setPosition({
                  x: event.clientX - drag.current.x,
                  y: event.clientY - drag.current.y,
                });
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
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
          <section
            aria-label="Photo QR code"
            className="publication-qr-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="publication-modal-close"
              onClick={() => setQrPublication(null)}
              type="button"
            >
              Close
            </button>
            <p className="admin-eyebrow">SCAN TO DOWNLOAD</p>
            <img alt={`QR code for ${qrPublication.publicId}`} src={qrDataUrl} />
            <strong>{qrPublication.publicId}</strong>
            <span>
              {PUBLIC_APP_URL}/{qrPublication.publicId}
            </span>
          </section>
        </div>
      )}
      {printModalPublication && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          onClick={() => !printing && setPrintModalPublication(null)}
        >
          <section
            aria-label="Print output"
            aria-modal="true"
            className="flex w-full max-w-5xl flex-col gap-5 rounded-2xl border border-[#7bc6a5] bg-[#f0faf5] p-6 text-left font-['Nunito',sans-serif] text-[#146a56] shadow-2xl sm:p-8"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="admin-eyebrow">PRINT OUTPUT</p>
                <h2 className="mt-1 text-xl font-bold text-[#1f2937]">Ready to print?</h2>
                <p className="mt-1 text-sm font-semibold text-[#2d6a54]">
                  {printModalPublication.eventName} · {printModalPublication.publicId}
                </p>
              </div>
              <button
                aria-label="Close print dialog"
                className="shrink-0 rounded-lg px-2 py-1 text-sm font-bold underline hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={Boolean(printing)}
                onClick={() => setPrintModalPublication(null)}
                type="button"
              >
                Close
              </button>
            </div>
            {printModalPublication.mediaType === 'image/gif' ? (
              <div className="flex max-w-full gap-4 overflow-x-auto pb-2">
                {loadingFlipbookPrintSheets && (
                  <p className="rounded-xl border border-[#7bc6a5] bg-white p-4 text-sm font-semibold">
                    Rendering print sheets...
                  </p>
                )}
                {flipbookPrintSheets.map((sheet, index) => (
                  <div
                    key={index}
                    className="w-56 shrink-0 overflow-hidden border border-[#7bc6a5] bg-white"
                  >
                    <p className="px-3 py-2 text-sm font-bold text-[#1f2937]">
                      Sheet {index + 1} of {flipbookPrintSheets.length}
                    </p>
                    <img
                      alt={`Print sheet ${index + 1} for ${printModalPublication.publicId}`}
                      className="w-full object-contain"
                      src={sheet}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <img
                alt={`Print preview for ${printModalPublication.publicId}`}
                className="max-h-72 w-full rounded-xl border border-[#7bc6a5] bg-white object-contain"
                src={imageUrl(printModalPublication)}
              />
            )}
            <div className="flex items-center gap-3 border-t border-current/15 pt-4">
              <label className="text-base font-bold" htmlFor="publication-print-copies">
                Copies
              </label>
              <select
                aria-label="Copies to print"
                className="h-12 w-24 rounded-lg border border-[#7bc6a5] bg-white px-3 text-lg font-bold text-[#1f2937]"
                disabled={Boolean(printing)}
                id="publication-print-copies"
                onChange={(event) => setPrintCopies(Number(event.target.value))}
                value={printCopies}
              >
                {Array.from({ length: 5 }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    {index + 1}
                  </option>
                ))}
              </select>
              <button
                className="ml-auto min-h-12 cursor-pointer rounded-lg bg-[#146a56] px-5 py-2 text-base font-bold text-white hover:bg-[#0f5444] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={Boolean(printing)}
                onClick={() => {
                  const publication = printModalPublication;
                  setPrintModalPublication(null);
                  void print(publication, printCopies);
                }}
                type="button"
              >
                {printing ? 'Queueing...' : 'Print'}
              </button>
            </div>
          </section>
        </div>
      )}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-8 left-1/2 z-[60] -translate-x-1/2 rounded-2xl bg-[#146a56] px-8 py-5 text-lg font-bold text-white shadow-2xl sm:px-10 sm:py-6 sm:text-2xl"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
