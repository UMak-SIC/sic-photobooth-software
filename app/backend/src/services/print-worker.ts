import { dbRepository } from '../db/repository.js';
import { printerService } from './printer.js';

let timer: NodeJS.Timeout | undefined;
let running = false;
export async function reconcilePrintQueue() {
  if (running) return; running = true;
  try { for (const job of await dbRepository.listPrintJobs()) { if (job.status === 'queued') { const submitted = await printerService.submit(job.artifactPath, job.copiesRequested, `sic-print:${job.id}:1`); await dbRepository.updatePrintJob(job.id, submitted.success ? 'pending' : 'failed', submitted.error || null); } } } finally { running = false; }
}
export function startPrintWorker(intervalMs: number) { void reconcilePrintQueue(); timer = setInterval(() => void reconcilePrintQueue(), intervalMs); }
export function stopPrintWorker() { if (timer) clearInterval(timer); timer = undefined; }
