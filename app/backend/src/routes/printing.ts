import fs from 'node:fs/promises';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { dbRepository } from '../db/provider.js';
import { printerConfig } from '../config.js';
import { printerService } from '../services/printer.js';
import { storageService } from '../services/storage.js';

const createSchema = z.object({
  copies: z.number().int().min(1).max(10),
  requestKey: z.string().uuid(),
});
const idSchema = z.object({ id: z.string().uuid() });

function authorized(header: string | string[] | undefined, token: string) {
  return typeof header === 'string' && header === token;
}

async function readyArtifact(output: { mediaType: string; filePath: string; publicId: string }) {
  const isFlipbook = output.mediaType === 'image/gif';
  const artifactPath = isFlipbook ? storageService.getPdfPath(output.publicId) : output.filePath;
  const artifactType = isFlipbook ? 'application/pdf' : 'image/png';
  if (!artifactPath) return null;
  try {
    const file = await fs.readFile(artifactPath);
    if (!file.length || (isFlipbook && !file.subarray(0, 5).equals(Buffer.from('%PDF-'))))
      return null;
    return { artifactPath, artifactType: artifactType as 'image/png' | 'application/pdf' };
  } catch {
    return null;
  }
}

export const printingRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { id: string } }>(
    '/api/sessions/:id/print-jobs',
    async (request, reply) => {
      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.status(400).send({
          success: false,
          error: {
            code: 'INVALID_PRINT_REQUEST',
            message: 'Copies must be 1-10 and requestKey must be a UUID.',
          },
        });
      const session = await dbRepository.getSessionById(request.params.id);
      if (!session)
        return reply.status(404).send({
          success: false,
          error: { code: 'SESSION_NOT_FOUND', message: 'Session does not exist.' },
        });
      if (!authorized(request.headers['x-session-token'], session.token))
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Invalid session token.' },
        });
      if (!['booth_confirmed', 'printed'].includes(session.state))
        return reply.status(409).send({
          success: false,
          error: {
            code: 'PRINT_NOT_READY',
            message: 'Printing is only available after output confirmation.',
          },
        });
      const output = await dbRepository.getLatestOutputForSession(session.id);
      if (!output)
        return reply.status(409).send({
          success: false,
          error: {
            code: 'PRINT_ARTIFACT_NOT_READY',
            message: 'The finalized print artifact is not ready.',
          },
        });
      const artifact = await readyArtifact(output);
      if (!artifact)
        return reply.status(409).send({
          success: false,
          error: {
            code: 'PRINT_ARTIFACT_NOT_READY',
            message: 'The finalized print artifact is not ready.',
          },
        });
      const job = await dbRepository.createPrintJob({
        output,
        requestKey: parsed.data.requestKey,
        ...artifact,
        copies: parsed.data.copies,
        printerName: printerConfig.printerName,
        mediaSize: printerConfig.mediaSize,
        mode: printerConfig.enableHardwarePrint ? 'cups' : 'simulation',
        rejectAfterInitialCompletion: true,
      });
      if (!job)
        return reply.status(409).send({
          success: false,
          error: {
            code: 'PRINT_REPRINT_REQUIRED',
            message:
              'This session has already completed its initial print. Use Reprint from the print queue.',
          },
        });
      return reply.status(202).send({ success: true, data: job });
    },
  );

  fastify.get<{ Params: { id: string; jobId: string } }>(
    '/api/sessions/:id/print-jobs/:jobId',
    async (request, reply) => {
      const session = await dbRepository.getSessionById(request.params.id);
      if (!session || !authorized(request.headers['x-session-token'], session.token))
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Invalid session token.' },
        });
      const job = await dbRepository.getPrintJob(request.params.jobId);
      if (!job || job.sessionId !== session.id)
        return reply.status(404).send({
          success: false,
          error: { code: 'PRINT_JOB_NOT_FOUND', message: 'Print job does not exist.' },
        });
      return reply.send({ success: true, data: job });
    },
  );

  fastify.post('/api/print-jobs', async (request, reply) => {
    const body = z
      .object({
        publicId: z.string().length(7),
        copies: z.number().int().min(1).max(10),
        requestKey: z.string().uuid(),
      })
      .safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_PRINT_REQUEST',
          message: 'Provide a public ID, 1-10 copies, and request key.',
        },
      });
    const output = await dbRepository.getOutputByPublicId(body.data.publicId);
    if (!output)
      return reply.status(404).send({
        success: false,
        error: { code: 'OUTPUT_NOT_FOUND', message: 'Output does not exist.' },
      });
    const artifact = await readyArtifact(output);
    if (!artifact)
      return reply.status(409).send({
        success: false,
        error: {
          code: 'PRINT_ARTIFACT_NOT_READY',
          message: 'The finalized print artifact is not ready.',
        },
      });
    const job = await dbRepository.createPrintJob({
      output,
      requestKey: body.data.requestKey,
      ...artifact,
      copies: body.data.copies,
      printerName: printerConfig.printerName,
      mediaSize: printerConfig.mediaSize,
      mode: printerConfig.enableHardwarePrint ? 'cups' : 'simulation',
    });
    return reply.status(202).send({ success: true, data: job });
  });

  fastify.get('/api/print-jobs', async (request, reply) => {
    const query = z
      .object({
        cursor: z.string().datetime().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(30),
      })
      .safeParse(request.query);
    if (!query.success)
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_CURSOR', message: 'Invalid queue cursor.' },
      });
    const jobs = await dbRepository.listPrintJobs(
      query.data.limit,
      query.data.cursor ? new Date(query.data.cursor) : undefined,
    );
    return reply.send({
      success: true,
      data: { jobs, nextCursor: jobs.at(-1)?.createdAt?.toISOString() ?? null },
    });
  });

  fastify.get<{ Params: { id: string } }>('/api/print-jobs/:id', async (request, reply) => {
    const job = await dbRepository.getPrintJob(request.params.id);
    return job
      ? reply.send({ success: true, data: job })
      : reply.status(404).send({
          success: false,
          error: { code: 'PRINT_JOB_NOT_FOUND', message: 'Print job does not exist.' },
        });
  });

  fastify.post<{ Params: { id: string } }>('/api/print-jobs/:id/retry', async (request, reply) => {
    const job = await dbRepository.retryPrintJob(request.params.id);
    return job
      ? reply.status(202).send({ success: true, data: job })
      : reply.status(409).send({
          success: false,
          error: {
            code: 'PRINT_JOB_NOT_RETRYABLE',
            message: 'Only failed, canceled, or attention-needed jobs can retry.',
          },
        });
  });

  fastify.post<{ Params: { id: string } }>('/api/print-jobs/:id/cancel', async (request, reply) => {
    const cupsJobId = await dbRepository.getCurrentCupsJobId(request.params.id);
    const job = await dbRepository.cancelPrintJob(request.params.id);
    if (!job)
      return reply.status(409).send({
        success: false,
        error: {
          code: 'PRINT_JOB_NOT_CANCELABLE',
          message: 'Only active print jobs can be canceled.',
        },
      });
    if (cupsJobId) await printerService.cancelJob(cupsJobId);
    return reply.send({ success: true, data: job });
  });

  fastify.post<{ Params: { id: string } }>(
    '/api/print-jobs/:id/reprint',
    async (request, reply) => {
      const body = z.object({ requestKey: z.string().uuid() }).safeParse(request.body);
      if (!body.success)
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_PRINT_REQUEST', message: 'A request key is required.' },
        });
      const job = await dbRepository.reprintPrintJob(request.params.id, body.data.requestKey);
      return job
        ? reply.status(202).send({ success: true, data: job })
        : reply.status(409).send({
            success: false,
            error: {
              code: 'PRINT_JOB_NOT_REPRINTABLE',
              message: 'Only completed jobs can reprint.',
            },
          });
    },
  );

  fastify.get('/api/printer/status', async (_request, reply) =>
    reply.send({
      success: true,
      data: {
        mode: printerConfig.enableHardwarePrint ? 'cups' : 'simulation',
        printerName: printerConfig.printerName,
        mediaSize: printerConfig.mediaSize,
      },
    }),
  );
};
