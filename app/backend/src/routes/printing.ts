import fs from 'node:fs';
import crypto from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { dbRepository, type PrintJob } from '../db/repository.js';
import { printerConfig } from '../config.js';

const requestSchema = z.object({ copies: z.number().int().min(1).max(10), requestKey: z.string().uuid() });
function publicJob(job: PrintJob) {
  const { artifactPath: _artifactPath, ...safe } = job;
  return { ...safe, copiesWaiting: job.status === 'completed' ? 0 : Math.max(job.copiesRequested - job.copiesCompleted, 0) };
}

export const printingRoutes: FastifyPluginAsync = async (fastify) => {
  const create = async (sessionId: string, body: unknown, token?: string | string[]) => {
    const input = requestSchema.safeParse(body);
    if (!input.success) return { error: 'Copies must be between 1 and 10 and requestKey must be a UUID.', status: 400 };
    const session = await dbRepository.getSessionById(sessionId);
    if (!session) return { error: 'Session does not exist.', status: 404 };
    if (typeof token !== 'string' || token !== session.token) return { error: 'Invalid or missing session authorization token.', status: 403 };
    if (session.state !== 'booth_confirmed' && session.state !== 'printed') return { error: 'Printing is only allowed after booth confirmation.', status: 409 };
    const output = await dbRepository.getLatestOutputForSession(sessionId);
    if (!output) return { error: 'Finalized output is not ready.', status: 409 };
    const artifactPath = session.type === 'flipbook' ? (await import('../services/storage.js')).storageService.getPdfPath(output.publicId) : output.filePath;
    const artifactType = session.type === 'flipbook' ? 'application/pdf' : 'image/png';
    if (!artifactPath || !fs.existsSync(artifactPath)) return { error: 'Printable artifact is not ready.', status: 409, code: 'PRINT_ARTIFACT_NOT_READY' };
    return { job: await dbRepository.createPrintJob({ outputId: output.id, sessionId, requestKey: input.data.requestKey, artifactPath, artifactType, publicId: output.publicId, outputType: session.type, printerName: printerConfig.printerName, mediaSize: printerConfig.mediaSize, copiesRequested: input.data.copies, submissionMode: printerConfig.enableHardwarePrint ? 'cups' : 'simulation', reprintOfId: null }) };
  };

  fastify.post<{ Params: { id: string } }>('/api/sessions/:id/print-jobs', async (request, reply) => {
    const result = await create(request.params.id, request.body, request.headers['x-session-token']);
    if ('error' in result) return reply.status(result.status ?? 400).send({ success: false, error: { code: result.code || 'PRINT_JOB_REJECTED', message: result.error } });
    return reply.status(201).send({ success: true, data: publicJob(result.job) });
  });
  fastify.get<{ Params: { id: string; jobId: string } }>('/api/sessions/:id/print-jobs/:jobId', async (request, reply) => {
    const session = await dbRepository.getSessionById(request.params.id);
    const job = await dbRepository.getPrintJob(request.params.jobId);
    if (!session || typeof request.headers['x-session-token'] !== 'string' || request.headers['x-session-token'] !== session.token || !job || job.sessionId !== session.id) return reply.status(404).send({ success: false, error: { code: 'PRINT_JOB_NOT_FOUND', message: 'Print job was not found.' } });
    return reply.send({ success: true, data: publicJob(job) });
  });
  fastify.get('/api/print-jobs', async (_request, reply) => reply.send({ success: true, data: (await dbRepository.listPrintJobs()).map(publicJob) }));
  fastify.get<{ Params: { id: string } }>('/api/print-jobs/:id', async (request, reply) => { const job = await dbRepository.getPrintJob(request.params.id); return job ? reply.send({ success: true, data: publicJob(job) }) : reply.status(404).send({ success: false, error: { code: 'PRINT_JOB_NOT_FOUND', message: 'Print job was not found.' } }); });
  fastify.get('/api/printer/status', async (_request, reply) => reply.send({ success: true, data: { enabled: printerConfig.enableHardwarePrint, mode: printerConfig.enableHardwarePrint ? 'cups' : 'simulation', destination: printerConfig.printerName, mediaSize: printerConfig.mediaSize } }));
  fastify.post<{ Params: { id: string } }>('/api/print-jobs/:id/retry', async (request, reply) => { const job = await dbRepository.getPrintJob(request.params.id); if (!job || !['failed', 'canceled', 'needs_attention'].includes(job.status) || !fs.existsSync(job.artifactPath)) return reply.status(409).send({ success: false, error: { code: 'PRINT_JOB_NOT_RETRYABLE', message: 'Only recoverable jobs with their artifact available can retry.' } }); return reply.send({ success: true, data: publicJob((await dbRepository.updatePrintJob(job.id, 'queued'))!) }); });
  fastify.post<{ Params: { id: string } }>('/api/print-jobs/:id/reprint', async (request, reply) => { const job = await dbRepository.getPrintJob(request.params.id); if (!job || job.status !== 'completed' || !fs.existsSync(job.artifactPath)) return reply.status(409).send({ success: false, error: { code: 'PRINT_JOB_NOT_REPRINTABLE', message: 'Only completed jobs with an available artifact can reprint.' } }); const copy = await dbRepository.createPrintJob({ outputId: job.outputId, sessionId: job.sessionId, requestKey: crypto.randomUUID(), artifactPath: job.artifactPath, artifactType: job.artifactType, publicId: job.publicId, outputType: job.outputType, printerName: job.printerName, mediaSize: job.mediaSize, copiesRequested: job.copiesRequested, submissionMode: job.submissionMode, reprintOfId: job.id }); return reply.status(201).send({ success: true, data: publicJob(copy) }); });
};
