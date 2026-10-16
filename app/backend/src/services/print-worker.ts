import type { PrintJobStatus } from '../db/contracts.js';
import { dbRepository } from '../db/provider.js';
import { printerConfig } from '../config.js';
import { printerService, type CupsJobState } from './printer.js';
import { updatePublicOutputPrintCount } from './supabase-publication.js';

export const PRINT_SUBMISSION_FAILED_MESSAGE =
  'The printer did not accept this job. Check that it is on, connected, and loaded with paper.';

let timer: NodeJS.Timeout | undefined;
let running = false;

const mapped: Record<CupsJobState, PrintJobStatus> = {
  pending: 'pending',
  processing: 'processing',
  stopped: 'stopped',
  completed: 'completed',
  failed: 'failed',
  canceled: 'canceled',
};

async function reconcile() {
  if (running) return;
  running = true;
  try {
    for (const job of await dbRepository.claimQueuedPrintJobs(4)) {
      const attempt = await dbRepository.createPrintAttempt(job.id);
      const artifactPath = await dbRepository.getPrintJobArtifact(job.id);
      if (!artifactPath) {
        await dbRepository.updatePrintAttempt(
          attempt.id,
          'failed',
          undefined,
          'Print artifact is unavailable.',
        );
        await dbRepository.updatePrintJobStatus(
          job.id,
          'failed',
          'Print artifact is unavailable.',
          'submitting',
        );
        continue;
      }
      const result = await printerService.printImage(
        artifactPath,
        job.copiesRequested,
        attempt.title,
      );
      if (!result.success) {
        // CUPS text stays in the server log; the booth and admin see an authored message.
        console.error('Print submission failed:', { jobId: job.id, error: result.error });
        await dbRepository.updatePrintAttempt(
          attempt.id,
          'failed',
          undefined,
          PRINT_SUBMISSION_FAILED_MESSAGE,
        );
        await dbRepository.updatePrintJobStatus(
          job.id,
          'failed',
          PRINT_SUBMISSION_FAILED_MESSAGE,
          'submitting',
        );
        continue;
      }
      await dbRepository.updatePrintAttempt(
        attempt.id,
        job.mode === 'simulation' ? 'completed' : 'pending',
        result.jobId,
      );
      if (job.mode === 'simulation') {
        const completed = await dbRepository.completePrintJob(job.id, attempt.id);
        if (completed)
          void updatePublicOutputPrintCount(completed.publicId, completed.copiesCompleted);
      } else if (
        !(await dbRepository.updatePrintJobStatus(job.id, 'pending', undefined, 'submitting'))
      ) {
        await printerService.cancelJob(result.jobId!);
      }
    }
    for (const job of await dbRepository.listActivePrintAttempts()) {
      if (!job.cupsJobId) continue;
      const state = await printerService.getJobState(job.cupsJobId);
      if (!state) continue; // A CUPS outage preserves the prior state.
      const status = mapped[state];
      await dbRepository.updatePrintAttempt(job.attemptId, status);
      if (status === 'completed') {
        const completed = await dbRepository.completePrintJob(job.id, job.attemptId);
        if (completed)
          void updatePublicOutputPrintCount(completed.publicId, completed.copiesCompleted);
      } else await dbRepository.updatePrintJobStatus(job.id, status);
    }
    for (const attempt of await dbRepository.listSupersededPrintAttempts()) {
      const state = await printerService.getJobState(attempt.cupsJobId);
      if (state !== 'completed') continue;
      await dbRepository.updatePrintAttempt(attempt.attemptId, 'completed');
      await dbRepository.updatePrintJobStatus(
        attempt.jobId,
        'needs_attention',
        'A superseded CUPS attempt later completed. Confirm physical output before any further action.',
      );
    }
  } finally {
    running = false;
  }
}

export function startPrintWorker() {
  void reconcile();
  timer = setInterval(() => void reconcile(), printerConfig.pollIntervalMs);
}
export function stopPrintWorker() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
