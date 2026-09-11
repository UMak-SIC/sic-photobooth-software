import type { FastifyPluginAsync } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import { dbRepository } from '../db/repository.js';
import { storageService } from '../services/storage.js';
import { deleteCloudPublication } from '../services/publishing-worker.js';
import { printerService } from '../services/printer.js';
import { templateRepository } from '../templates/repository.js';
import { resolveFlipbookTemplate } from './sessions.js';

const publicationIdSchema = z.object({ id: z.string().uuid() });
const printBodySchema = z.object({
  copies: z.number().int().min(1).max(10).optional().default(1),
  recordOnly: z.boolean().optional().default(false),
});

async function resolvePublicationOutput(id: string) {
  const parsed = publicationIdSchema.safeParse({ id });
  if (parsed.success) {
    const output = await dbRepository.getPublicationOutput(id);
    if (output) return output;
  }
  const approved = await dbRepository.getApprovedOutputByPublicId(id);
  if (approved) {
    return {
      publicId: approved.publicId,
      filePath: approved.filePath,
      mediaType: approved.mediaType,
      sessionId: approved.sessionId,
    };
  }
  return null;
}

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

  fastify.get<{ Params: { id: string } }>('/api/publications/:id/flipbook-data', async (request, reply) => {
    const output = await resolvePublicationOutput(request.params.id);
    if (!output) {
      return reply.status(404).send({
        success: false,
        error: { code: 'PUBLICATION_NOT_FOUND', message: 'Publication output was not found.' },
      });
    }

    const sessionId = output.sessionId;
    let frame = null;
    let coverUrl: string | null = `/api/publications/${request.params.id}/frames/cover`;
    const motionFrameUrls: string[] = Array.from(
      { length: 15 },
      (_, i) => `/api/publications/${request.params.id}/frames/${i + 1}`,
    );
    let motionSheetUrl: string | null = null;
    let coverSheetUrl: string | null = null;

    if (sessionId) {
      const session = await dbRepository.getSessionById(sessionId);
      const targetFrameId = session?.frameId || session?.templateId || (session?.templateSnapshot as any)?.id;
      if (targetFrameId) {
        const resolvedTemplate = await resolveFlipbookTemplate(targetFrameId);
        if (resolvedTemplate) {
          frame = {
            id: resolvedTemplate.id,
            name: resolvedTemplate.name,
            coverPath: resolvedTemplate.coverPath
              ? (resolvedTemplate.coverPath.startsWith('/') ? resolvedTemplate.coverPath : `/templates/${resolvedTemplate.id}/cover`)
              : null,
            backgroundPath: resolvedTemplate.backgroundPath
              ? (resolvedTemplate.backgroundPath.startsWith('/') ? resolvedTemplate.backgroundPath : `/templates/${resolvedTemplate.id}/background`)
              : null,
            placements: resolvedTemplate.placements,
          };
          if (resolvedTemplate.backgroundPath) {
            motionSheetUrl = resolvedTemplate.backgroundPath.startsWith('/')
              ? resolvedTemplate.backgroundPath
              : `/templates/${resolvedTemplate.id}/background`;
          }
          if (resolvedTemplate.coverPath) {
            coverSheetUrl = resolvedTemplate.coverPath.startsWith('/')
              ? resolvedTemplate.coverPath
              : `/templates/${resolvedTemplate.id}/cover`;
          }
        }
      }

      if (!frame && session?.templateSnapshot) {
        const snap = session.templateSnapshot as any;
        frame = {
          id: snap.id || 'custom',
          name: snap.name || 'Custom Frame',
          coverPath: snap.coverPath
            ? (snap.coverPath.startsWith('/') ? snap.coverPath : `/templates/${snap.id}/cover`)
            : null,
          backgroundPath: snap.backgroundPath
            ? (snap.backgroundPath.startsWith('/') ? snap.backgroundPath : `/templates/${snap.id}/background`)
            : null,
          placements: snap.placements,
        };
        if (snap.backgroundPath) {
          motionSheetUrl = snap.backgroundPath.startsWith('/')
            ? snap.backgroundPath
            : `/templates/${snap.id}/background`;
        }
        if (snap.coverPath) {
          coverSheetUrl = snap.coverPath.startsWith('/')
            ? snap.coverPath
            : `/templates/${snap.id}/cover`;
        }
      }
    }

    if (!frame) {
      try {
        const flipbookTemplates = await templateRepository.list('flipbook');
        const defaultTemplate = flipbookTemplates.find((t) => t.active) || flipbookTemplates[0];
        if (defaultTemplate) {
          frame = {
            id: defaultTemplate.id,
            name: defaultTemplate.name,
            coverPath: defaultTemplate.coverPath
              ? (defaultTemplate.coverPath.startsWith('/') ? defaultTemplate.coverPath : `/templates/${defaultTemplate.id}/cover`)
              : null,
            backgroundPath: defaultTemplate.backgroundPath
              ? (defaultTemplate.backgroundPath.startsWith('/') ? defaultTemplate.backgroundPath : `/templates/${defaultTemplate.id}/background`)
              : null,
            placements: defaultTemplate.placements,
          };
          if (defaultTemplate.backgroundPath) {
            motionSheetUrl = defaultTemplate.backgroundPath.startsWith('/')
              ? defaultTemplate.backgroundPath
              : `/templates/${defaultTemplate.id}/background`;
          }
          if (defaultTemplate.coverPath) {
            coverSheetUrl = defaultTemplate.coverPath.startsWith('/')
              ? defaultTemplate.coverPath
              : `/templates/${defaultTemplate.id}/cover`;
          }
        }
      } catch {}
    }

    return reply.send({
      success: true,
      data: {
        publicId: output.publicId,
        sessionId: output.sessionId,
        mediaType: output.mediaType,
        frame,
        coverUrl,
        motionFrameUrls,
        motionSheetUrl,
        coverSheetUrl,
      },
    });
  });

  fastify.get<{ Params: { id: string } }>('/api/publications/:id/pdf', async (request, reply) => {
    const output = await resolvePublicationOutput(request.params.id);
    if (!output) {
      return reply.status(404).send({
        success: false,
        error: { code: 'PUBLICATION_NOT_FOUND', message: 'Publication output was not found.' },
      });
    }

    const pdfPath = storageService.getPdfPath(output.publicId);
    if (!pdfPath || !fs.existsSync(pdfPath)) {
      return reply.status(404).send({
        success: false,
        error: { code: 'PDF_NOT_FOUND', message: 'PDF print file has not been generated yet.' },
      });
    }

    const stream = fs.createReadStream(pdfPath);
    return reply.type('application/pdf').send(stream);
  });

  fastify.post<{ Params: { id: string } }>('/api/publications/:id/pdf', async (request, reply) => {
    const output = await resolvePublicationOutput(request.params.id);
    if (!output) {
      return reply.status(404).send({
        success: false,
        error: { code: 'PUBLICATION_NOT_FOUND', message: 'Publication output was not found.' },
      });
    }

    const file = await request.file();
    if (!file) {
      return reply.status(400).send({
        success: false,
        error: { code: 'NO_FILE', message: 'No PDF file uploaded.' },
      });
    }

    const buffer = await file.toBuffer();
    const sessionId = output.sessionId || output.publicId;
    await storageService.savePdf(sessionId, output.publicId, buffer);

    return reply.send({
      success: true,
      data: {
        publicId: output.publicId,
        saved: true,
      },
    });
  });

  fastify.get<{ Params: { id: string; frameType: string } }>(
    '/api/publications/:id/frames/:frameType',
    async (request, reply) => {
      const output = await resolvePublicationOutput(request.params.id);
      if (!output) {
        return reply.status(404).send({
          success: false,
          error: { code: 'PUBLICATION_NOT_FOUND', message: 'Publication output was not found.' },
        });
      }

      const { frameType } = request.params;
      const sessionId = output.sessionId;

      if (frameType === 'cover') {
        if (sessionId) {
          const captures = await dbRepository.getFlipbookCaptures(sessionId);
          const selectedCover = captures.covers.find((c) => c.isSelected) || captures.covers[0];
          if (selectedCover?.filePath) {
            const rawPath = selectedCover.filePath;
            const fullPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
            if (fs.existsSync(fullPath)) {
              const stream = fs.createReadStream(fullPath);
              const contentType = fullPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
              return reply.type(contentType).send(stream);
            }
          }
        }

        // Fallback: Extract first frame from generated GIF if original cover capture is missing
        const rawOutput = output.filePath;
        const gifCandidates = [
          rawOutput ? (path.isAbsolute(rawOutput) ? rawOutput : path.resolve(process.cwd(), rawOutput)) : null,
          storageService.getOutputPath(output.publicId, 'gif'),
        ].filter((p): p is string => Boolean(p && fs.existsSync(p)));

        for (const candidate of gifCandidates) {
          try {
            const frameBuf = await sharp(candidate, { page: 0 }).png().toBuffer();
            return reply.type('image/png').send(frameBuf);
          } catch {}
        }

        return reply.status(404).send({
          success: false,
          error: { code: 'MEDIA_NOT_FOUND', message: 'Original cover photo capture was not found on disk.' },
        });
      }

      const frameNum = parseInt(frameType, 10);
      if (!isNaN(frameNum) && frameNum >= 1 && frameNum <= 16) {
        if (sessionId) {
          const intDir = storageService.getSessionDir(sessionId, 'intermediate');
          const renderDirs = [
            path.join(intDir, 'render', 'extracted_frames'),
            path.join(intDir, 'render_motion', 'extracted_frames'),
            path.join(intDir, 'custom', 'extracted_frames'),
            path.join(intDir, 'prd', 'extracted_frames'),
            path.join(intDir, 'render'),
            path.join(intDir, 'render_motion'),
            path.join(intDir, 'custom'),
            path.join(intDir, 'prd'),
          ];
          for (const rDir of renderDirs) {
            if (fs.existsSync(rDir)) {
              const files = fs
                .readdirSync(rDir)
                .filter((f) => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg'))
                .sort();
              if (files.length >= frameNum) {
                const targetFile = path.join(rDir, files[frameNum - 1]);
                if (fs.existsSync(targetFile)) {
                  const contentType = targetFile.endsWith('.png') ? 'image/png' : 'image/jpeg';
                  return reply.type(contentType).send(fs.createReadStream(targetFile));
                }
              }
            }
          }
        }

        // Fallback: Extract requested frame index from generated GIF
        const rawOutput = output.filePath;
        const motionOutput = sessionId
          ? path.join(storageService.getSessionDir(sessionId, 'outputs'), `${output.publicId}_motion.gif`)
          : null;
        const gifCandidates = [
          motionOutput && fs.existsSync(motionOutput) ? motionOutput : null,
          rawOutput ? (path.isAbsolute(rawOutput) ? rawOutput : path.resolve(process.cwd(), rawOutput)) : null,
          storageService.getOutputPath(output.publicId, 'gif'),
        ].filter((p): p is string => Boolean(p && fs.existsSync(p)));

        for (const candidate of gifCandidates) {
          try {
            const meta = await sharp(candidate).metadata();
            const totalPages = meta.pages || 1;
            const targetPage = Math.min(Math.max(0, frameNum - 1), totalPages - 1);
            const frameBuf = await sharp(candidate, { page: targetPage }).png().toBuffer();
            return reply.type('image/png').send(frameBuf);
          } catch {}
        }

        return reply.status(404).send({
          success: false,
          error: { code: 'MEDIA_NOT_FOUND', message: 'Original motion capture frames were not found on disk.' },
        });
      }

      return reply.status(404).send({
        success: false,
        error: { code: 'FRAME_NOT_FOUND', message: 'Requested frame could not be resolved.' },
      });
    },
  );

  fastify.post<{ Params: { id: string }; Body?: { copies?: number; recordOnly?: boolean } }>(
    '/api/publications/:id/print',
    async (request, reply) => {
      const output = await resolvePublicationOutput(request.params.id);
      if (!output) {
        return reply.status(404).send({
          success: false,
          error: { code: 'PUBLICATION_NOT_FOUND', message: 'Publication output was not found.' },
        });
      }

      const bodyParsed = printBodySchema.safeParse(request.body || {});
      const copies = bodyParsed.success ? bodyParsed.data.copies : 1;
      const recordOnly = bodyParsed.success ? bodyParsed.data.recordOnly : false;

      let printJobId: string | undefined;
      if (!recordOnly && output.mediaType !== 'image/gif') {
        const result = await printerService.printImage(output.filePath, copies);
        if (!result.success) {
          return reply.status(502).send({
            success: false,
            error: { code: 'PRINT_FAILED', message: result.error ?? 'Print failed.' },
          });
        }
        printJobId = result.jobId;
      }

      let copiesPrinted = copies;
      if (output.sessionId) {
        const updated = await dbRepository.recordPrintStatus(output.sessionId, copies);
        if (updated) {
          copiesPrinted = updated.copiesPrinted;
        }
      }

      return reply.send({
        success: true,
        data: {
          jobId: printJobId,
          copiesPrinted,
        },
      });
    },
  );
};
