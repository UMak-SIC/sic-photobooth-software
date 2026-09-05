import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { dbRepository } from '../db/repository.js';

const eventSchema = z.object({
  name: z.string().trim().min(1).max(255),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (value) => {
        const parsed = new Date(`${value}T00:00:00Z`);
        return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
      },
      {
        message: 'Event date must be a valid calendar date',
      },
    ),
  operatorName: z.string().trim().min(1).max(255),
});

export const eventRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/events', async (_request, reply) => {
    try {
      return reply.send({ success: true, data: await dbRepository.listEvents() });
    } catch {
      return reply.status(500).send({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Could not load events.' },
      });
    }
  });

  fastify.post('/api/events', async (request, reply) => {
    const result = eventSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_REQUEST', message: result.error.errors[0]?.message },
      });
    }

    try {
      const event = await dbRepository.createEvent(
        result.data.name,
        result.data.date,
        result.data.operatorName,
      );
      return reply.status(201).send({ success: true, data: event });
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        return reply.status(409).send({
          success: false,
          error: {
            code: 'EVENT_ALREADY_EXISTS',
            message: 'An event with this name and date already exists.',
          },
        });
      }
      return reply.status(500).send({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Could not create event.' },
      });
    }
  });
};
