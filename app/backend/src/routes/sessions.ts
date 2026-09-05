import fs from 'node:fs';
import path from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { generatePublicId } from '@photobooth/public-output';
import { dbRepository, type TemplatePlacement, type TemplateOverlay } from '../db/repository.js';
import { sessionStateMachine, type SessionState } from '../services/session-state-machine.js';
import { storageService } from '../services/storage.js';
import { mediaValidator } from '../services/media-validator.js';
import { gifRenderer } from '../services/gif-renderer.js';
import { flipbookConfig } from '../config.js';
import { photoStripRenderer } from '../services/photo-strip-renderer.js';
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

const selectFrameSchema = z.object({
  frameId: z.string().min(1),
});

const selectTemplateSchema = z.object({
  templateId: z.string().min(1),
});

const selectFlipbookSchema = z.object({
  coverIndex: z.number().int().min(1).max(3),
  videoIndex: z.number().int().min(1).max(3),
});

const printSessionSchema = z.object({
  copies: z.number().int().min(1).default(1),
});

function isSessionAuthorized(
  sessionTokenHeader: string | string[] | undefined,
  sessionToken: string,
): boolean {
  return typeof sessionTokenHeader === 'string' && sessionTokenHeader === sessionToken;
}

function stripToken<T extends { token: string }>(session: T | null): Omit<T, 'token'> | null {
  if (!session) return null;
  const { token: _token, ...safe } = session;
  return safe;
}

export const sessionRoutes: FastifyPluginAsync = async (fastify) => {
  // 0. List active frames for Flipbook
  fastify.get('/api/frames', async (_request, reply) => {
    try {
      let frames = await dbRepository.listActiveFrames();
      // Seed default frames if none exist
      if (frames.length === 0) {
        await dbRepository.createFrame('SIC Seal', 'frames/sic-seal.png');
        await dbRepository.createFrame('Emerald Motion', 'frames/emerald-motion.png');
        await dbRepository.createFrame('Pioneer Grid', 'frames/pioneer-grid.png');
        frames = await dbRepository.listActiveFrames();
      }
      return reply.send({
        success: true,
        data: frames,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({
        success: false,
        error: { code: 'DATABASE_ERROR', message },
      });
    }
  });

  // 0b. List active templates for Photo Strip
  fastify.get('/api/templates', async (_request, reply) => {
    try {
      let templates = await dbRepository.listActiveTemplates();
      // Seed default templates if none exist
      if (templates.length === 0) {
        await dbRepository.createTemplate(
          'Classic Portrait Strip',
          'portrait',
          1200,
          1800,
          'templates/classic-portrait.png',
          3,
          5,
          [
            {
              captureIndex: 1,
              x: 100,
              y: 120,
              width: 1000,
              height: 440,
              rotation: 0,
              borderRadius: 8,
              zIndex: 1,
            },
            {
              captureIndex: 2,
              x: 100,
              y: 600,
              width: 1000,
              height: 440,
              rotation: 0,
              borderRadius: 8,
              zIndex: 1,
            },
            {
              captureIndex: 3,
              x: 100,
              y: 1080,
              width: 1000,
              height: 440,
              rotation: 0,
              borderRadius: 8,
              zIndex: 1,
            },
          ],
        );
        await dbRepository.createTemplate(
          'Grid 2x2 Landscape',
          'landscape',
          1800,
          1200,
          'templates/grid-landscape.png',
          4,
          5,
          [
            {
              captureIndex: 1,
              x: 120,
              y: 120,
              width: 720,
              height: 450,
              rotation: 0,
              borderRadius: 8,
              zIndex: 1,
            },
            {
              captureIndex: 2,
              x: 960,
              y: 120,
              width: 720,
              height: 450,
              rotation: 0,
              borderRadius: 8,
              zIndex: 1,
            },
            {
              captureIndex: 3,
              x: 120,
              y: 630,
              width: 720,
              height: 450,
              rotation: 0,
              borderRadius: 8,
              zIndex: 1,
            },
            {
              captureIndex: 4,
              x: 960,
              y: 630,
              width: 720,
              height: 450,
              rotation: 0,
              borderRadius: 8,
              zIndex: 1,
            },
          ],
        );
        templates = await dbRepository.listActiveTemplates();
      }
      return reply.send({
        success: true,
        data: templates,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({
        success: false,
        error: { code: 'DATABASE_ERROR', message },
      });
    }
  });

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

      // Initialize storage folders for the new session
      storageService.getSessionDir(session.id);

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

  // 2. Retrieve session state (read-only polling, strips session token)
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

      const { token: _token, ...safeSession } = session;
      return reply.send({
        success: true,
        data: safeSession,
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

        // Strictly enforce session token authorization
        if (!isSessionAuthorized(sessionToken, session.token)) {
          return reply.status(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Invalid or missing session authorization token' },
          });
        }

        const targetState = parseResult.data.targetState as SessionState;
        sessionStateMachine.assertValidTransition(session.type, session.state, targetState);

        const updated = await dbRepository.updateSessionState(id, targetState);

        return reply.send({
          success: true,
          data: stripToken(updated),
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

  // 4. Select Frame (Flipbook)
  fastify.post<{ Params: { id: string } }>('/api/sessions/:id/frame', async (request, reply) => {
    const { id } = request.params;
    const sessionToken = request.headers['x-session-token'];

    const parseResult = selectFrameSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Valid frameId is required' },
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

      if (!isSessionAuthorized(sessionToken, session.token)) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Invalid or missing session authorization token' },
        });
      }

      sessionStateMachine.assertValidTransition(session.type, session.state, 'frame_selected');

      const frame = await dbRepository.getFrameById(parseResult.data.frameId);
      if (!frame) {
        return reply.status(404).send({
          success: false,
          error: { code: 'FRAME_NOT_FOUND', message: 'Selected frame does not exist' },
        });
      }

      const updated = await dbRepository.setSessionFrame(id, frame.id);

      return reply.send({
        success: true,
        data: stripToken(updated),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({
        success: false,
        error: { code: 'WORKFLOW_ERROR', message },
      });
    }
  });

  // 4b. Select Template (Photo Strip)
  const handleSelectTemplate = async (
    request: import('fastify').FastifyRequest<{ Params: { id: string } }>,
    reply: import('fastify').FastifyReply,
  ) => {
    const { id } = request.params;
    const sessionToken = request.headers['x-session-token'];

    const parseResult = selectTemplateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Valid templateId is required' },
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

      if (!isSessionAuthorized(sessionToken, session.token)) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Invalid or missing session authorization token' },
        });
      }

      sessionStateMachine.assertValidTransition(session.type, session.state, 'template_selected');

      const template = await dbRepository.getTemplateById(parseResult.data.templateId);
      if (!template) {
        return reply.status(404).send({
          success: false,
          error: { code: 'TEMPLATE_NOT_FOUND', message: 'Selected template does not exist' },
        });
      }

      const updated = await dbRepository.selectTemplate(id, template);

      return reply.send({
        success: true,
        data: stripToken(updated),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({
        success: false,
        error: { code: 'WORKFLOW_ERROR', message },
      });
    }
  };

  fastify.post<{ Params: { id: string } }>('/api/sessions/:id/template', handleSelectTemplate);
  fastify.post<{ Params: { id: string } }>(
    '/api/sessions/:id/select-template',
    handleSelectTemplate,
  );

  // 5. Acknowledge Instructions (Flipbook)
  fastify.post<{ Params: { id: string } }>(
    '/api/sessions/:id/instructions/acknowledge',
    async (request, reply) => {
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

        if (!isSessionAuthorized(sessionToken, session.token)) {
          return reply.status(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Invalid or missing session authorization token' },
          });
        }

        if (session.state === 'created') {
          const defaultFrame = await dbRepository.getFrameById('default');
          if (defaultFrame) {
            await dbRepository.setSessionFrame(id, defaultFrame.id);
          } else {
            await dbRepository.updateSessionState(id, 'frame_selected');
          }
        }

        sessionStateMachine.assertValidTransition(
          session.type,
          session.state === 'created' ? 'frame_selected' : session.state,
          'instructions',
        );
        await dbRepository.updateSessionState(id, 'instructions');

        // Transition immediately to cover_capture
        sessionStateMachine.assertValidTransition(session.type, 'instructions', 'cover_capture');
        const updated = await dbRepository.updateSessionState(id, 'cover_capture');

        return reply.send({
          success: true,
          data: stripToken(updated),
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({
          success: false,
          error: { code: 'WORKFLOW_ERROR', message },
        });
      }
    },
  );

  // 6. Upload Photo Strip Capture (with 4-retake maximum enforcement)
  fastify.post<{ Params: { id: string } }>(
    '/api/sessions/:id/captures/photo',
    async (request, reply) => {
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

        if (!isSessionAuthorized(sessionToken, session.token)) {
          return reply.status(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Invalid or missing session authorization token' },
          });
        }

        if (session.state === 'template_selected') {
          sessionStateMachine.assertValidTransition(session.type, session.state, 'capturing');
          await dbRepository.updateSessionState(id, 'capturing');
          session.state = 'capturing';
        }

        if (session.state !== 'capturing' && session.state !== 'review') {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'INVALID_STATE',
              message: 'This step is not available yet. Continue the current workflow.',
            },
          });
        }

        const data = await request.file();
        if (!data) {
          return reply.status(400).send({
            success: false,
            error: { code: 'NO_FILE', message: 'No image file uploaded' },
          });
        }

        const getFieldValue = (field: unknown): string | undefined => {
          if (!field) return undefined;
          if (
            typeof field === 'object' &&
            'value' in field &&
            typeof (field as { value: unknown }).value === 'string'
          ) {
            return (field as { value: string }).value;
          }
          return undefined;
        };

        const isRetake = data.fields?.isRetake
          ? getFieldValue(data.fields.isRetake) === 'true' || session.state === 'review'
          : session.state === 'review';

        if (isRetake && session.retakeCount >= 4) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'LIMIT_EXCEEDED',
              message: 'Maximum retake limit of 4 reached for this session',
            },
          });
        }

        const snapshot = session.templateSnapshot as Record<string, unknown> | null;
        const targetCount =
          typeof snapshot?.requiredCaptureCount === 'number'
            ? (snapshot.requiredCaptureCount as number)
            : 3;

        const rawIndexStr = getFieldValue(data.fields?.captureIndex);
        const rawIndex = rawIndexStr ? parseInt(rawIndexStr, 10) : 1;
        if (!Number.isInteger(rawIndex) || rawIndex < 1 || rawIndex > targetCount) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'INVALID_SLOT',
              message: `Capture index must be an integer between 1 and ${targetCount}`,
            },
          });
        }
        const captureIndex = rawIndex;

        const buffer = await data.toBuffer();
        const validation = mediaValidator.validateImage(buffer);
        if (!validation.isValid) {
          return reply.status(400).send({
            success: false,
            error: { code: 'INVALID_FILE', message: validation.error },
          });
        }

        const extension = validation.format === 'png' ? 'png' : 'jpg';
        const filePath = await storageService.saveOriginalCapture(
          id,
          captureIndex,
          buffer,
          extension,
        );

        const result = await dbRepository.savePhotoCapture(id, captureIndex, filePath, isRetake);

        // If in capturing mode and target captures reached, transition to review
        let currentState = session.state;
        if (session.state === 'capturing' && result.captureCount >= targetCount) {
          sessionStateMachine.assertValidTransition(session.type, session.state, 'review');
          await dbRepository.updateSessionState(id, 'review');
          currentState = 'review';
        }

        return reply.status(201).send({
          success: true,
          data: {
            captureIndex,
            totalCaptures: result.captureCount,
            retakeCount: result.retakeCount,
            state: currentState,
          },
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(500).send({
          success: false,
          error: { code: 'UPLOAD_ERROR', message },
        });
      }
    },
  );

  // 7. Upload Cover Photo (Flipbook 1..3)
  fastify.post<{ Params: { id: string } }>(
    '/api/sessions/:id/captures/cover',
    async (request, reply) => {
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

        if (!isSessionAuthorized(sessionToken, session.token)) {
          return reply.status(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Invalid or missing session authorization token' },
          });
        }

        if (session.state !== 'cover_capture') {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'INVALID_STATE',
              message: 'This step is not available yet. Continue the current workflow.',
            },
          });
        }

        const data = await request.file();
        if (!data) {
          return reply.status(400).send({
            success: false,
            error: { code: 'NO_FILE', message: 'No image file uploaded' },
          });
        }

        const buffer = await data.toBuffer();
        const validation = mediaValidator.validateImage(buffer);
        if (!validation.isValid) {
          return reply.status(400).send({
            success: false,
            error: { code: 'INVALID_FILE', message: validation.error },
          });
        }

        // Determine cover index from field or current capture count
        const existing = await dbRepository.getFlipbookCaptures(id);
        const coverIndex = existing.covers.length + 1;
        if (coverIndex > 3) {
          return reply.status(400).send({
            success: false,
            error: { code: 'LIMIT_EXCEEDED', message: 'All 3 cover photos already uploaded' },
          });
        }

        const extension = validation.format === 'png' ? 'png' : 'jpg';
        const filePath = await storageService.saveOriginalCapture(
          id,
          coverIndex,
          buffer,
          extension,
        );

        await dbRepository.saveCoverCapture(id, coverIndex, filePath);

        // If 3 covers captured, transition state to video_capture
        let currentState: SessionState = session.state;
        if (coverIndex === 3) {
          sessionStateMachine.assertValidTransition(session.type, session.state, 'video_capture');
          await dbRepository.updateSessionState(id, 'video_capture');
          currentState = 'video_capture';
        }

        return reply.status(201).send({
          success: true,
          data: {
            coverIndex,
            totalCovers: coverIndex,
            state: currentState,
          },
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(500).send({
          success: false,
          error: { code: 'UPLOAD_ERROR', message },
        });
      }
    },
  );

  // 7. Upload Video Recording (Flipbook 1..3, 6-second video)
  fastify.post<{ Params: { id: string } }>(
    '/api/sessions/:id/captures/video',
    async (request, reply) => {
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

        if (!isSessionAuthorized(sessionToken, session.token)) {
          return reply.status(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Invalid or missing session authorization token' },
          });
        }

        if (session.state !== 'video_capture') {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'INVALID_STATE',
              message: 'This step is not available yet. Continue the current workflow.',
            },
          });
        }

        const data = await request.file();
        if (!data) {
          return reply.status(400).send({
            success: false,
            error: { code: 'NO_FILE', message: 'No video file uploaded' },
          });
        }

        const buffer = await data.toBuffer();
        const validation = mediaValidator.validateVideo(buffer, {
          minDurationSeconds: flipbookConfig.videoDurationMinSeconds,
          maxDurationSeconds: flipbookConfig.videoDurationMaxSeconds,
        });
        if (!validation.isValid) {
          return reply.status(400).send({
            success: false,
            error: { code: 'INVALID_FILE', message: validation.error },
          });
        }

        const existing = await dbRepository.getFlipbookCaptures(id);
        const videoIndex = existing.videos.length + 1;
        if (videoIndex > 3) {
          return reply.status(400).send({
            success: false,
            error: { code: 'LIMIT_EXCEEDED', message: 'All 3 video clips already recorded' },
          });
        }

        const videoExt = validation.format === 'mp4' ? 'mp4' : 'webm';
        const filePath = await storageService.saveVideo(id, videoIndex, buffer, videoExt);

        await dbRepository.saveVideoCapture(
          id,
          videoIndex,
          filePath,
          validation.durationSeconds ?? 6.0,
        );

        // If 3 videos recorded, transition to review
        let currentState: SessionState = session.state;
        if (videoIndex === 3) {
          sessionStateMachine.assertValidTransition(session.type, session.state, 'review');
          await dbRepository.updateSessionState(id, 'review');
          currentState = 'review';
        }

        return reply.status(201).send({
          success: true,
          data: {
            videoIndex,
            totalVideos: videoIndex,
            state: currentState,
          },
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(500).send({
          success: false,
          error: { code: 'UPLOAD_ERROR', message },
        });
      }
    },
  );

  // 8. Flipbook Selection (Cover 1..3 and Video 1..3, or 5-minute auto-default)
  fastify.post<{ Params: { id: string } }>(
    '/api/sessions/:id/flipbook/select',
    async (request, reply) => {
      const { id } = request.params;
      const sessionToken = request.headers['x-session-token'];

      const parseResult = selectFlipbookSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'coverIndex and videoIndex (1..3) required' },
        });
      }

      const { coverIndex, videoIndex } = parseResult.data;

      try {
        const session = await dbRepository.getSessionById(id);
        if (!session) {
          return reply.status(404).send({
            success: false,
            error: { code: 'SESSION_NOT_FOUND', message: 'Session does not exist' },
          });
        }

        if (!isSessionAuthorized(sessionToken, session.token)) {
          return reply.status(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Invalid or missing session authorization token' },
          });
        }

        sessionStateMachine.assertValidTransition(session.type, session.state, 'processing');
        await dbRepository.recordFlipbookSelection(id, coverIndex, videoIndex);

        return reply.send({
          success: true,
          data: {
            sessionId: id,
            coverIndex,
            videoIndex,
            state: 'processing',
          },
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({
          success: false,
          error: { code: 'WORKFLOW_ERROR', message },
        });
      }
    },
  );

  // 9. Process Flipbook GIF (Async rendering with 2-minute watchdog)
  fastify.post<{ Params: { id: string } }>(
    '/api/sessions/:id/flipbook/process',
    async (request, reply) => {
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

        if (!isSessionAuthorized(sessionToken, session.token)) {
          return reply.status(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Invalid or missing session authorization token' },
          });
        }

        const captures = await dbRepository.getFlipbookCaptures(id);
        const selectedCover = captures.covers.find((c) => c.isSelected) || captures.covers[0];
        const selectedVideo = captures.videos.find((v) => v.isSelected) || captures.videos[0];

        if (!selectedCover || !selectedVideo) {
          return reply.status(400).send({
            success: false,
            error: { code: 'MISSING_MEDIA', message: 'Selected cover and video required' },
          });
        }

        let overlayPath: string | null = null;
        if (session.frameId) {
          const frame = await dbRepository.getFrameById(session.frameId);
          if (frame && frame.overlayPath) {
            overlayPath = path.resolve(process.cwd(), frame.overlayPath);
          }
        }

        const publicId = generatePublicId();
        const intermediateDir = storageService.getSessionDir(id, 'intermediate');
        const outputsDir = storageService.getSessionDir(id, 'outputs');
        const outputPath = path.join(outputsDir, `${publicId}.gif`);

        // Render Primary Active GIF Output
        await gifRenderer.renderFlipbookGif(
          selectedCover.filePath,
          selectedVideo.filePath,
          overlayPath,
          outputPath,
          path.join(intermediateDir, 'render'),
          {
            frameCount: flipbookConfig.gifFrameCount,
            coverHoldMs: flipbookConfig.gifCoverHoldMs,
            frameDelayMs: flipbookConfig.gifFrameDelayMs,
            outputWidth: flipbookConfig.gifOutputWidth,
            outputHeight: flipbookConfig.gifOutputHeight,
            timeoutMs: flipbookConfig.gifTimeoutMs,
          },
        );

        // Mirror primary output to global outputs directory
        await storageService.mirrorToGlobalOutputs(outputPath, publicId, 'gif');

        // If comparison testing is enabled, also render both variants for side-by-side testing
        if (flipbookConfig.enableComparisonVariants) {
          const outputPrdPath = path.join(outputsDir, `${publicId}_prd.gif`);
          const outputCustomPath = path.join(outputsDir, `${publicId}_custom.gif`);

          await gifRenderer.renderFlipbookGif(
            selectedCover.filePath,
            selectedVideo.filePath,
            overlayPath,
            outputPrdPath,
            path.join(intermediateDir, 'prd'),
            {
              frameCount: 21,
              coverHoldMs: 3000,
              frameDelayMs: 500,
              timeoutMs: flipbookConfig.gifTimeoutMs,
            },
          );

          await gifRenderer.renderFlipbookGif(
            selectedCover.filePath,
            selectedVideo.filePath,
            overlayPath,
            outputCustomPath,
            path.join(intermediateDir, 'custom'),
            {
              frameCount: 20,
              coverHoldMs: 3000,
              frameDelayMs: 250,
              timeoutMs: flipbookConfig.gifTimeoutMs,
            },
          );

          await storageService.mirrorToGlobalOutputs(outputPrdPath, `${publicId}_prd`, 'gif');
          await storageService.mirrorToGlobalOutputs(outputCustomPath, `${publicId}_custom`, 'gif');
        }

        // Record output and queue for cloud publishing
        const outputId = await dbRepository.saveGeneratedOutput(
          id,
          publicId,
          'image/gif',
          outputPath,
          flipbookConfig.gifOutputWidth,
          flipbookConfig.gifOutputHeight,
        );

        const qrUrl = `https://myphotobooth.com/${publicId}`;

        return reply.send({
          success: true,
          data: {
            outputId,
            publicId,
            qrUrl,
            state: 'booth_confirmed',
            variants: flipbookConfig.enableComparisonVariants
              ? {
                  prd: `/photos/${publicId}?variant=prd`,
                  custom: `/photos/${publicId}?variant=custom`,
                }
              : undefined,
          },
        });
      } catch {
        // Reset to cover_capture on timeout or fatal rendering failure per contract
        try {
          await dbRepository.resetFlipbookToCoverCapture(id);
          const intDir = storageService.getSessionDir(id, 'intermediate');
          if (fs.existsSync(intDir)) {
            fs.rmSync(intDir, { recursive: true, force: true });
          }
        } catch {
          // ignore cleanup errors
        }

        return reply.status(500).send({
          success: false,
          error: {
            code: 'GIF_PROCESSING_FAILED',
            message: 'GIF processing took too long. Please recapture this flipbook.',
          },
        });
      }
    },
  );

  // 10. Timeout Recovery Reset
  fastify.post<{ Params: { id: string } }>(
    '/api/sessions/:id/flipbook/reset-recovery',
    async (request, reply) => {
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

        if (!isSessionAuthorized(sessionToken, session.token)) {
          return reply.status(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Invalid or missing session authorization token' },
          });
        }

        await dbRepository.resetFlipbookToCoverCapture(id);
        const intDir = storageService.getSessionDir(id, 'intermediate');
        if (fs.existsSync(intDir)) {
          fs.rmSync(intDir, { recursive: true, force: true });
        }
        return reply.send({
          success: true,
          message: 'GIF processing took too long. Please recapture this flipbook.',
          data: { state: 'cover_capture' },
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(500).send({
          success: false,
          error: { code: 'RESET_FAILED', message },
        });
      }
    },
  );

  // 10b. Confirm Photo Strip Output (generates 300 DPI 4R PNG, public ID, QR, and queues publication)
  fastify.post<{ Params: { id: string } }>(
    '/api/sessions/:id/photo-strip/confirm',
    async (request, reply) => {
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

        if (!isSessionAuthorized(sessionToken, session.token)) {
          return reply.status(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Invalid or missing session authorization token' },
          });
        }

        if (session.type !== 'photo_strip') {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'INVALID_SESSION_TYPE',
              message: 'Session is not a photo strip session',
            },
          });
        }

        if (session.state !== 'review' && session.state !== 'capturing') {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'INVALID_STATE',
              message: 'This step is not available yet. Continue the current workflow.',
            },
          });
        }

        const templateSnapshot = session.templateSnapshot as Record<string, unknown> | null;
        if (!templateSnapshot) {
          return reply.status(400).send({
            success: false,
            error: { code: 'NO_TEMPLATE', message: 'No template selected for this session' },
          });
        }

        const captures = await dbRepository.getPhotoCaptures(id);
        const requiredCount =
          typeof templateSnapshot.requiredCaptureCount === 'number'
            ? templateSnapshot.requiredCaptureCount
            : 3;

        if (captures.length < requiredCount) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'INCOMPLETE_CAPTURES',
              message: `Photo strip requires ${requiredCount} photos (received ${captures.length}).`,
            },
          });
        }

        // Generate 7-character base-62 public ID
        const publicId = generatePublicId();
        const qrUrl = `https://myphotobooth.com/${publicId}`;

        const width = (templateSnapshot.outputWidth as number) || 1200;
        const height = (templateSnapshot.outputHeight as number) || 1800;
        const placements = (templateSnapshot.placements as unknown as TemplatePlacement[]) || [];
        const overlays = (templateSnapshot.overlays as unknown as TemplateOverlay[]) || [];
        const bgPath = templateSnapshot.backgroundPath as string | undefined;

        // Render 300 DPI 4R PNG buffer
        const pngBuffer = await photoStripRenderer.renderStrip({
          width,
          height,
          backgroundPath: bgPath,
          placements,
          overlays,
          captures: captures.map((c) => ({ captureIndex: c.captureIndex, filePath: c.filePath })),
          publicId,
          qrUrl,
        });

        // Save output to session directory
        const outDir = storageService.getSessionDir(id, 'outputs');
        const outputPath = path.join(outDir, `${publicId}.png`);
        fs.writeFileSync(outputPath, pngBuffer);

        // Mirror output to global outputs directory for fast local retrieval
        await storageService.mirrorToGlobalOutputs(outputPath, publicId, 'png');

        // Record output and queue for cloud publishing
        const outputId = await dbRepository.saveGeneratedOutput(
          id,
          publicId,
          'image/png',
          outputPath,
          width,
          height,
        );

        return reply.send({
          success: true,
          data: {
            outputId,
            publicId,
            qrUrl,
            state: 'booth_confirmed',
          },
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(500).send({
          success: false,
          error: {
            code: 'COMPOSITION_FAILED',
            message: `Could not generate the photo strip. Your original photos are safe. (${message})`,
          },
        });
      }
    },
  );

  // 10c. Print Recording (Firefox/CUPS handoff)
  fastify.post<{ Params: { id: string } }>('/api/sessions/:id/print', async (request, reply) => {
    const { id } = request.params;
    const sessionToken = request.headers['x-session-token'];

    const parseResult = printSessionSchema.safeParse(request.body || {});
    const copies = parseResult.success ? parseResult.data.copies : 1;

    try {
      const session = await dbRepository.getSessionById(id);
      if (!session) {
        return reply.status(404).send({
          success: false,
          error: { code: 'SESSION_NOT_FOUND', message: 'Session does not exist' },
        });
      }

      if (!isSessionAuthorized(sessionToken, session.token)) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Invalid or missing session authorization token' },
        });
      }

      if (session.state !== 'booth_confirmed' && session.state !== 'printed') {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'INVALID_STATE',
            message: 'Printing is only allowed after booth confirmation.',
          },
        });
      }

      sessionStateMachine.assertValidTransition(session.type, session.state, 'printed');

      const updated = await dbRepository.recordPrintStatus(id, copies);

      return reply.send({
        success: true,
        data: stripToken(updated),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({
        success: false,
        error: { code: 'PRINT_RECORD_ERROR', message },
      });
    }
  });

  // 11. Cancel active session
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

      if (!isSessionAuthorized(sessionToken, session.token)) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Invalid or missing session authorization token' },
        });
      }

      const cancelled = await dbRepository.cancelSession(id);
      if (!cancelled) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'INVALID_STATE',
            message: 'Session cannot be cancelled in its current state',
          },
        });
      }

      const { token: _token, ...safeCancelled } = cancelled;
      return reply.send({
        success: true,
        data: safeCancelled,
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
