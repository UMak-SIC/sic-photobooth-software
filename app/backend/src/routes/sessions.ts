import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { dbRepository } from '../db/repository.js';
import { sessionStateMachine, type SessionState } from '../services/session-state-machine.js';
import type { SessionType } from '@photobooth/public-output';

const createSessionSchema = z.object({
  eventName: z.string().min(1),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  operatorName: z.string().min(1),
  type: z.enum(['photo_strip', 'flipbook']),
});

const transitionSessionSchema = z.object({
  targetState: z.string().min(1),
});

export const sessionRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. Create a new session
  fastify.post('/api/sessions', async (request, reply) => {
    const parseResult = createSessionSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: parseResult.error.errors[0]?.message || 'Invalid request body',
        },
      });
    }

    const { eventName, eventDate, operatorName, type } = parseResult.data;

    try {
      const event = await dbRepository.getOrCreateEvent(eventName, eventDate, operatorName);
      const token = sessionStateMachine.generateSessionToken();
      const session = await dbRepository.createSession(event.id, type as SessionType, token);

      return reply.status(201).send({
        success: true,
        data: {
          sessionId: session.id,
          token: session.token,
          type: session.type,
          state: session.state,
          eventId: session.eventId,
          eventName: event.name,
          eventDate: event.date,
          createdAt: session.createdAt,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({
        success: false,
        error: { code: 'DATABASE_ERROR', message },
      });
    }
  });

  // 2. Retrieve session state
  fastify.get<{ Params: { id: string } }>('/api/sessions/:id', async (request, reply) => {
    const { id } = request.params;

    try {
      const session = await dbRepository.getSessionById(id);
      if (!session) {
        return reply.status(404).send({
          success: false,
          error: { code: 'SESSION_NOT_FOUND', message: 'Session does not exist' },
        });
      }

      return reply.send({
        success: true,
        data: session,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({
        success: false,
        error: { code: 'DATABASE_ERROR', message },
      });
    }
  });

  // 3. Workflow State Transition
  fastify.post<{ Params: { id: string } }>(
    '/api/sessions/:id/transition',
    async (request, reply) => {
      const { id } = request.params;
      const sessionToken = request.headers['x-session-token'];

      const parseResult = transitionSessionSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'Invalid target state' },
        });
      }

      try {
        const session = await dbRepository.getSessionById(id);
        if (!session) {
          return reply.status(404).send({
            success: false,
            error: { code: 'SESSION_NOT_FOUND', message: 'Session does not exist' },
          });
        }

        // Check session token authorization
        if (sessionToken && sessionToken !== session.token) {
          return reply.status(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Invalid session authorization token' },
          });
        }

        const targetState = parseResult.data.targetState as SessionState;
        sessionStateMachine.assertValidTransition(session.type, session.state, targetState);

        const updated = await dbRepository.updateSessionState(id, targetState);

        return reply.send({
          success: true,
          data: updated,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_TRANSITION', message },
        });
      }
    },
  );

  // 4. Cancel active session
  fastify.post<{ Params: { id: string } }>('/api/sessions/:id/cancel', async (request, reply) => {
    const { id } = request.params;
    const sessionToken = request.headers['x-session-token'];

    try {
      const session = await dbRepository.getSessionById(id);
      if (!session) {
        return reply.status(404).send({
          success: false,
          error: { code: 'SESSION_NOT_FOUND', message: 'Session does not exist' },
        });
      }

      if (sessionToken && sessionToken !== session.token) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Invalid session authorization token' },
        });
      }

      const cancelled = await dbRepository.cancelSession(id);
      return reply.send({
        success: true,
        data: cancelled ?? { ...session, state: 'cancelled' as SessionState },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({
        success: false,
        error: { code: 'DATABASE_ERROR', message },
      });
    }
  });
};
