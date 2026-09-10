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
import { config, flipbookConfig } from '../config.js';
import { photoStripRenderer } from '../services/photo-strip-renderer.js';
import { printerService } from '../services/printer.js';
import type { SessionType } from '@photobooth/public-output';
import { templateRepository } from '../templates/repository.js';
import { toTemplateDto } from '../templates/routes.js';

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
  recordOnly: z.boolean().optional(),
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

export async function resolveFlipbookTemplate(frameId?: string | null) {
  if (!frameId) return null;

  // 1. Try templateRepository by UUID
  const template = await templateRepository.get(frameId);
  if (template) return template;

  // 2. Search templateRepository by slug, name, or id
  const allTemplates = await templateRepository.list('flipbook');
  const cleanId = frameId.toLowerCase().replace(/[^a-z0-9]/g, '');
  const matchedTemplate = allTemplates.find((t) => {
    if (t.id === frameId) return true;
    if (t.name.toLowerCase() === frameId.toLowerCase()) return true;
    const cleanName = t.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return cleanName === cleanId || cleanName.includes(cleanId) || cleanId.includes(cleanName);
  });
  if (matchedTemplate) return matchedTemplate;

  // 3. Search dbRepository frames by UUID, index, or name
  const frame = await dbRepository.getFrameById(frameId);
  if (frame) {
    return {
      id: frame.id,
      name: frame.name,
      type: 'flipbook' as const,
      orientation: 'portrait' as const,
      width: 1200 as const,
      height: 1800 as const,
      active: frame.isActive ?? true,
      requiredCaptureCount: 1,
      backgroundPath: frame.overlayPath ?? null,
      coverPath: null,
      sortOrder: null,
      background: { x: 0, y: 0, width: 1200, height: 1800 },
      placements: frame.placements && frame.placements.length > 0 ? frame.placements : [
        { captureIndex: 1, x: 290, y: 150, width: 620, height: 348.75, rotation: 0, borderRadius: 0, zIndex: 1 },
        { captureIndex: 2, x: 290, y: 540, width: 620, height: 348.75, rotation: 0, borderRadius: 0, zIndex: 2 },
        { captureIndex: 3, x: 290, y: 930, width: 620, height: 348.75, rotation: 0, borderRadius: 0, zIndex: 3 },
        { captureIndex: 4, x: 290, y: 1320, width: 620, height: 348.75, rotation: 0, borderRadius: 0, zIndex: 4 },
      ],
      overlays: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // 4. Fallback for standard named default frames
  const DEFAULT_MAP: Record<string, string> = {
    'gensic-arcade': 'GenSIC Arcade',
    'umak-sic-classic': 'UMak SIC Classic',
    'herons-welcome': 'Herons Welcome',
    'pioneers-neon': 'Pioneers Neon',
    'cyber-green': 'Cyber Green',
    'retro-wave': 'Retro Wave',
  };
  const standardName = DEFAULT_MAP[frameId] || DEFAULT_MAP[cleanId];
  if (standardName) {
    return {
      id: frameId,
      name: standardName,
      type: 'flipbook' as const,
      orientation: 'portrait' as const,
      width: 1200 as const,
      height: 1800 as const,
      active: true,
      requiredCaptureCount: 1,
      backgroundPath: null,
      coverPath: null,
      sortOrder: null,
      background: { x: 0, y: 0, width: 1200, height: 1800 },
      placements: [
        { captureIndex: 1, x: 290, y: 150, width: 620, height: 348.75, rotation: 0, borderRadius: 0, zIndex: 1 },
        { captureIndex: 2, x: 290, y: 540, width: 620, height: 348.75, rotation: 0, borderRadius: 0, zIndex: 2 },
        { captureIndex: 3, x: 290, y: 930, width: 620, height: 348.75, rotation: 0, borderRadius: 0, zIndex: 3 },
        { captureIndex: 4, x: 290, y: 1320, width: 620, height: 348.75, rotation: 0, borderRadius: 0, zIndex: 4 },
      ],
      overlays: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  return null;
}

export const sessionRoutes: FastifyPluginAsync = async (fastify) => {
  // 0. List active frames for Flipbook
  fastify.get('/api/frames', async (_request, reply) => {
    try {
      const templates = await templateRepository.list('flipbook');
      if (templates.length > 0) {
        const activeTemplates = templates.filter((t) => t.active);
        const listToReturn = activeTemplates.length > 0 ? activeTemplates : templates;
        return reply.send({
          success: true,
          data: listToReturn.map((t) => ({
            id: t.id,
            name: t.name,
            type: t.type,
            coverPath: t.coverPath ? `/templates/${t.id}/cover` : null,
            backgroundPath: t.backgroundPath ? `/templates/${t.id}/background` : null,
            overlayPath: t.backgroundPath ? `/templates/${t.id}/background` : null,
            isActive: t.active,
            placements: t.placements,
            overlays: t.overlays,
          })),
        });
      }

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

  // 0b. List active templates for Photo Strip (unifies with canonical templateRepository)
  fastify.get('/api/templates', async (_request, reply) => {
    try {
      const all = await templateRepository.list('photo_strip');
      return reply.send({
        success: true,
        data: all.filter((t) => t.active).map(toTemplateDto),
      });
    } catch {
      const fallback = await dbRepository.listActiveTemplates();
      return reply.send({
        success: true,
        data: fallback,
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
          state: session.state,
          type: session.type,
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

  // 3. Update Session State (Generic Transition)
  fastify.post<{ Params: { id: string }; Body: { targetState: string } }>(
    '/api/sessions/:id/transition',
    async (request, reply) => {
      const { id } = request.params;
      const sessionToken = request.headers['x-session-token'];
      const { targetState } = request.body || {};

      if (!targetState) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'targetState is required' },
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

        sessionStateMachine.assertValidTransition(
          session.type,
          session.state,
          targetState as SessionState,
        );
        const updated = await dbRepository.updateSessionState(
          id,
          targetState as SessionState,
        );

        return reply.send({
          success: true,
          data: stripToken(updated),
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_STATE_TRANSITION', message },
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

      const resolved = await resolveFlipbookTemplate(parseResult.data.frameId);
      if (!resolved) {
        return reply.status(404).send({
          success: false,
          error: { code: 'FRAME_NOT_FOUND', message: 'Selected frame does not exist' },
        });
      }

      const updated = await dbRepository.setSessionFrame(id, resolved.id, resolved);

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
          const defaultTemplate = (await templateRepository.list('flipbook')).find((t) => t.active);
          if (defaultTemplate) {
            await dbRepository.setSessionFrame(id, defaultTemplate.id, defaultTemplate);
          } else {
            const defaultFrame = await dbRepository.getFrameById('default');
            if (defaultFrame) {
              await dbRepository.setSessionFrame(id, defaultFrame.id, defaultFrame);
            } else {
              await dbRepository.updateSessionState(id, 'frame_selected');
            }
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

        const query = request.query as { captureIndex?: string; isRetake?: string } | undefined;
        const snapshot = session.templateSnapshot as Record<string, unknown> | null;
        const targetCount =
          typeof snapshot?.requiredCaptureCount === 'number'
            ? (snapshot.requiredCaptureCount as number)
            : 3;

        const queryIndex = query?.captureIndex;
        const fieldIndex = getFieldValue(data.fields?.captureIndex);
        const filenameIndex = data.filename?.match(/photo_(\d+)/)?.[1];
        const rawIndexStr = queryIndex || fieldIndex || filenameIndex;
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

        const existingCaptures = await dbRepository.getPhotoCaptures(id);
        const slotAlreadyCaptured = existingCaptures.some((c) => c.captureIndex === captureIndex);
        const isRetake =
          query?.isRetake === 'true' ||
          (data.fields?.isRetake && getFieldValue(data.fields.isRetake) === 'true') ||
          slotAlreadyCaptured ||
          (session.state === 'review' && slotAlreadyCaptured);

        if (isRetake && session.retakeCount >= 4) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'LIMIT_EXCEEDED',
              message: 'Maximum retake limit of 4 reached for this session',
            },
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
        if (result.captureCount >= targetCount && session.state !== 'review') {
          if (sessionStateMachine.isValidTransition(session.type, session.state, 'review')) {
            await dbRepository.updateSessionState(id, 'review');
            currentState = 'review';
          }
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

        if (session.state === 'frame_selected' || session.state === 'instructions') {
          sessionStateMachine.assertValidTransition(session.type, session.state, 'cover_capture');
          await dbRepository.updateSessionState(id, 'cover_capture');
          session.state = 'cover_capture';
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

        let coverOverlayPath: string | null = null;
        let motionOverlayPath: string | null = null;
        let templatePlacements: Array<{ x: number; y: number; width: number; height: number }> | undefined = undefined;
        const targetFrameId = session.frameId || session.templateId;
        if (targetFrameId) {
          const resolvedTemplate = await resolveFlipbookTemplate(targetFrameId);
          if (resolvedTemplate) {
            if (resolvedTemplate.coverPath) {
              coverOverlayPath = resolvedTemplate.coverPath.startsWith('/')
                ? path.resolve(process.cwd(), resolvedTemplate.coverPath.replace(/^\//, ''))
                : path.resolve(config.storageDir, resolvedTemplate.coverPath);
            }
            if (resolvedTemplate.backgroundPath) {
              motionOverlayPath = resolvedTemplate.backgroundPath.startsWith('/')
                ? path.resolve(process.cwd(), resolvedTemplate.backgroundPath.replace(/^\//, ''))
                : path.resolve(config.storageDir, resolvedTemplate.backgroundPath);
            }
            if (resolvedTemplate.placements && resolvedTemplate.placements.length > 0) {
              templatePlacements = resolvedTemplate.placements;
            }
          }
        }

        if (!templatePlacements || templatePlacements.length === 0) {
          templatePlacements = [
            { x: 290, y: 150, width: 620, height: 348.75 },
            { x: 290, y: 540, width: 620, height: 348.75 },
            { x: 290, y: 930, width: 620, height: 348.75 },
            { x: 290, y: 1320, width: 620, height: 348.75 },
          ];
        }

        const publicId = generatePublicId();
        const intermediateDir = storageService.getSessionDir(id, 'intermediate');
        const outputsDir = storageService.getSessionDir(id, 'outputs');
        const outputPath = path.join(outputsDir, `${publicId}.gif`);
        const outputMotionPath = path.join(outputsDir, `${publicId}_motion.gif`);

        let dynamicOutputWidth = flipbookConfig.gifOutputWidth;
        let dynamicOutputHeight = flipbookConfig.gifOutputHeight;

        if (templatePlacements && templatePlacements.length > 0) {
          const p = templatePlacements[0];
          let w = Math.round(p.width || 620);
          let h = Math.round(p.height || 349);
          const maxDim = 800;
          if (w > maxDim || h > maxDim) {
            const ratio = w / h;
            if (w >= h) {
              w = maxDim;
              h = Math.round(maxDim / ratio);
            } else {
              h = maxDim;
              w = Math.round(maxDim * ratio);
            }
          }
          dynamicOutputWidth = w;
          dynamicOutputHeight = h;
        }

        // Render Primary Active Downloadable GIF Output (with 3-second cover photo hold)
        await gifRenderer.renderFlipbookGif(
          selectedCover.filePath,
          selectedVideo.filePath,
          null,
          outputPath,
          path.join(intermediateDir, 'render'),
          {
            frameCount: flipbookConfig.gifFrameCount,
            coverHoldMs: flipbookConfig.gifCoverHoldMs,
            frameDelayMs: flipbookConfig.gifFrameDelayMs,
            outputWidth: dynamicOutputWidth,
            outputHeight: dynamicOutputHeight,
            timeoutMs: flipbookConfig.gifTimeoutMs,
            placements: templatePlacements,
          },
        );

        // Render Pure Motion GIF for Booth Preview (0s cover hold)
        await gifRenderer.renderFlipbookGif(
          selectedCover.filePath,
          selectedVideo.filePath,
          null,
          outputMotionPath,
          path.join(intermediateDir, 'render_motion'),
          {
            frameCount: flipbookConfig.gifFrameCount,
            coverHoldMs: 0,
            frameDelayMs: flipbookConfig.gifFrameDelayMs,
            outputWidth: dynamicOutputWidth,
            outputHeight: dynamicOutputHeight,
            timeoutMs: flipbookConfig.gifTimeoutMs,
            placements: templatePlacements,
          },
        );

        // Mirror outputs to global outputs directory
        await storageService.mirrorToGlobalOutputs(outputPath, publicId, 'gif');
        await storageService.mirrorToGlobalOutputs(outputMotionPath, `${publicId}_motion`, 'gif');

        // If comparison testing is enabled, also render both variants for side-by-side testing
        if (flipbookConfig.enableComparisonVariants) {
          const outputPrdPath = path.join(outputsDir, `${publicId}_prd.gif`);
          const outputCustomPath = path.join(outputsDir, `${publicId}_custom.gif`);

          await gifRenderer.renderFlipbookGif(
            selectedCover.filePath,
            selectedVideo.filePath,
            null,
            outputPrdPath,
            path.join(intermediateDir, 'prd'),
            {
              frameCount: 21,
              coverHoldMs: 3000,
              frameDelayMs: 500,
              timeoutMs: flipbookConfig.gifTimeoutMs,
              coverOverlayPath,
              motionOverlayPath,
            },
          );

          await gifRenderer.renderFlipbookGif(
            selectedCover.filePath,
            selectedVideo.filePath,
            null,
            outputCustomPath,
            path.join(intermediateDir, 'custom'),
            {
              frameCount: 20,
              coverHoldMs: 3000,
              frameDelayMs: 250,
              timeoutMs: flipbookConfig.gifTimeoutMs,
              coverOverlayPath,
              motionOverlayPath,
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

  // 10a. Upload and Store 4R 300 DPI PDF for a Session
  fastify.post<{ Params: { id: string } }>('/api/sessions/:id/pdf', async (request, reply) => {
    const { id } = request.params;
    const session = await dbRepository.getSessionById(id);
    if (!session) {
      return reply.status(404).send({
        success: false,
        error: { code: 'SESSION_NOT_FOUND', message: 'Session does not exist' },
      });
    }

    const latestOutput = await dbRepository.getLatestOutputForSession(id);
    if (!latestOutput) {
      return reply.status(400).send({
        success: false,
        error: { code: 'OUTPUT_NOT_FOUND', message: 'Output record not yet created' },
      });
    }

    const file = await request.file();
    if (!file) {
      return reply.status(400).send({
        success: false,
        error: { code: 'NO_FILE', message: 'No PDF file uploaded' },
      });
    }

    const buffer = await file.toBuffer();
    await storageService.savePdf(id, latestOutput.publicId, buffer);

    return reply.send({
      success: true,
      data: {
        publicId: latestOutput.publicId,
        saved: true,
      },
    });
  });

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

        if (session.state === 'booth_confirmed') {
          const latestOutput = await dbRepository.getLatestOutputForSession(id);
          if (latestOutput) {
            return reply.send({
              success: true,
              data: {
                outputId: latestOutput.id,
                publicId: latestOutput.publicId,
                qrUrl: `https://myphotobooth.com/${latestOutput.publicId}`,
                state: 'booth_confirmed',
              },
            });
          }
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

        // Resolve event information for date pill
        const event = session.eventId ? await dbRepository.getEventById(session.eventId) : null;
        const eventDate = event?.date || new Date().toISOString().split('T')[0];
        const eventName = event?.name || 'Photobooth Event';

        // Render 300 DPI 4R PNG buffer with embedded QR & Date Pill
        const pngBuffer = await photoStripRenderer.renderStrip({
          width,
          height,
          backgroundPath: bgPath,
          placements,
          overlays,
          captures: captures.map((c) => ({ captureIndex: c.captureIndex, filePath: c.filePath })),
          publicId,
          qrUrl,
          eventDate,
          eventName,
          templateName: (templateSnapshot.name as string) || undefined,
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
  // 10c. Print Recording (Direct CUPS printing / manual record)
  fastify.post<{ Params: { id: string } }>('/api/sessions/:id/print', async (request, reply) => {
    const { id } = request.params;
    const sessionToken = request.headers['x-session-token'];

    const parseResult = printSessionSchema.safeParse(request.body || {});
    const copies = parseResult.success ? parseResult.data.copies : 1;
    const recordOnly = parseResult.success ? !!parseResult.data.recordOnly : false;

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

      let printJobId: string | undefined;

      if (!recordOnly && session.type !== 'flipbook') {
        const output = await dbRepository.getLatestOutputForSession(id);
        if (output && output.filePath) {
          const printResult = await printerService.printImage(output.filePath, copies);
          if (!printResult.success) {
            return reply.status(502).send({
              success: false,
              error: {
                code: 'PRINT_FAILED',
                message:
                  'Physical printing could not be completed by printer service. Please record copies manually.',
                details: printResult.error,
              },
            });
          }
          printJobId = printResult.jobId;
        }
      }

      const updated = await dbRepository.recordPrintStatus(id, copies);

      return reply.send({
        success: true,
        data: {
          ...stripToken(updated),
          jobId: printJobId,
        },
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
