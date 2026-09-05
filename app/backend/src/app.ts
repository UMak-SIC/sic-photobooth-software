import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { config } from './config.js';
import { storageService } from './services/storage.js';
import { healthRoutes } from './routes/health.js';
import { sessionRoutes } from './routes/sessions.js';
import { photoRoutes } from './routes/photos.js';
import { eventRoutes } from './routes/events.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.nodeEnv !== 'test',
    trustProxy: true,
  });

  // 1. Initialize local filesystem hierarchy
  storageService.initStorage();

  // 2. CORS Security
  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin) return cb(null, true);

      if (
        config.corsOrigins.includes(origin) ||
        config.corsOrigins.includes('*') ||
        config.nodeEnv === 'development'
      ) {
        return cb(null, true);
      }
      return cb(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
  });

  // 3. Rate Limiting (Prevent public ID enumeration / DoS)
  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    allowList: ['127.0.0.1', 'localhost'],
  });

  // 4. Multipart Support (Photos & Videos)
  await app.register(multipart, {
    limits: {
      fileSize: 100 * 1024 * 1024, // 100MB
    },
  });

  // 5. Register Routes
  await app.register(healthRoutes);
  await app.register(sessionRoutes);
  await app.register(photoRoutes);
  await app.register(eventRoutes);

  // 6. Global Error Handler
  app.setErrorHandler((error: FastifyError | Error, _request, reply) => {
    app.log.error(error);

    const fastifyErr = error as FastifyError;
    const statusCode = fastifyErr.statusCode || 500;
    const message =
      statusCode === 500
        ? 'Something went wrong. Your saved captures have not been deleted.'
        : error.message;

    return reply.status(statusCode).send({
      success: false,
      error: {
        code: fastifyErr.code || 'INTERNAL_SERVER_ERROR',
        message,
      },
    });
  });

  return app;
}
