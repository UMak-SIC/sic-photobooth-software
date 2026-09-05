import type { FastifyPluginAsync } from 'fastify';
import { checkDatabaseHealth } from '../db/pool.js';
import fs from 'node:fs';
import { config } from '../config.js';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async (_request, reply) => {
    const dbHealth = await checkDatabaseHealth();
    const storageHealthy = fs.existsSync(config.storageDir);

    const isHealthy = dbHealth.ok && storageHealthy;
    const statusCode = isHealthy ? 200 : 503;

    return reply.status(statusCode).send({
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      services: {
        database: dbHealth.ok ? 'connected' : `disconnected (${dbHealth.error})`,
        storage: storageHealthy ? 'writable' : 'unavailable',
      },
    });
  });
};
