import crypto from 'node:crypto';
import { pool } from './pool.js';
import type { SessionData, SessionState } from '../services/session-state-machine.js';
import type { SessionType } from '@photobooth/public-output';

export interface EventData {
  id: string;
  name: string;
  date: string;
  operatorName: string;
  createdAt: Date;
}

export interface FrameItem {
  id: string;
  name: string;
  overlayPath: string;
  isActive: boolean;
}

export interface TemplatePlacement {
  captureIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  borderRadius?: number;
  zIndex?: number;
}

export interface TemplateOverlay {
  id?: string;
  label: string;
  assetPath?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  zIndex?: number;
}

export interface TemplateItem {
  id: string;
  name: string;
  orientation: 'landscape' | 'portrait';
  outputWidth: number;
  outputHeight: number;
  backgroundPath: string;
  isActive: boolean;
  requiredCaptureCount: number;
  countdownSeconds: 3 | 5 | 10;
  placements: TemplatePlacement[];
  overlays?: TemplateOverlay[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CaptureItem {
  id: string;
  sessionId: string;
  captureIndex: number;
  filePath: string;
  isCover: boolean;
  isSelected: boolean;
  createdAt: Date;
}

export interface VideoItem {
  id: string;
  sessionId: string;
  videoIndex: number;
  filePath: string;
  durationSeconds: number;
  isSelected: boolean;
  createdAt: Date;
}

export interface OutputItem {
  id: string;
  sessionId: string;
  publicId: string;
  mediaType: string;
  filePath: string;
  width: number;
  height: number;
  createdAt: Date;
  eventName: string;
  eventDate: string;
}

export type PublicationStatus = 'queued' | 'in_progress' | 'uploaded' | 'failed';

export interface QueuedPublication {
  id: string;
  publicId: string;
  filePath: string;
  mediaType: string;
  eventName: string;
  eventDate: string;
  retryCount: number;
}

export interface PublicationRecord {
  id: string;
  publicId: string;
  status: PublicationStatus;
  retryCount: number;
  lastAttemptAt: Date | null;
  nextAttemptAt: Date | null;
  lastError: string | null;
  cloudFinalizedAt: Date | null;
  cloudinaryUrl: string | null;
  cloudinaryPublicId: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  mediaType: string;
  eventName: string;
  eventDate: string;
}

export class DatabaseRepository {
  public async listEvents(): Promise<EventData[]> {
    try {
      const result = await pool.query(`
        SELECT id, name, date::text, operator_name AS "operatorName", created_at AS "createdAt"
        FROM events
        ORDER BY date DESC, name ASC
      `);
      return result.rows;
    } catch {
      return Array.from(this.inMemoryEvents.values()).sort(
        (a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name),
      );
    }
  }

  public async createEvent(name: string, date: string, operatorName: string): Promise<EventData> {
    try {
      const result = await pool.query(
        `
          INSERT INTO events (name, date, operator_name)
          VALUES ($1, $2, $3)
          RETURNING id, name, date::text, operator_name AS "operatorName", created_at AS "createdAt"
        `,
        [name, date, operatorName],
      );
      return result.rows[0];
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        throw error;
      }
      const key = `${name}_${date}`;
      if (this.inMemoryEvents.has(key)) {
        const duplicate = new Error('Event already exists');
        Object.assign(duplicate, { code: '23505' });
        throw duplicate;
      }
      const event: EventData = {
        id: crypto.randomUUID(),
        name,
        date,
        operatorName,
        createdAt: new Date(),
      };
      this.inMemoryEvents.set(key, event);
      return event;
    }
  }

  // In-memory fallback stores when PostgreSQL is offline
  private inMemoryEvents: Map<string, EventData> = new Map();
  private inMemorySessions: Map<string, SessionData> = new Map();
  private inMemoryFrames: Map<string, FrameItem> = new Map([
    ['1', { id: '1', name: 'SIC Seal', overlayPath: 'frames/sic-seal.png', isActive: true }],
    [
      '2',
      { id: '2', name: 'Emerald Motion', overlayPath: 'frames/emerald-motion.png', isActive: true },
    ],
    [
      '3',
      { id: '3', name: 'Pioneer Grid', overlayPath: 'frames/pioneer-grid.png', isActive: true },
    ],
  ]);
  private inMemoryTemplates: Map<string, TemplateItem> = new Map([
    [
      'classic-portrait',
      {
        id: 'classic-portrait',
        name: 'Classic Portrait Strip',
        orientation: 'portrait',
        outputWidth: 1200,
        outputHeight: 1800,
        backgroundPath: 'templates/classic-portrait.png',
        isActive: true,
        requiredCaptureCount: 3,
        countdownSeconds: 5,
        placements: [
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
        overlays: [],
      },
    ],
    [
      'grid-landscape',
      {
        id: 'grid-landscape',
        name: 'Grid 2x2 Landscape',
        orientation: 'landscape',
        outputWidth: 1800,
        outputHeight: 1200,
        backgroundPath: 'templates/grid-landscape.png',
        isActive: true,
        requiredCaptureCount: 4,
        countdownSeconds: 5,
        placements: [
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
        overlays: [],
      },
    ],
  ]);
  private inMemoryCaptures: Map<string, CaptureItem[]> = new Map();
  private inMemoryVideos: Map<string, VideoItem[]> = new Map();
  private inMemoryOutputs: Map<string, OutputItem> = new Map();
  private inMemoryPublications: Map<string, PublicationRecord> = new Map();

  /**
   * Creates or returns an existing event by name and date.
   */
  public async getOrCreateEvent(
    name: string,
    date: string,
    operatorName: string,
  ): Promise<EventData> {
    try {
      const query = `
        INSERT INTO events (name, date, operator_name)
        VALUES ($1, $2, $3)
        ON CONFLICT (name, date) DO UPDATE
          SET operator_name = EXCLUDED.operator_name
        RETURNING id, name, date::text, operator_name AS "operatorName", created_at AS "createdAt"
      `;
      const res = await pool.query(query, [name, date, operatorName]);
      return res.rows[0];
    } catch {
      // In-memory fallback
      const key = `${name}_${date}`;
      const existing = this.inMemoryEvents.get(key);
      if (existing) {
        existing.operatorName = operatorName;
        return existing;
      }
      const newEvent: EventData = {
        id: crypto.randomUUID(),
        name,
        date,
        operatorName,
        createdAt: new Date(),
      };
      this.inMemoryEvents.set(key, newEvent);
      return newEvent;
    }
  }

  /**
   * Creates a new session.
   */
  public async createSession(
    eventId: string,
    type: SessionType,
    token: string,
  ): Promise<SessionData> {
    const initialState: SessionState = 'created';
    try {
      const query = `
        INSERT INTO sessions (event_id, type, state, token)
        VALUES ($1, $2, $3, $4)
        RETURNING
          id,
          token,
          event_id AS "eventId",
          type,
          state,
          template_id AS "templateId",
          frame_id AS "frameId",
          template_snapshot AS "templateSnapshot",
          retake_count AS "retakeCount",
          is_printed AS "isPrinted",
          copies_printed AS "copiesPrinted",
          created_at AS "createdAt",
          last_activity_at AS "lastActivityAt",
          cancelled_at AS "cancelledAt"
      `;
      const res = await pool.query(query, [eventId, type, initialState, token]);
      return res.rows[0];
    } catch {
      // In-memory fallback
      const sessionId = crypto.randomUUID();
      const session: SessionData = {
        id: sessionId,
        token,
        eventId,
        type,
        state: initialState,
        templateId: null,
        frameId: null,
        templateSnapshot: null,
        retakeCount: 0,
        isPrinted: false,
        copiesPrinted: 0,
        createdAt: new Date(),
        lastActivityAt: new Date(),
      };
      this.inMemorySessions.set(sessionId, session);
      return session;
    }
  }

  /**
   * Retrieves session by ID.
   */
  public async getSessionById(sessionId: string): Promise<SessionData | null> {
    try {
      const query = `
        SELECT
          id,
          token,
          event_id AS "eventId",
          type,
          state,
          template_id AS "templateId",
          frame_id AS "frameId",
          template_snapshot AS "templateSnapshot",
          retake_count AS "retakeCount",
          is_printed AS "isPrinted",
          copies_printed AS "copiesPrinted",
          created_at AS "createdAt",
          last_activity_at AS "lastActivityAt",
          cancelled_at AS "cancelledAt"
        FROM sessions
        WHERE id = $1
      `;
      const res = await pool.query(query, [sessionId]);
      return res.rows[0] || null;
    } catch {
      return this.inMemorySessions.get(sessionId) || null;
    }
  }

  /**
   * Updates session state and last activity timestamp.
   */
  public async updateSessionState(
    sessionId: string,
    state: SessionState,
  ): Promise<SessionData | null> {
    try {
      const query = `
        UPDATE sessions
        SET state = $2, last_activity_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING
          id,
          token,
          event_id AS "eventId",
          type,
          state,
          template_id AS "templateId",
          frame_id AS "frameId",
          template_snapshot AS "templateSnapshot",
          retake_count AS "retakeCount",
          is_printed AS "isPrinted",
          copies_printed AS "copiesPrinted",
          created_at AS "createdAt",
          last_activity_at AS "lastActivityAt",
          cancelled_at AS "cancelledAt"
      `;
      const res = await pool.query(query, [sessionId, state]);
      return res.rows[0] || null;
    } catch {
      const session = this.inMemorySessions.get(sessionId);
      if (!session) return null;
      session.state = state;
      session.lastActivityAt = new Date();
      return session;
    }
  }

  /**
   * Cancels an active session.
   */
  public async cancelSession(sessionId: string): Promise<SessionData | null> {
    try {
      const query = `
        UPDATE sessions
        SET state = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, last_activity_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND state != 'booth_confirmed' AND state != 'printed' AND state != 'cancelled'
        RETURNING
          id,
          token,
          event_id AS "eventId",
          type,
          state,
          template_id AS "templateId",
          frame_id AS "frameId",
          template_snapshot AS "templateSnapshot",
          retake_count AS "retakeCount",
          is_printed AS "isPrinted",
          copies_printed AS "copiesPrinted",
          created_at AS "createdAt",
          last_activity_at AS "lastActivityAt",
          cancelled_at AS "cancelledAt"
      `;
      const res = await pool.query(query, [sessionId]);
      return res.rows[0] || null;
    } catch {
      const session = this.inMemorySessions.get(sessionId);
      if (
        !session ||
        session.state === 'booth_confirmed' ||
        session.state === 'printed' ||
        session.state === 'cancelled'
      ) {
        return null;
      }
      session.state = 'cancelled';
      session.cancelledAt = new Date();
      session.lastActivityAt = new Date();
      return session;
    }
  }

  /**
   * Lists all active frames for Flipbook sessions.
   */
  public async listActiveFrames(): Promise<FrameItem[]> {
    try {
      const query = `
        SELECT id, name, overlay_path AS "overlayPath", is_active AS "isActive"
        FROM frames
        WHERE is_active = true
        ORDER BY created_at ASC
      `;
      const res = await pool.query(query);
      if (res.rows && res.rows.length > 0) {
        return res.rows;
      }
      return Array.from(this.inMemoryFrames.values()).filter((f) => f.isActive);
    } catch {
      return Array.from(this.inMemoryFrames.values()).filter((f) => f.isActive);
    }
  }

  /**
   * Retrieves a frame by ID.
   */
  public async getFrameById(frameId: string): Promise<FrameItem | null> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(frameId);
    if (isUuid) {
      try {
        const query = `
          SELECT id, name, overlay_path AS "overlayPath", is_active AS "isActive"
          FROM frames
          WHERE id = $1
        `;
        const res = await pool.query(query, [frameId]);
        if (res.rows[0]) return res.rows[0];
      } catch {
        // ignore database errors in in-memory fallback
      }
    } else {
      try {
        const query = `
          SELECT id, name, overlay_path AS "overlayPath", is_active AS "isActive"
          FROM frames
          WHERE name ILIKE $1 OR overlay_path ILIKE $1
          LIMIT 1
        `;
        const res = await pool.query(query, [`%${frameId}%`]);
        if (res.rows[0]) return res.rows[0];
      } catch {
        // ignore database errors
      }
    }

    // Try finding the first active frame from DB as fallback
    try {
      const fallbackQuery = `
        SELECT id, name, overlay_path AS "overlayPath", is_active AS "isActive"
        FROM frames
        WHERE is_active = true
        ORDER BY created_at ASC
        LIMIT 1
      `;
      const fbRes = await pool.query(fallbackQuery);
      if (fbRes.rows[0]) return fbRes.rows[0];
    } catch {
      // ignore
    }

    if (this.inMemoryFrames.has(frameId)) {
      return this.inMemoryFrames.get(frameId) || null;
    }

    // Check by index or name fallback if frameId is '1', '2', '3'
    const allFrames = Array.from(this.inMemoryFrames.values());
    const idx = parseInt(frameId, 10) - 1;
    if (idx >= 0 && idx < allFrames.length) {
      return allFrames[idx];
    }

    if (allFrames.length > 0) {
      return allFrames[0];
    }

    return null;
  }

  /**
   * Creates or updates a frame definition.
   */
  public async createFrame(name: string, overlayPath: string): Promise<FrameItem> {
    try {
      const query = `
        INSERT INTO frames (name, overlay_path)
        VALUES ($1, $2)
        RETURNING id, name, overlay_path AS "overlayPath", is_active AS "isActive"
      `;
      const res = await pool.query(query, [name, overlayPath]);
      return res.rows[0];
    } catch {
      const id = crypto.randomUUID();
      const frame: FrameItem = { id, name, overlayPath, isActive: true };
      this.inMemoryFrames.set(id, frame);
      return frame;
    }
  }

  /**
   * Associates a frame with an active session and sets state to frame_selected.
   */
  public async setSessionFrame(sessionId: string, frameId: string): Promise<SessionData | null> {
    try {
      const query = `
        UPDATE sessions
        SET frame_id = $2, state = 'frame_selected', last_activity_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING
          id,
          token,
          event_id AS "eventId",
          type,
          state,
          template_id AS "templateId",
          frame_id AS "frameId",
          template_snapshot AS "templateSnapshot",
          retake_count AS "retakeCount",
          is_printed AS "isPrinted",
          copies_printed AS "copiesPrinted",
          created_at AS "createdAt",
          last_activity_at AS "lastActivityAt",
          cancelled_at AS "cancelledAt"
      `;
      const res = await pool.query(query, [sessionId, frameId]);
      return res.rows[0] || null;
    } catch {
      const session = this.inMemorySessions.get(sessionId);
      if (!session) return null;
      session.frameId = frameId;
      session.state = 'frame_selected';
      session.lastActivityAt = new Date();
      return session;
    }
  }

  /**
   * Saves a cover photo capture for a flipbook session.
   */
  public async saveCoverCapture(
    sessionId: string,
    captureIndex: number,
    filePath: string,
  ): Promise<void> {
    try {
      const query = `
        INSERT INTO session_captures (session_id, capture_index, file_path, is_cover, is_selected)
        VALUES ($1, $2, $3, true, false)
        ON CONFLICT DO NOTHING
      `;
      await pool.query(query, [sessionId, captureIndex, filePath]);
    } catch {
      const list = this.inMemoryCaptures.get(sessionId) || [];
      list.push({
        id: crypto.randomUUID(),
        sessionId,
        captureIndex,
        filePath,
        isCover: true,
        isSelected: false,
        createdAt: new Date(),
      });
      this.inMemoryCaptures.set(sessionId, list);
    }
  }

  /**
   * Saves or replaces a photo capture for a photo strip session and updates retake count.
   */
  public async savePhotoCapture(
    sessionId: string,
    captureIndex: number,
    filePath: string,
    isRetake: boolean = false,
  ): Promise<{ captureCount: number; retakeCount: number }> {
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        if (isRetake) {
          const updateRes = await client.query(
            `UPDATE sessions
             SET retake_count = retake_count + 1, last_activity_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND retake_count < 4
             RETURNING retake_count AS "retakeCount"`,
            [sessionId],
          );

          if (updateRes.rowCount === 0) {
            await client.query('ROLLBACK');
            throw new Error('Maximum retake limit of 4 reached for this session');
          }

          await client.query(
            `UPDATE session_captures
             SET file_path = $3, created_at = CURRENT_TIMESTAMP
             WHERE session_id = $1 AND capture_index = $2 AND is_cover = false`,
            [sessionId, captureIndex, filePath],
          );

          const capRes = await client.query(
            `SELECT COUNT(DISTINCT capture_index) AS count FROM session_captures WHERE session_id = $1 AND is_cover = false`,
            [sessionId],
          );

          await client.query('COMMIT');
          return {
            retakeCount: updateRes.rows[0].retakeCount,
            captureCount: parseInt(capRes.rows[0]?.count ?? '0', 10),
          };
        } else {
          await client.query(
            `DELETE FROM session_captures WHERE session_id = $1 AND capture_index = $2 AND is_cover = false`,
            [sessionId, captureIndex],
          );
          await client.query(
            `INSERT INTO session_captures (session_id, capture_index, file_path, is_cover, is_selected)
             VALUES ($1, $2, $3, false, true)`,
            [sessionId, captureIndex, filePath],
          );

          const sessRes = await client.query(
            `SELECT retake_count AS "retakeCount" FROM sessions WHERE id = $1`,
            [sessionId],
          );
          const capRes = await client.query(
            `SELECT COUNT(DISTINCT capture_index) AS count FROM session_captures WHERE session_id = $1 AND is_cover = false`,
            [sessionId],
          );

          await client.query('COMMIT');
          return {
            retakeCount: sessRes.rows[0]?.retakeCount ?? 0,
            captureCount: parseInt(capRes.rows[0]?.count ?? '0', 10),
          };
        }
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('Maximum retake limit')) {
        throw err;
      }

      let session = this.inMemorySessions.get(sessionId);
      if (!session) {
        session = {
          id: sessionId,
          token: 'in-memory-token',
          eventId: 'in-memory-event',
          type: 'photo_strip',
          state: 'capturing',
          retakeCount: 0,
          isPrinted: false,
          copiesPrinted: 0,
          createdAt: new Date(),
          lastActivityAt: new Date(),
        };
        this.inMemorySessions.set(sessionId, session);
      }

      if (isRetake) {
        if (session.retakeCount >= 4) {
          throw new Error('Maximum retake limit of 4 reached for this session');
        }
        session.retakeCount = (session.retakeCount || 0) + 1;
      }
      const list = this.inMemoryCaptures.get(sessionId) || [];
      const existingIdx = list.findIndex((c) => !c.isCover && c.captureIndex === captureIndex);
      if (existingIdx >= 0) {
        list[existingIdx].filePath = filePath;
      } else {
        list.push({
          id: crypto.randomUUID(),
          sessionId,
          captureIndex,
          filePath,
          isCover: false,
          isSelected: true,
          createdAt: new Date(),
        });
      }
      this.inMemoryCaptures.set(sessionId, list);
      return {
        retakeCount: session.retakeCount ?? 0,
        captureCount: new Set(list.filter((c) => !c.isCover).map((c) => c.captureIndex)).size,
      };
    }
  }

  /**
   * Saves a video recording for a flipbook session.
   */
  public async saveVideoCapture(
    sessionId: string,
    videoIndex: number,
    filePath: string,
    durationSeconds: number = 6.0,
  ): Promise<void> {
    try {
      const query = `
        INSERT INTO session_videos (session_id, video_index, file_path, duration_seconds, is_selected)
        VALUES ($1, $2, $3, $4, false)
        ON CONFLICT DO NOTHING
      `;
      await pool.query(query, [sessionId, videoIndex, filePath, durationSeconds]);
    } catch {
      const list = this.inMemoryVideos.get(sessionId) || [];
      list.push({
        id: crypto.randomUUID(),
        sessionId,
        videoIndex,
        filePath,
        durationSeconds,
        isSelected: false,
        createdAt: new Date(),
      });
      this.inMemoryVideos.set(sessionId, list);
    }
  }

  /**
   * Retrieves all cover and video captures for a flipbook session.
   */
  public async getFlipbookCaptures(sessionId: string): Promise<{
    covers: Array<{ id: string; captureIndex: number; filePath: string; isSelected: boolean }>;
    videos: Array<{
      id: string;
      videoIndex: number;
      filePath: string;
      durationSeconds: number;
      isSelected: boolean;
    }>;
  }> {
    try {
      const coversQuery = `
        SELECT id, capture_index AS "captureIndex", file_path AS "filePath", is_selected AS "isSelected"
        FROM session_captures
        WHERE session_id = $1 AND is_cover = true
        ORDER BY capture_index ASC
      `;
      const videosQuery = `
        SELECT id, video_index AS "videoIndex", file_path AS "filePath", duration_seconds AS "durationSeconds", is_selected AS "isSelected"
        FROM session_videos
        WHERE session_id = $1
        ORDER BY video_index ASC
      `;

      const [coversRes, videosRes] = await Promise.all([
        pool.query(coversQuery, [sessionId]),
        pool.query(videosQuery, [sessionId]),
      ]);

      return {
        covers: coversRes.rows,
        videos: videosRes.rows,
      };
    } catch {
      const covers = (this.inMemoryCaptures.get(sessionId) || [])
        .filter((c) => c.isCover)
        .sort((a, b) => a.captureIndex - b.captureIndex)
        .map((c) => ({
          id: c.id,
          captureIndex: c.captureIndex,
          filePath: c.filePath,
          isSelected: c.isSelected,
        }));

      const videos = (this.inMemoryVideos.get(sessionId) || [])
        .sort((a, b) => a.videoIndex - b.videoIndex)
        .map((v) => ({
          id: v.id,
          videoIndex: v.videoIndex,
          filePath: v.filePath,
          durationSeconds: v.durationSeconds,
          isSelected: v.isSelected,
        }));

      return { covers, videos };
    }
  }

  /**
   * Records the guest selection for cover photo and video clip.
   */
  public async recordFlipbookSelection(
    sessionId: string,
    coverIndex: number,
    videoIndex: number,
  ): Promise<void> {
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `UPDATE session_captures SET is_selected = (capture_index = $2) WHERE session_id = $1 AND is_cover = true`,
          [sessionId, coverIndex],
        );
        await client.query(
          `UPDATE session_videos SET is_selected = (video_index = $2) WHERE session_id = $1`,
          [sessionId, videoIndex],
        );
        await client.query(
          `UPDATE sessions SET state = 'processing', last_activity_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [sessionId],
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch {
      const covers = this.inMemoryCaptures.get(sessionId) || [];
      covers.forEach((c) => {
        c.isSelected = c.captureIndex === coverIndex;
      });

      const videos = this.inMemoryVideos.get(sessionId) || [];
      videos.forEach((v) => {
        v.isSelected = v.videoIndex === videoIndex;
      });

      const session = this.inMemorySessions.get(sessionId);
      if (session) {
        session.state = 'processing';
        session.lastActivityAt = new Date();
      }
    }
  }

  /**
   * Resets session to cover_capture state on 2-minute GIF processing timeout recovery.
   */
  public async resetFlipbookToCoverCapture(sessionId: string): Promise<void> {
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `DELETE FROM session_captures WHERE session_id = $1 AND is_cover = true`,
          [sessionId],
        );
        await client.query(`DELETE FROM session_videos WHERE session_id = $1`, [sessionId]);
        await client.query(
          `UPDATE sessions SET state = 'cover_capture', last_activity_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [sessionId],
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch {
      this.inMemoryCaptures.delete(sessionId);
      this.inMemoryVideos.delete(sessionId);
      const session = this.inMemorySessions.get(sessionId);
      if (session) {
        session.state = 'cover_capture';
        session.lastActivityAt = new Date();
      }
    }
  }

  /**
   * Saves a generated output and enqueues publication.
   */
  public async saveGeneratedOutput(
    sessionId: string,
    publicId: string,
    mediaType: 'image/png' | 'image/gif',
    filePath: string,
    width: number,
    height: number,
  ): Promise<string> {
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const outputQuery = `
          INSERT INTO generated_outputs (session_id, public_id, media_type, file_path, width, height)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id
        `;
        const outputRes = await client.query(outputQuery, [
          sessionId,
          publicId,
          mediaType,
          filePath,
          width,
          height,
        ]);
        const outputId = outputRes.rows[0].id;

        const pubQuery = `
          INSERT INTO publication_records (output_id, public_id, status)
          VALUES ($1, $2, 'queued')
          ON CONFLICT (public_id) DO NOTHING
        `;
        await client.query(pubQuery, [outputId, publicId]);

        await client.query(
          `UPDATE sessions SET state = 'booth_confirmed', last_activity_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [sessionId],
        );

        await client.query('COMMIT');
        return outputId;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch {
      const outputId = crypto.randomUUID();
      const output: OutputItem = {
        id: outputId,
        sessionId,
        publicId,
        mediaType,
        filePath,
        width,
        height,
        createdAt: new Date(),
        eventName: 'SIC General Assembly',
        eventDate: new Date().toISOString().split('T')[0],
      };
      this.inMemoryOutputs.set(publicId, output);
      const publicationId = crypto.randomUUID();
      this.inMemoryPublications.set(publicationId, {
        id: publicationId,
        publicId,
        status: 'queued',
        retryCount: 0,
        lastAttemptAt: null,
        nextAttemptAt: new Date(),
        lastError: null,
        cloudFinalizedAt: null,
        cloudinaryUrl: null,
        cloudinaryPublicId: null,
        expiresAt: null,
        createdAt: new Date(),
        mediaType,
        eventName: output.eventName,
        eventDate: output.eventDate,
      });

      const session = this.inMemorySessions.get(sessionId);
      if (session) {
        session.state = 'booth_confirmed';
        session.lastActivityAt = new Date();
      }
      return outputId;
    }
  }

  /**
   * Retrieves approved output by public ID.
   */
  public async getApprovedOutputByPublicId(publicId: string): Promise<OutputItem | null> {
    try {
      const query = `
        SELECT
          o.id,
          o.session_id AS "sessionId",
          o.public_id AS "publicId",
          o.media_type AS "mediaType",
          o.file_path AS "filePath",
          o.width,
          o.height,
          o.created_at AS "createdAt",
          e.name AS "eventName",
          e.date::text AS "eventDate"
        FROM generated_outputs o
        JOIN sessions s ON o.session_id = s.id
        JOIN events e ON s.event_id = e.id
        WHERE o.public_id = $1 AND s.state IN ('booth_confirmed', 'printed')
      `;
      const res = await pool.query(query, [publicId]);
      return res.rows[0] || this.inMemoryOutputs.get(publicId) || null;
    } catch {
      return this.inMemoryOutputs.get(publicId) || null;
    }
  }

  public async listPublications(): Promise<PublicationRecord[]> {
    try {
      const result = await pool.query(`
        SELECT p.id, p.public_id AS "publicId", p.status, p.retry_count AS "retryCount",
          p.last_attempt_at AS "lastAttemptAt", p.next_attempt_at AS "nextAttemptAt", p.last_error AS "lastError",
          p.cloud_finalized_at AS "cloudFinalizedAt",
          p.cloudinary_url AS "cloudinaryUrl", p.cloudinary_public_id AS "cloudinaryPublicId",
          p.expires_at AS "expiresAt", p.created_at AS "createdAt",
          o.media_type AS "mediaType", e.name AS "eventName", e.date::text AS "eventDate"
        FROM publication_records p
        JOIN generated_outputs o ON o.id = p.output_id
        JOIN sessions s ON s.id = o.session_id
        JOIN events e ON e.id = s.event_id
        ORDER BY p.created_at DESC
      `);
      return [...result.rows, ...this.inMemoryPublications.values()].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    } catch {
      return Array.from(this.inMemoryPublications.values()).sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      );
    }
  }

  public async retryPublication(id: string): Promise<PublicationRecord | null> {
    let retried: PublicationRecord | undefined;
    try {
      const result = await pool.query(
        `WITH requeued AS (
          UPDATE publication_records
          SET status = 'queued', retry_count = 0, last_attempt_at = NULL,
            next_attempt_at = CURRENT_TIMESTAMP, last_error = NULL
          WHERE id = $1 AND status = 'failed'
          RETURNING *
        )
        SELECT p.id, p.public_id AS "publicId", p.status, p.retry_count AS "retryCount",
          p.last_attempt_at AS "lastAttemptAt", p.next_attempt_at AS "nextAttemptAt", p.last_error AS "lastError",
          p.cloud_finalized_at AS "cloudFinalizedAt",
          p.cloudinary_url AS "cloudinaryUrl", p.cloudinary_public_id AS "cloudinaryPublicId",
          p.expires_at AS "expiresAt", p.created_at AS "createdAt",
          o.media_type AS "mediaType", e.name AS "eventName", e.date::text AS "eventDate"
        FROM requeued p
        JOIN generated_outputs o ON o.id = p.output_id
        JOIN sessions s ON s.id = o.session_id
        JOIN events e ON e.id = s.event_id`,
        [id],
      );
      retried = result.rows[0];
    } catch {
      retried = undefined;
    }
    if (retried) return retried;
    const publication = this.inMemoryPublications.get(id);
    if (!publication || publication.status !== 'failed') return null;
    publication.status = 'queued';
    publication.retryCount = 0;
    publication.lastAttemptAt = null;
    publication.nextAttemptAt = new Date();
    publication.lastError = null;
    return publication;
  }

  /**
   * Atomically claims up to `limit` queued publications for upload, marking them in_progress.
   */
  public async claimQueuedPublications(
    limit: number,
    now: Date = new Date(),
  ): Promise<QueuedPublication[]> {
    let pgClaimed: QueuedPublication[] = [];
    try {
      const claim = await pool.query(
        `UPDATE publication_records p
         SET status = 'in_progress', last_attempt_at = CURRENT_TIMESTAMP
         WHERE p.id IN (
           SELECT q.id
           FROM publication_records q
           JOIN generated_outputs o ON o.id = q.output_id
           WHERE q.status = 'queued' AND q.next_attempt_at <= $2
           ORDER BY q.created_at
           LIMIT $1
           FOR UPDATE SKIP LOCKED
         )
         RETURNING id`,
        [limit, now],
      );
      if (claim.rows.length > 0) {
        const details = await pool.query(
          `SELECT p.id, p.public_id AS "publicId", o.file_path AS "filePath", o.media_type AS "mediaType",
             e.name AS "eventName", e.date::text AS "eventDate", p.retry_count AS "retryCount"
           FROM publication_records p
           JOIN generated_outputs o ON o.id = p.output_id
           JOIN sessions s ON s.id = o.session_id
           JOIN events e ON e.id = s.event_id
           WHERE p.id = ANY($1::uuid[])
           ORDER BY p.created_at`,
          [claim.rows.map((r) => r.id)],
        );
        pgClaimed = details.rows;
      }
    } catch {
      pgClaimed = [];
    }
    const remaining = limit - pgClaimed.length;
    if (remaining <= 0) return pgClaimed;
    return [...pgClaimed, ...this.claimQueuedInMemory(remaining, now)];
  }

  /**
   * Claims queued publications from the in-memory mirror (degraded / hybrid operation).
   */
  private claimQueuedInMemory(limit: number, now: Date): QueuedPublication[] {
    return Array.from(this.inMemoryPublications.entries())
      .filter(
        ([, p]) => p.status === 'queued' && p.nextAttemptAt !== null && p.nextAttemptAt <= now,
      )
      .sort((a, b) => a[1].createdAt.getTime() - b[1].createdAt.getTime())
      .slice(0, limit)
      .map(([id, p]) => {
        const output = this.inMemoryOutputs.get(p.publicId);
        if (!output) return null;
        p.status = 'in_progress';
        p.lastAttemptAt = now;
        this.inMemoryPublications.set(id, p);
        return {
          id,
          publicId: p.publicId,
          filePath: output.filePath,
          mediaType: output.mediaType,
          eventName: output.eventName,
          eventDate: output.eventDate,
          retryCount: p.retryCount,
        };
      })
      .filter((q): q is QueuedPublication => q !== null);
  }

  /**
   * Marks a publication successfully uploaded to Cloudinary.
   */
  public async markPublicationUploaded(
    id: string,
    cloudinaryUrl: string,
    cloudinaryPublicId: string,
    cloudFinalizedAt: Date,
    expiresAt: Date,
  ): Promise<boolean> {
    let updated = false;
    try {
      const result = await pool.query(
        `UPDATE publication_records
         SET status = 'uploaded', cloudinary_url = $2, cloudinary_public_id = $3,
           cloud_finalized_at = $4, expires_at = $5, next_attempt_at = NULL, last_error = NULL
         WHERE id = $1`,
        [id, cloudinaryUrl, cloudinaryPublicId, cloudFinalizedAt, expiresAt],
      );
      updated = (result.rowCount ?? 0) > 0;
    } catch {
      // fall back to in-memory
    }
    if (updated) return true;
    const pub = this.inMemoryPublications.get(id);
    if (!pub) return false;
    pub.status = 'uploaded';
    pub.cloudinaryUrl = cloudinaryUrl;
    pub.cloudinaryPublicId = cloudinaryPublicId;
    pub.cloudFinalizedAt = cloudFinalizedAt;
    pub.expiresAt = expiresAt;
    pub.nextAttemptAt = null;
    pub.lastError = null;
    return true;
  }

  /**
   * Records a failed upload attempt. A null nextAttemptAt is a dead-letter job.
   */
  public async markPublicationFailed(
    id: string,
    error: string,
    nextAttemptAt: Date | null,
  ): Promise<void> {
    let updated = false;
    try {
      const result = await pool.query(
        `UPDATE publication_records
         SET status = CASE WHEN $3 IS NULL THEN 'failed' ELSE 'queued' END,
           retry_count = retry_count + 1,
           last_attempt_at = CURRENT_TIMESTAMP,
           next_attempt_at = $3,
           last_error = $2
         WHERE id = $1`,
        [id, error, nextAttemptAt],
      );
      updated = (result.rowCount ?? 0) > 0;
    } catch {
      // fall back to in-memory
    }
    if (updated) return;
    const pub = this.inMemoryPublications.get(id);
    if (!pub) return;
    pub.retryCount += 1;
    pub.lastAttemptAt = new Date();
    pub.nextAttemptAt = nextAttemptAt;
    pub.lastError = error;
    pub.status = nextAttemptAt === null ? 'failed' : 'queued';
  }

  /** Requeues interrupted work and counts the interrupted attempt toward the dead-letter limit. */
  public async recoverStalledPublications(staleBefore: Date, maxAttempts: number): Promise<void> {
    try {
      await pool.query(
        `UPDATE publication_records
         SET retry_count = retry_count + 1,
           status = CASE WHEN retry_count + 1 >= $2 THEN 'failed' ELSE 'queued' END,
           next_attempt_at = CASE WHEN retry_count + 1 >= $2 THEN NULL ELSE CURRENT_TIMESTAMP END,
           last_error = 'Upload worker interrupted; job requeued.'
         WHERE status = 'in_progress' AND last_attempt_at < $1`,
        [staleBefore, maxAttempts],
      );
    } catch {
      // The in-memory mirror below keeps degraded mode recoverable too.
    }
    for (const publication of this.inMemoryPublications.values()) {
      if (
        publication.status === 'in_progress' &&
        publication.lastAttemptAt !== null &&
        publication.lastAttemptAt < staleBefore
      ) {
        publication.retryCount += 1;
        publication.status = publication.retryCount >= maxAttempts ? 'failed' : 'queued';
        publication.nextAttemptAt = publication.status === 'failed' ? null : new Date();
        publication.lastError = 'Upload worker interrupted; job requeued.';
      }
    }
  }

  private readonly templateSelectFields = `
    SELECT
      t.id,
      t.name,
      t.orientation,
      t.output_width AS "outputWidth",
      t.output_height AS "outputHeight",
      t.background_path AS "backgroundPath",
      t.is_active AS "isActive",
      t.required_capture_count AS "requiredCaptureCount",
      t.countdown_seconds AS "countdownSeconds",
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', p.id,
              'captureIndex', p.capture_index,
              'x', p.x,
              'y', p.y,
              'width', p.width,
              'height', p.height,
              'rotation', p.rotation,
              'borderRadius', p.border_radius,
              'zIndex', p.z_index
            ) ORDER BY p.z_index ASC, p.capture_index ASC
          )
          FROM template_placements p
          WHERE p.template_id = t.id
        ),
        '[]'::json
      ) AS placements,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', o.id,
              'label', o.label,
              'assetPath', o.asset_path,
              'x', o.x,
              'y', o.y,
              'width', o.width,
              'height', o.height,
              'rotation', o.rotation,
              'zIndex', o.z_index
            ) ORDER BY o.z_index ASC
          )
          FROM template_overlays o
          WHERE o.template_id = t.id
        ),
        '[]'::json
      ) AS overlays,
      t.created_at AS "createdAt",
      t.updated_at AS "updatedAt"
    FROM templates t
  `;

  /**
   * Lists all active templates for Photo Strip sessions.
   */
  public async listActiveTemplates(): Promise<TemplateItem[]> {
    try {
      const query = `
        ${this.templateSelectFields}
        WHERE t.is_active = true
        ORDER BY t.created_at ASC
      `;
      const res = await pool.query(query);
      if (res.rows && res.rows.length > 0) {
        return res.rows;
      }
      return Array.from(this.inMemoryTemplates.values()).filter((t) => t.isActive);
    } catch {
      return Array.from(this.inMemoryTemplates.values()).filter((t) => t.isActive);
    }
  }

  /**
   * Retrieves a template by ID.
   */
  public async getTemplateById(templateId: string): Promise<TemplateItem | null> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      templateId,
    );
    if (isUuid) {
      try {
        const query = `
          ${this.templateSelectFields}
          WHERE t.id = $1
        `;
        const res = await pool.query(query, [templateId]);
        if (res.rows[0]) return res.rows[0];
      } catch {
        // fallback to memory
      }
    } else {
      try {
        const query = `
          ${this.templateSelectFields}
          WHERE t.name ILIKE $1
          LIMIT 1
        `;
        const res = await pool.query(query, [`%${templateId}%`]);
        if (res.rows[0]) return res.rows[0];
      } catch {
        // fallback to memory
      }
    }

    if (this.inMemoryTemplates.has(templateId)) {
      return this.inMemoryTemplates.get(templateId) || null;
    }

    const all = Array.from(this.inMemoryTemplates.values());
    const match = all.find(
      (t) => t.id === templateId || t.name.toLowerCase().includes(templateId.toLowerCase()),
    );
    return match || null;
  }

  /**
   * Creates a new template in the database with normalized placements and overlays.
   */
  public async createTemplate(
    name: string,
    orientation: 'landscape' | 'portrait',
    outputWidth: number,
    outputHeight: number,
    backgroundPath: string,
    requiredCaptureCount: number,
    countdownSeconds: 3 | 5 | 10,
    placements: TemplatePlacement[] = [],
    overlays: TemplateOverlay[] = [],
  ): Promise<TemplateItem> {
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');

      const templateRes = await client.query(
        `
        INSERT INTO templates (
          name, orientation, output_width, output_height,
          background_path, required_capture_count, countdown_seconds
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING
          id, name, orientation,
          output_width AS "outputWidth",
          output_height AS "outputHeight",
          background_path AS "backgroundPath",
          is_active AS "isActive",
          required_capture_count AS "requiredCaptureCount",
          countdown_seconds AS "countdownSeconds",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        `,
        [
          name,
          orientation,
          outputWidth,
          outputHeight,
          backgroundPath,
          requiredCaptureCount,
          countdownSeconds,
        ],
      );
      const row = templateRes.rows[0];
      const templateId = row.id;

      if (placements.length > 0) {
        for (const p of placements) {
          await client.query(
            `
            INSERT INTO template_placements (
              template_id, capture_index, x, y, width, height, rotation, border_radius, z_index
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `,
            [
              templateId,
              p.captureIndex,
              p.x,
              p.y,
              p.width,
              p.height,
              p.rotation || 0,
              p.borderRadius || 0,
              p.zIndex || 1,
            ],
          );
        }
      }

      if (overlays.length > 0) {
        for (const o of overlays) {
          await client.query(
            `
            INSERT INTO template_overlays (
              template_id, label, asset_path, x, y, width, height, rotation, z_index
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `,
            [
              templateId,
              o.label,
              o.assetPath || '',
              o.x || 0,
              o.y || 0,
              o.width,
              o.height,
              o.rotation || 0,
              o.zIndex || 2,
            ],
          );
        }
      }

      await client.query('COMMIT');
      return {
        ...row,
        placements,
        overlays,
      };
    } catch {
      if (client) {
        await client.query('ROLLBACK').catch(() => {});
      }
      const id = crypto.randomUUID();
      const template: TemplateItem = {
        id,
        name,
        orientation,
        outputWidth,
        outputHeight,
        backgroundPath,
        isActive: true,
        requiredCaptureCount,
        countdownSeconds,
        placements,
        overlays,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.inMemoryTemplates.set(id, template);
      return template;
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  /**
   * Updates template placements and overlays using transactional replace-all.
   */
  public async updateTemplateLayout(
    templateId: string,
    placements: TemplatePlacement[],
    overlays: TemplateOverlay[] = [],
  ): Promise<boolean> {
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      await client.query('DELETE FROM template_placements WHERE template_id = $1', [templateId]);
      for (const p of placements) {
        await client.query(
          `
          INSERT INTO template_placements (
            template_id, capture_index, x, y, width, height, rotation, border_radius, z_index
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `,
          [
            templateId,
            p.captureIndex,
            p.x,
            p.y,
            p.width,
            p.height,
            p.rotation || 0,
            p.borderRadius || 0,
            p.zIndex || 1,
          ],
        );
      }

      await client.query('DELETE FROM template_overlays WHERE template_id = $1', [templateId]);
      for (const o of overlays) {
        await client.query(
          `
          INSERT INTO template_overlays (
            template_id, label, asset_path, x, y, width, height, rotation, z_index
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `,
          [
            templateId,
            o.label,
            o.assetPath || '',
            o.x || 0,
            o.y || 0,
            o.width,
            o.height,
            o.rotation || 0,
            o.zIndex || 2,
          ],
        );
      }
      await client.query('UPDATE templates SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [
        templateId,
      ]);
      await client.query('COMMIT');
      return true;
    } catch {
      if (client) {
        await client.query('ROLLBACK').catch(() => {});
      }
      const mem = this.inMemoryTemplates.get(templateId);
      if (mem) {
        mem.placements = placements;
        mem.overlays = overlays;
        mem.updatedAt = new Date();
        return true;
      }
      return false;
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  /**
   * Ensures canonical default templates exist in PostgreSQL.
   */
  public async seedDefaultTemplatesIfEmpty(): Promise<void> {
    try {
      const existing = await this.listActiveTemplates();
      if (existing.length === 0) {
        await this.createTemplate(
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
      }
    } catch {
      // Ignored if DB is unavailable
    }
  }

  /**
   * Associates a template with a Photo Strip session, saves an immutable snapshot,
   * and advances state to 'template_selected'.
   */
  public async selectTemplate(
    sessionId: string,
    template: TemplateItem,
  ): Promise<SessionData | null> {
    const snapshot = {
      id: template.id,
      name: template.name,
      orientation: template.orientation,
      outputWidth: template.outputWidth,
      outputHeight: template.outputHeight,
      backgroundPath: template.backgroundPath,
      requiredCaptureCount: template.requiredCaptureCount,
      countdownSeconds: template.countdownSeconds,
      placements: template.placements,
      overlays: template.overlays || [],
      snapshottedAt: new Date().toISOString(),
    };

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      template.id,
    );
    const dbTemplateId = isUuid ? template.id : null;

    try {
      const query = `
        UPDATE sessions
        SET template_id = $2,
            template_snapshot = $3::jsonb,
            state = 'template_selected',
            last_activity_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING
          id,
          token,
          event_id AS "eventId",
          type,
          state,
          template_id AS "templateId",
          frame_id AS "frameId",
          template_snapshot AS "templateSnapshot",
          retake_count AS "retakeCount",
          is_printed AS "isPrinted",
          copies_printed AS "copiesPrinted",
          created_at AS "createdAt",
          last_activity_at AS "lastActivityAt",
          cancelled_at AS "cancelledAt"
      `;
      const res = await pool.query(query, [sessionId, dbTemplateId, JSON.stringify(snapshot)]);
      if (res.rows[0]) return res.rows[0];
    } catch {
      // fallback to in-memory
    }

    const session = this.inMemorySessions.get(sessionId);
    if (session) {
      session.templateId = template.id;
      session.templateSnapshot = snapshot;
      session.state = 'template_selected';
      session.lastActivityAt = new Date();
      return session;
    }
    return null;
  }

  /**
   * Retrieves all selected photo captures for a session.
   */
  public async getPhotoCaptures(sessionId: string): Promise<CaptureItem[]> {
    try {
      const query = `
        SELECT
          id,
          session_id AS "sessionId",
          capture_index AS "captureIndex",
          file_path AS "filePath",
          is_cover AS "isCover",
          is_selected AS "isSelected",
          created_at AS "createdAt"
        FROM session_captures
        WHERE session_id = $1 AND is_cover = false AND is_selected = true
        ORDER BY capture_index ASC
      `;
      const res = await pool.query(query, [sessionId]);
      return res.rows;
    } catch {
      const captures = this.inMemoryCaptures.get(sessionId) || [];
      return captures
        .filter((c) => !c.isCover && c.isSelected)
        .sort((a, b) => a.captureIndex - b.captureIndex);
    }
  }

  /**
   * Records print status for a confirmed session and transitions state to 'printed'.
   */
  public async recordPrintStatus(
    sessionId: string,
    copiesPrinted: number,
  ): Promise<SessionData | null> {
    try {
      const query = `
        UPDATE sessions
        SET is_printed = true,
            copies_printed = copies_printed + $2,
            state = 'printed',
            last_activity_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND state = 'booth_confirmed'
        RETURNING
          id,
          token,
          event_id AS "eventId",
          type,
          state,
          template_id AS "templateId",
          frame_id AS "frameId",
          template_snapshot AS "templateSnapshot",
          retake_count AS "retakeCount",
          is_printed AS "isPrinted",
          copies_printed AS "copiesPrinted",
          created_at AS "createdAt",
          last_activity_at AS "lastActivityAt",
          cancelled_at AS "cancelledAt"
      `;
      const res = await pool.query(query, [sessionId, copiesPrinted]);
      if (res.rows[0]) return res.rows[0];
    } catch {
      // fallback to in-memory
    }

    const session = this.inMemorySessions.get(sessionId);
    if (session && session.state === 'booth_confirmed') {
      session.isPrinted = true;
      session.copiesPrinted += copiesPrinted;
      session.state = 'printed';
      session.lastActivityAt = new Date();
      return session;
    }
    return null;
  }
}

export const dbRepository = new DatabaseRepository();
