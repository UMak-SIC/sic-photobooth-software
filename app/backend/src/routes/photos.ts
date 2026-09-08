import type { FastifyPluginAsync } from 'fastify';
import fs from 'node:fs';
import sharp from 'sharp';
import {
  isValidPublicId,
  type PublicOutputMetadata,
  type PublicOutputResponse,
} from '@photobooth/public-output';
import { storageService } from '../services/storage.js';
import { dbRepository } from '../db/repository.js';

export const photoRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Retrieves JSON metadata for an approved public output.
   */
  fastify.get<{ Params: { id: string } }>('/photos/:id/info', async (request, reply) => {
    const { id } = request.params;

    if (!isValidPublicId(id)) {
      const errorResponse: PublicOutputResponse = {
        success: false,
        error: {
          code: 'INVALID_PUBLIC_ID',
          message: 'Photo not found. Check the QR code or enter the full link/code again.',
        },
      };
      return reply.status(400).send(errorResponse);
    }

    const output = await dbRepository.getApprovedOutputByPublicId(id);
    if (!output) {
      const errorResponse: PublicOutputResponse = {
        success: false,
        error: {
          code: 'PHOTO_NOT_FOUND',
          message: 'Photo not found. Check the QR code or enter the full link/code again.',
        },
      };
      return reply.status(404).send(errorResponse);
    }

    const host = request.headers.host || '192.168.4.1';
    const protocol = request.protocol || 'http';
    const mediaUrl = `${protocol}://${host}/photos/${output.publicId}`;

    const metadata: PublicOutputMetadata = {
      publicId: output.publicId,
      sessionType: output.mediaType === 'image/gif' ? 'flipbook' : 'photo_strip',
      mediaType: output.mediaType === 'image/gif' ? 'image/gif' : 'image/png',
      mediaUrl,
      eventName: output.eventName || 'Photobooth Event',
      eventDate: output.eventDate || new Date().toISOString().split('T')[0],
      createdAt: output.createdAt
        ? new Date(output.createdAt).toISOString()
        : new Date().toISOString(),
      expiresAt: null, // Offline local copy has no cloud expiry
      status: 'queued',
    };

    const successResponse: PublicOutputResponse = {
      success: true,
      data: metadata,
    };

    return reply.send(successResponse);
  });

  /**
   * Streams the approved public output binary file (image/png or image/gif).
   */
  fastify.get<{ Params: { id: string }; Querystring: { variant?: string; preview?: string } }>(
    '/photos/:id',
    async (request, reply) => {
      const { id } = request.params;
      const { variant, preview } = request.query;

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

      // If a specific variant is requested (e.g. motion, prd, custom)
      if (
        variant &&
        (variant === 'motion' || variant === 'prd' || variant === 'custom') &&
        output.filePath
      ) {
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

      if (preview === 'true' && output.mediaType === 'image/gif') {
        return reply.type('image/png').send(await sharp(filePath, { animated: false }).png().toBuffer());
      }

      const contentType =
        output.mediaType || (filePath.endsWith('.gif') ? 'image/gif' : 'image/png');
      const stream = fs.createReadStream(filePath);

      return reply.type(contentType).send(stream);
    },
  );
};
