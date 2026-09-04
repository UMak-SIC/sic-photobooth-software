import type { FastifyPluginAsync } from 'fastify';
import fs from 'node:fs';
import { isValidPublicId } from '@photobooth/public-output';
import { storageService } from '../services/storage.js';

export const photoRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { id: string } }>('/photos/:id', async (request, reply) => {
    const { id } = request.params;

    if (!isValidPublicId(id)) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_PUBLIC_ID',
          message: 'Photo not found. Check the QR code or enter the full link/code again.',
        },
      });
    }

    // Attempt PNG then GIF output retrieval
    const pngPath = storageService.getOutputPath(id, 'png');
    const gifPath = storageService.getOutputPath(id, 'gif');
    const filePath = pngPath || gifPath;

    if (!filePath || !fs.existsSync(filePath)) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'PHOTO_NOT_FOUND',
          message: 'Photo not found. Check the QR code or enter the full link/code again.',
        },
      });
    }

    const contentType = filePath.endsWith('.gif') ? 'image/gif' : 'image/png';
    const stream = fs.createReadStream(filePath);

    return reply.type(contentType).send(stream);
  });
};
