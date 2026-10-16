import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { config } from './config.js';
import { isCutoverHoldActive } from './db/cutover-hold.js';
import { closeDatabaseProvider, getDatabaseProvider } from './db/provider.js';
import { startPublishingWorker, stopPublishingWorker } from './services/publishing-worker.js';
import { startPrintWorker, stopPrintWorker } from './services/print-worker.js';

/** Referenced verbatim by docs/runbooks/postgres-to-sqlite-cutover.md. */
export const CUTOVER_HOLD_WORKERS_MESSAGE =
  'Database cutover hold is active: publishing and print workers were not started.';

/** Both workers mutate the database, so neither may run during the cutover hold. */
export function shouldStartWorkers(): boolean {
  return !isCutoverHoldActive();
}

/**
 * Builds the app, verifies and migrates the selected database, listens, and starts
 * the workers unless the cutover hold is active. Throws (after cleaning up) when the
 * database is unavailable, so the caller can exit and the supervisor can restart.
 */
export async function startServer(): Promise<FastifyInstance> {
  const app = await buildApp();
  const engine = config.localDatabaseEngine;

  // The selected engine is the only source of truth: refuse to serve without it.
  try {
    const database = getDatabaseProvider();
    const dbHealth = await database.checkHealth();
    if (!dbHealth.ok) throw new Error(dbHealth.error ?? 'Database health check failed.');
    await database.migrate();
    app.log.info(`Database (${engine}) schema migrations applied successfully.`);
  } catch (err) {
    app.log.error({ err }, `Database (${engine}) is unavailable; refusing to start.`);
    await app.close();
    await closeDatabaseProvider();
    throw err;
  }

  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (err) {
    app.log.error({ err }, 'Could not start listening.');
    await app.close();
    await closeDatabaseProvider();
    throw err;
  }

  if (shouldStartWorkers()) {
    startPublishingWorker();
    startPrintWorker();
  } else {
    app.log.warn(CUTOVER_HOLD_WORKERS_MESSAGE);
  }
  app.log.info(`Photobooth Backend server running at http://${config.host}:${config.port}`);
  return app;
}

/** Stops the workers, closes the server, and closes (checkpoints) the database. */
export async function stopServer(app: FastifyInstance): Promise<void> {
  stopPublishingWorker();
  stopPrintWorker();
  await app.close();
  await closeDatabaseProvider();
}

async function main(): Promise<void> {
  let app: FastifyInstance;
  try {
    app = await startServer();
  } catch {
    process.exit(1);
  }
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}. Shutting down gracefully...`);
      await stopServer(app);
      process.exit(0);
    });
  }
}

if (process.env.NODE_ENV !== 'test') {
  void main();
}

export * from './app.js';
export * from './config.js';
