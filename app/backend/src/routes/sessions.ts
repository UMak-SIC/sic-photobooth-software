import fs from 'node:fs';
import path from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { generatePublicId } from '@photobooth/public-output';
import { dbRepository } from '../db/repository.js';
import { sessionStateMachine, type SessionState } from '../services/session-state-machine.js';
import { storageService } from '../services/storage.js';
import { mediaValidator } from '../services/media-validator.js';
import { gifRenderer } from '../services/gif-renderer.js';
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

const selectFlipbookSchema = z.object({
  coverIndex: z.number().int().min(1).max(3),
  videoIndex: z.number().int().min(1).max(3),
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

        const rawIndexStr = getFieldValue(data.fields?.captureIndex);
        const rawIndex = rawIndexStr ? parseInt(rawIndexStr, 10) : 1;
        const captureIndex = Number.isInteger(rawIndex) && rawIndex >= 1 ? rawIndex : 1;

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
        if (session.state === 'capturing' && result.captureCount >= 3) {
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
          minDurationSeconds: 5.0,
          maxDurationSeconds: 7.0,
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

        // Execute GIF Rendering
        await gifRenderer.renderFlipbookGif(
          selectedCover.filePath,
          selectedVideo.filePath,
          overlayPath,
          outputPath,
          intermediateDir,
          {
            frameCount: 21,
            coverHoldMs: 3000,
            frameDelayMs: 500,
            timeoutMs: 120000,
          },
        );

        // Mirror output to global outputs directory for fast retrieval
        await storageService.mirrorToGlobalOutputs(outputPath, publicId, 'gif');

        // Record output and queue for cloud publishing
        const outputId = await dbRepository.saveGeneratedOutput(
          id,
          publicId,
          'image/gif',
          outputPath,
          600,
          400,
        );

        const qrUrl = `https://myphotobooth.com/${publicId}`;

        return reply.send({
          success: true,
          data: {
            outputId,
            publicId,
            qrUrl,
            state: 'booth_confirmed',
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
