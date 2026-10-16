import { buildApp } from './app.js';
import { config } from './config.js';
import { closeDatabaseProvider, getDatabaseProvider } from './db/provider.js';
import { startPublishingWorker, stopPublishingWorker } from './services/publishing-worker.js';
import { startPrintWorker, stopPrintWorker } from './services/print-worker.js';

/**
 * Seam for operational holds (e.g. a cutover validation mode) that must keep
 * the publishing and print workers stopped while the API runs.
 */
export function shouldStartWorkers(): boolean {
  return true;
}

async function startServer() {
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
    app.log.error(err, `Database (${engine}) is unavailable; refusing to start.`);
    await app.close();
    await closeDatabaseProvider();
    process.exit(1);
  }

  // Graceful shutdown handling
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}. Shutting down gracefully...`);
      stopPublishingWorker();
      stopPrintWorker();
      await app.close();
      await closeDatabaseProvider();
      process.exit(0);
    });
  }

  try {
    await app.listen({ port: config.port, host: config.host });
    if (shouldStartWorkers()) {
      startPublishingWorker();
      startPrintWorker();
    } else {
      app.log.warn('Publishing and print workers are held; not starting them.');
    }
    app.log.info(`Photobooth Backend server running at http://${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    await closeDatabaseProvider();
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export * from './app.js';
export * from './config.js';
