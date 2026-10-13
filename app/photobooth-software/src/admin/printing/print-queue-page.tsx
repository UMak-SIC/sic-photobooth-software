import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../services/api';
import type { PrintJob } from '../../components/printing/types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${url}`, init);
  const body = await response.json();
  if (!response.ok || !body.success) throw new Error(body.error?.message || 'Print queue request failed.');
  return body.data;
}

export function PrintQueuePage() {
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [error, setError] = useState('');
  const load = () => request<{ jobs: PrintJob[] }>('/api/print-jobs').then((data) => { setJobs(data.jobs); setError(''); }).catch((cause: Error) => setError(cause.message));
  useEffect(() => { load(); const timer = window.setInterval(load, 5000); return () => window.clearInterval(timer); }, []);
  const action = async (job: PrintJob, name: 'retry' | 'reprint') => {
    const warning = name === 'retry' ? 'A failed job may have produced partial pages. Retry anyway?' : 'Queue another copy of this completed job?';
    if (!window.confirm(warning)) return;
    try { await request(`/api/print-jobs/${job.id}/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: name === 'reprint' ? JSON.stringify({ requestKey: crypto.randomUUID() }) : undefined }); load(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  return <div className="mx-auto max-w-6xl p-6">
    <h1 className="text-3xl font-bold">Print queue</h1>
    <p className="mt-1 text-slate-600">CUPS-reported completion is delivery to the printer, not a physical-sheet guarantee.</p>
    {error && <p role="alert" className="mt-4 text-red-700">{error}</p>}
    <div className="mt-6 overflow-x-auto rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-100"><tr><th className="p-3">Preview</th><th className="p-3">Copies</th><th className="p-3">Status</th><th className="p-3">Queued</th><th className="p-3">Printer</th><th className="p-3">Actions</th></tr></thead>
      <tbody>{jobs.map((job) => <tr key={job.id} className="border-t"><td className="p-3"><img className="size-12 rounded object-cover" src={`${API_BASE_URL}/photos/${job.publicId}`} alt="Output preview" /></td><td className="p-3">{job.copiesRequested} requested, {job.copiesCompleted} completed, {job.copiesWaiting} waiting</td><td className="p-3">{job.status}{job.lastError ? `: ${job.lastError}` : ''}</td><td className="p-3">{new Date(job.createdAt).toLocaleString()}</td><td className="p-3">{job.printerName}</td><td className="p-3">{['failed','canceled','needs_attention'].includes(job.status) && <button className="font-bold text-emerald-800 underline" onClick={() => action(job, 'retry')}>Retry</button>} {job.status === 'completed' && <button className="font-bold text-emerald-800 underline" onClick={() => action(job, 'reprint')}>Reprint</button>}</td></tr>)}</tbody>
    </table></div>
  </div>;
}
