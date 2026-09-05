import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { dbRepository } from '../db/repository.js';

const publicationIdSchema = z.object({ id: z.string().uuid() });

export const publicationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/publications', async (_request, reply) =>
    reply.send({ success: true, data: await dbRepository.listPublications() }),
  );

  fastify.post<{ Params: { id: string } }>('/api/publications/:id/retry', async (request, reply) => {
    const parsed = publicationIdSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Publication ID must be a UUID.' },
      });
    }
    const publication = await dbRepository.retryPublication(parsed.data.id);
    if (!publication) {
      return reply.status(409).send({
        success: false,
        error: { code: 'PUBLICATION_NOT_RETRYABLE', message: 'Only failed publication jobs can retry.' },
      });
    }
    return reply.send({ success: true, data: publication });
  });
};
