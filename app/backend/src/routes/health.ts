import type { FastifyPluginAsync } from 'fastify';
import { checkDatabaseHealth } from '../db/provider.js';
import fs from 'node:fs';
import { config } from '../config.js';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async (request, reply) => {
    const dbHealth = await checkDatabaseHealth();
    const storageHealthy = fs.existsSync(config.storageDir);

    const isHealthy = dbHealth.ok && storageHealthy;
    const statusCode = isHealthy ? 200 : 503;
    // Engine error details stay in the server log; the endpoint is reachable from the LAN.
    if (!dbHealth.ok) request.log.error({ error: dbHealth.error }, 'Database health check failed');

    return reply.status(statusCode).send({
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      services: {
        database: dbHealth.ok ? 'connected' : 'disconnected',
        storage: storageHealthy ? 'writable' : 'unavailable',
      },
    });
  });
};
