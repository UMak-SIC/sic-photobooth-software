import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { config } from './config.js';
import { storageService } from './services/storage.js';
import { healthRoutes } from './routes/health.js';
import { sessionRoutes } from './routes/sessions.js';
import { photoRoutes } from './routes/photos.js';
import { eventRoutes } from './routes/events.js';
import { templateRoutes } from './templates/routes.js';
import { publicationRoutes } from './routes/publications.js';
import { analyticsRoutes } from './routes/analytics.js';
import { printingRoutes } from './routes/printing.js';
import { cutoverHoldPlugin } from './plugins/cutover-hold.js';
import { sendError, UserFacingError } from './errors.js';

/** Global error handler: only authored messages reach clients; everything is logged. */
export function handleError(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  const fastifyErr = error as FastifyError;
  const statusCode = fastifyErr.statusCode;
  const frameworkAuthored =
    (typeof fastifyErr.code === 'string' && fastifyErr.code.startsWith('FST_')) ||
    Boolean(fastifyErr.validation) ||
    statusCode === 429;
  if (
    !(error instanceof UserFacingError) &&
    statusCode !== undefined &&
    statusCode >= 400 &&
    statusCode < 500
  ) {
    // Fastify and its plugins (body parsing, validation, rate limit, multipart) author
    // these messages; any other 4xx text is replaced with a generic one.
    return sendError(
      request,
      reply,
      new UserFacingError(
        statusCode,
        frameworkAuthored && fastifyErr.code ? fastifyErr.code : 'BAD_REQUEST',
        frameworkAuthored ? error.message : 'The request could not be processed.',
      ),
      'Request rejected',
      { cause: error },
    );
  }
  return sendError(request, reply, error, 'Unhandled request error');
}

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

  // Cutover hold precedes routes so mutations are rejected before any handler runs.
  await app.register(cutoverHoldPlugin);

  // 5. Register Routes
  await app.register(healthRoutes);
  await app.register(sessionRoutes);
  await app.register(photoRoutes);
  await app.register(eventRoutes);
  await app.register(templateRoutes);
  await app.register(publicationRoutes);
  await app.register(analyticsRoutes);
  await app.register(printingRoutes);

  // 6. Global Error Handler: only authored messages reach clients; everything is logged.
  app.setErrorHandler(handleError);

  return app;
}
