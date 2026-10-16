/**
 * Worker-thread fixture for sqlite-concurrency.test.ts: opens its own
 * connection to the shared database file and claims jobs until none remain.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { createSqliteProvider } from '../../src/db/provider.js';

const { filename, kind } = workerData as { filename: string; kind: 'publication' | 'print' };
const provider = createSqliteProvider(filename, { busyTimeoutMs: 10_000 });
const claimed: string[] = [];
try {
  for (;;) {
    const batch =
      kind === 'publication'
        ? await provider.repository.claimQueuedPublications(2, new Date('2999-01-01T00:00:00.000Z'))
        : await provider.repository.claimQueuedPrintJobs(2);
    if (batch.length === 0) break;
    claimed.push(...batch.map((job) => job.id));
  }
  parentPort!.postMessage({ claimed });
} catch (error) {
  parentPort!.postMessage({ error: error instanceof Error ? error.message : String(error) });
} finally {
  await provider.close();
}
