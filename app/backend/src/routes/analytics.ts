import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { dbRepository } from '../db/provider.js';
import { sendError } from '../errors.js';

const analyticsQuerySchema = z.object({
  eventId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const analyticsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: {
      eventId?: string;
      startDate?: string;
      endDate?: string;
    };
  }>('/api/admin/analytics', async (request, reply) => {
    const parseResult = analyticsQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid analytics query parameters',
          details: parseResult.error.flatten(),
        },
      });
    }

    try {
      const data = await dbRepository.getAnalyticsData(parseResult.data);
      return reply.send({
        success: true,
        data,
      });
    } catch (err: unknown) {
      return sendError(request, reply, err, 'Loading analytics failed', {}, {
        code: 'ANALYTICS_UNAVAILABLE',
        message: 'Analytics could not be loaded. Please try again.',
      });
    }
  });
};
