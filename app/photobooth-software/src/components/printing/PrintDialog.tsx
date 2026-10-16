import { useEffect, useRef, useState, type ReactNode } from 'react';
import { boothApi } from '../../services/api';
import { createSessionPrintJob, getSessionPrintJob } from './api';
import type { PrintJob } from './types';

export function PrintDialog({ sessionId, previewUrl, preview, label = 'copy', onClose, onCompleted }: {
  sessionId: string; previewUrl?: string; preview?: ReactNode; label?: string; onClose: () => void; onCompleted?: (job: PrintJob) => void;
}) {
  const [copies, setCopies] = useState(1);
  const [job, setJob] = useState<PrintJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestKey = useRef(crypto.randomUUID());
  const acknowledgedJobId = useRef<string | null>(null);
  const acknowledgeSubmission = (next: PrintJob) => {
    if (!['pending', 'processing', 'stopped', 'completed'].includes(next.status) || acknowledgedJobId.current === next.id) return;
    acknowledgedJobId.current = next.id;
    onCompleted?.(next);
  };
  useEffect(() => {
    if (!job || ['completed', 'failed', 'canceled', 'needs_attention'].includes(job.status)) return;
    const interval = window.setInterval(() => getSessionPrintJob(sessionId, boothApi.getToken(), job.id).then((next) => {
      setJob(next);
      acknowledgeSubmission(next);
    }).catch((cause: Error) => setError(cause.message)), 1500);
    return () => window.clearInterval(interval);
  }, [job?.id, job?.status, onCompleted, sessionId]);
  const submit = async () => {
    setError(null);
    try {
      const next = await createSessionPrintJob(sessionId, boothApi.getToken(), copies, requestKey.current);
      setJob(next);
      // A pending CUPS job has been accepted by the printer, so it is safe to finish the booth session.
      acknowledgeSubmission(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const submitted = job && ['pending', 'processing', 'stopped', 'completed'].includes(job.status);
  return <div role="dialog" aria-modal="true" aria-label="Print dialog" className="fixed inset-0 z-[70] grid place-items-center bg-black/60 p-4">
    <section className="w-full max-w-md rounded-2xl bg-white p-6 text-[#1f2937] shadow-2xl">
      <h2 className="text-2xl font-bold">Print your {label}</h2>
      {preview ?? (previewUrl && (
          <img
            src={previewUrl}
            alt="Print preview"
            className="mt-4 max-h-56 w-full rounded-lg object-contain"
          />
        ))}
      <label className="mt-5 block font-bold">Copies
        <select aria-label="Copies" className="ml-3 rounded border p-2" value={copies} disabled={Boolean(job)} onChange={(event) => setCopies(Number(event.target.value))}>
          {Array.from({ length: 10 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
        </select>
      </label>
      {job && <p role="status" className="mt-4 rounded bg-slate-100 p-3 font-medium">{job.status === 'completed' ? 'CUPS reported this job completed.' : `Printer status: ${job.status}`}</p>}
      {error && <p role="alert" className="mt-4 text-red-700">{error}</p>}
      {job?.lastError && <p role="alert" className="mt-4 text-red-700">{job.lastError.replace(/\.$/, '')}. Recover it from Admin Print.</p>}
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" className="rounded px-4 py-2 font-bold" onClick={onClose}>{submitted ? 'Okay' : job?.status === 'failed' ? 'Okay' : 'Cancel'}</button>
        {!job && <button type="button" className="rounded bg-[#1e6147] px-5 py-2 font-bold text-white" onClick={submit}>Queue print</button>}
      </div>
    </section>
  </div>;
}
