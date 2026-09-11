import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { publicationApi } from './api';
import type { Publication, PublicationStatus } from './types';
import { generateFlipbookPdf, generatePhotoStripPdf, printPdfBlobUrl } from '../../services/flipbook-pdf';

const statuses: PublicationStatus[] = ['queued', 'in_progress', 'uploaded', 'failed'];
const PAGE_SIZE = 20;
const PUBLIC_APP_URL = (import.meta.env.VITE_APP_URL ?? 'https://myphotobooth.com').replace(/\/$/, '');
const API_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';

function publicationState(status: PublicationStatus) {
  if (status === 'uploaded') return 'Uploaded';
  if (status === 'in_progress') return 'Uploading';
  return 'Not uploaded';
}

function printImageUrl(imageUrl: string): Promise<void> {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      resolve();
      return;
    }

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            @page { size: 4in 6in; margin: 0; }
            html, body { width: 4in; height: 6in; margin: 0; padding: 0; overflow: hidden; display: flex; justify-content: center; align-items: center; }
            img { width: 4in; height: 6in; object-fit: contain; display: block; }
          </style>
        </head>
        <body>
          <img src="${imageUrl}" onload="window.focus(); window.print();" />
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      resolve();
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 60000);
    }, 500);
  });
}

export function PublicationDashboard() {
  const [publications, setPublications] = useState<Publication[]>([]);
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [printing, setPrinting] = useState<string | null>(null);
  const [printProgress, setPrintProgress] = useState<string | null>(null);
  const [recordModalPublication, setRecordModalPublication] = useState<Publication | null>(null);
  const [recordCopies, setRecordCopies] = useState<number | ''>(1);
  const [isRecordingCopies, setIsRecordingCopies] = useState(false);
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
    setPrintProgress('Checking 4R PDF print file...');

    try {
      // 1. Fast Path: Check if 4R 300 DPI PDF is already cached on backend storage
      const cachedPdfBlob = await publicationApi.getPdfBlob(publication.id);
      if (cachedPdfBlob) {
        setPrintProgress('Opening print dialog...');
        const cachedPdfUrl = URL.createObjectURL(cachedPdfBlob);
        await printPdfBlobUrl(cachedPdfUrl);
        setRecordModalPublication(publication);
        setRecordCopies(1);
        return;
      }

      // 2. Fallback Path: Dynamically generate 300 DPI 4R PDF and persist to storage
      if (publication.mediaType === 'image/gif') {
        setPrintProgress('Fetching Flipbook assets...');
        const flipbookData = await publicationApi.getFlipbookData(publication.id);
        const coverUrl = flipbookData.coverUrl
          ? (flipbookData.coverUrl.startsWith('http') ? flipbookData.coverUrl : `${API_URL}${flipbookData.coverUrl}`)
          : `${API_URL}/photos/${publication.publicId}?preview=true`;
        const motionFrames = flipbookData.motionFrameUrls.map((u) =>
          u.startsWith('http') ? u : `${API_URL}${u}`
        );
        // All 16 frames: Frame 01 (Cover Photo) + Frames 02..16 (15 Motion Frames)
        const allMotionFrames = coverUrl ? [coverUrl, ...motionFrames] : motionFrames;
        const motionSheetUrl = flipbookData.motionSheetUrl
          ? (flipbookData.motionSheetUrl.startsWith('http') ? flipbookData.motionSheetUrl : `${API_URL}${flipbookData.motionSheetUrl}`)
          : null;

        const { blob, url } = await generateFlipbookPdf(
          {
            publicId: publication.publicId,
            frame: flipbookData.frame,
            coverUrl,
            allMotionFrames,
            motionSheetUrl,
            scope: 'all',
            activeSheet: 1,
            copies: 1,
          },
          (curr, total) => {
            setPrintProgress(`Rendering 300 DPI PNGs (${curr}/${total})...`);
          }
        );

        void publicationApi.savePdf(publication.id, blob);
        setPrintProgress('Opening print dialog...');
        await printPdfBlobUrl(url);
      } else {
        setPrintProgress('Preparing 300 DPI Photo Strip PDF...');
        const stripUrl = `${API_URL}/photos/${publication.publicId}`;
        try {
          const { blob, url } = await generatePhotoStripPdf(stripUrl, publication.publicId, 1);
          void publicationApi.savePdf(publication.id, blob);
          setPrintProgress('Opening print dialog...');
          await printPdfBlobUrl(url);
        } catch {
          // Fallback to strict 4R print iframe if canvas/webgl pdf creation fails
          await printImageUrl(stripUrl);
        }
      }

      setRecordModalPublication(publication);
      setRecordCopies(1);
    } catch (cause) {
      console.error('Print failed:', cause);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPrinting(null);
      setPrintProgress(null);
    }
  };

  const handleRecordCopies = async () => {
    if (!recordModalPublication || recordCopies === '') return;
    setIsRecordingCopies(true);
    const copiesNum = Number(recordCopies);
    try {
      await publicationApi.print(recordModalPublication.id, {
        copies: copiesNum,
        recordOnly: true,
      });
      setToastMessage(`${copiesNum} ${copiesNum === 1 ? 'copy' : 'copies'} recorded.`);
      setRecordModalPublication(null);
    } catch (cause) {
      console.error('Failed to record copies:', cause);
      setError(cause instanceof Error ? cause.message : String(cause));
      setToastMessage(`${copiesNum} ${copiesNum === 1 ? 'copy' : 'copies'} recorded.`);
      setRecordModalPublication(null);
    } finally {
      setIsRecordingCopies(false);
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
                  {printing === publication.id ? (printProgress || 'Printing...') : 'Print'}
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
      {recordModalPublication && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Record printed copies"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
        >
          <div className="flex w-full max-w-lg flex-col gap-6 rounded-2xl border border-[#7bc6a5] bg-[#f0faf5] p-6 text-left shadow-2xl sm:p-8 text-[#146a56] font-['Nunito',sans-serif]">
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="text-base font-bold sm:text-lg">
                  After printing, record the printed copy count if needed.
                </p>
                <p className="text-sm font-semibold opacity-80 mt-1 text-[#2d6a54]">
                  {recordModalPublication.eventName} · {recordModalPublication.publicId} ({recordModalPublication.mediaType === 'image/gif' ? 'Flipbook' : 'Photo Strip'})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRecordModalPublication(null)}
                className="shrink-0 rounded-lg px-2 py-1 text-sm font-bold underline hover:opacity-80 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-current/15 pt-4 sm:gap-4">
              <label htmlFor="pub-printed-copy-count" className="text-base font-bold sm:text-lg">
                Copies printed
              </label>
              <select
                id="pub-printed-copy-count"
                aria-label="Printed copy count"
                value={recordCopies}
                onChange={(e) =>
                  setRecordCopies(e.target.value === '' ? '' : Number(e.target.value))
                }
                className="h-12 w-24 rounded-lg border border-[#7bc6a5] bg-white px-3 text-lg font-bold text-[#1f2937]"
              >
                <option value="">-</option>
                {Array.from({ length: 5 }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    {index + 1}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleRecordCopies}
                disabled={isRecordingCopies || recordCopies === ''}
                className="ml-auto min-h-12 cursor-pointer rounded-lg bg-[#146a56] px-5 py-2 text-base font-bold text-white hover:bg-[#0f5444] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRecordingCopies ? 'Recording...' : 'Record copies'}
              </button>
            </div>
          </div>
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
