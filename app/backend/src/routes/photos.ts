import type { FastifyPluginAsync } from 'fastify';
import fs from 'node:fs';
import { isValidPublicId } from '@photobooth/public-output';
import { storageService } from '../services/storage.js';
import { dbRepository } from '../db/repository.js';

export const photoRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { id: string }; Querystring: { variant?: string } }>(
    '/photos/:id',
    async (request, reply) => {
      const { id } = request.params;
      const { variant } = request.query;

      if (!isValidPublicId(id)) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'INVALID_PUBLIC_ID',
            message: 'Photo not found. Check the QR code or enter the full link/code again.',
          },
        });
      }

      // Verify an approved generated output record exists in the database
      const output = await dbRepository.getApprovedOutputByPublicId(id);
      if (!output) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'PHOTO_NOT_FOUND',
            message: 'Photo not found. Check the QR code or enter the full link/code again.',
          },
        });
      }

      let filePath: string | null = null;
      const extension = output.mediaType === 'image/gif' ? 'gif' : 'png';

      // If a specific variant is requested (e.g. prd or custom)
      if (variant && (variant === 'prd' || variant === 'custom') && output.filePath) {
        const variantCandidate = output.filePath.replace(
          new RegExp(`\\.${extension}$`),
          `_${variant}.${extension}`,
        );
        if (fs.existsSync(variantCandidate)) {
          filePath = variantCandidate;
        }
      }

      if (!filePath && output.filePath && fs.existsSync(output.filePath)) {
        filePath = output.filePath;
      } else if (!filePath) {
        const fallbackPath = storageService.getOutputPath(id, extension);
        if (fallbackPath && fs.existsSync(fallbackPath)) {
          filePath = fallbackPath;
        }
      }

      if (!filePath || !fs.existsSync(filePath)) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'PHOTO_NOT_FOUND',
            message: 'Photo not found. Check the QR code or enter the full link/code again.',
          },
        });
      }

      const contentType =
        output.mediaType || (filePath.endsWith('.gif') ? 'image/gif' : 'image/png');
      const stream = fs.createReadStream(filePath);

      return reply.type(contentType).send(stream);
    },
  );
};
