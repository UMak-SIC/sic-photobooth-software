import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { dbRepository } from '../db/repository.js';
import { storageService } from '../services/storage.js';
import { deleteCloudPublication } from '../services/publishing-worker.js';
import { printerService } from '../services/printer.js';

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

  fastify.delete<{ Params: { id: string } }>('/api/publications/:id/local', async (request, reply) => {
    const parsed = publicationIdSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_REQUEST', message: 'Publication ID must be a UUID.' } });
    }
    const output = await dbRepository.deleteLocalPublication(parsed.data.id);
    if (!output) {
      return reply.status(409).send({ success: false, error: { code: 'PUBLICATION_NOT_DELETABLE', message: 'An uploading publication cannot be deleted.' } });
    }
    await storageService.removeOutput(output.publicId, output.filePath, output.mediaType);
    return reply.status(204).send();
  });

  fastify.delete<{ Params: { id: string } }>('/api/publications/:id/cloud', async (request, reply) => {
    const parsed = publicationIdSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_REQUEST', message: 'Publication ID must be a UUID.' } });
    }
    const publication = (await dbRepository.listPublications()).find((item) => item.id === parsed.data.id);
    if (!publication || publication.status !== 'uploaded' || !publication.cloudinaryPublicId) {
      return reply.status(409).send({ success: false, error: { code: 'PUBLICATION_NOT_UPLOADED', message: 'Only uploaded publications can be removed from the cloud.' } });
    }
    await deleteCloudPublication(publication.publicId, publication.cloudinaryPublicId);
    const updated = await dbRepository.removeCloudPublication(publication.id);
    if (!updated) throw new Error('Cloud asset was deleted but the local publication could not be updated.');
    return reply.send({ success: true, data: updated });
  });

  fastify.post<{ Params: { id: string } }>('/api/publications/:id/print', async (request, reply) => {
    const parsed = publicationIdSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_REQUEST', message: 'Publication ID must be a UUID.' } });
    }
    const output = await dbRepository.getPublicationOutput(parsed.data.id);
    if (!output) {
      return reply.status(404).send({ success: false, error: { code: 'PUBLICATION_NOT_FOUND', message: 'Publication output was not found.' } });
    }
    const result = await printerService.printImage(output.filePath);
    if (!result.success) {
      return reply.status(502).send({ success: false, error: { code: 'PRINT_FAILED', message: result.error ?? 'Print failed.' } });
    }
    return reply.send({ success: true, data: { jobId: result.jobId } });
  });
};
