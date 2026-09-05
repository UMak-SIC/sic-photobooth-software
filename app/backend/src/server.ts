import { buildApp } from './app.js';
import { config } from './config.js';
import { runMigrations } from './db/migrations.js';
import { checkDatabaseHealth, closePool } from './db/pool.js';

async function startServer() {
  const app = await buildApp();

  // Check database health on startup and run migrations if connected
  const dbHealth = await checkDatabaseHealth();
  if (dbHealth.ok) {
    try {
      await runMigrations();
      app.log.info('Database schema migrations applied successfully.');
    } catch (err) {
      app.log.error(err, 'Failed to run database schema migrations.');
    }
  } else {
    app.log.warn(`Starting without active PostgreSQL connection: ${dbHealth.error}`);
  }

  // Graceful shutdown handling
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}. Shutting down gracefully...`);
      await app.close();
      await closePool();
      process.exit(0);
    });
  }

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`Photobooth Backend server running at http://${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export * from './app.js';
export * from './config.js';
