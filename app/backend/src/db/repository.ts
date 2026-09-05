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

export class DatabaseRepository {
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
  private inMemoryCaptures: Map<string, CaptureItem[]> = new Map();
  private inMemoryVideos: Map<string, VideoItem[]> = new Map();
  private inMemoryOutputs: Map<string, OutputItem> = new Map();

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
      if (isRetake) {
        await pool.query(
          `UPDATE sessions SET retake_count = retake_count + 1, last_activity_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [sessionId],
        );
        await pool.query(
          `UPDATE session_captures SET file_path = $3, created_at = CURRENT_TIMESTAMP WHERE session_id = $1 AND capture_index = $2 AND is_cover = false`,
          [sessionId, captureIndex, filePath],
        );
      } else {
        await pool.query(
          `INSERT INTO session_captures (session_id, capture_index, file_path, is_cover, is_selected)
           VALUES ($1, $2, $3, false, true)
           ON CONFLICT DO NOTHING`,
          [sessionId, captureIndex, filePath],
        );
      }

      const [sessRes, capRes] = await Promise.all([
        pool.query(`SELECT retake_count AS "retakeCount" FROM sessions WHERE id = $1`, [sessionId]),
        pool.query(
          `SELECT COUNT(*) AS count FROM session_captures WHERE session_id = $1 AND is_cover = false`,
          [sessionId],
        ),
      ]);

      return {
        retakeCount: sessRes.rows[0]?.retakeCount ?? 0,
        captureCount: parseInt(capRes.rows[0]?.count ?? '0', 10),
      };
    } catch {
      const session = this.inMemorySessions.get(sessionId);
      if (isRetake && session) {
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
        retakeCount: session?.retakeCount ?? 0,
        captureCount: list.filter((c) => !c.isCover).length,
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
      await pool.query('BEGIN');
      await pool.query(
        `UPDATE session_captures SET is_selected = (capture_index = $2) WHERE session_id = $1 AND is_cover = true`,
        [sessionId, coverIndex],
      );
      await pool.query(
        `UPDATE session_videos SET is_selected = (video_index = $2) WHERE session_id = $1`,
        [sessionId, videoIndex],
      );
      await pool.query(
        `UPDATE sessions SET state = 'processing', last_activity_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [sessionId],
      );
      await pool.query('COMMIT');
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
      await pool.query('BEGIN');
      await pool.query(`DELETE FROM session_captures WHERE session_id = $1 AND is_cover = true`, [
        sessionId,
      ]);
      await pool.query(`DELETE FROM session_videos WHERE session_id = $1`, [sessionId]);
      await pool.query(
        `UPDATE sessions SET state = 'cover_capture', last_activity_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [sessionId],
      );
      await pool.query('COMMIT');
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
      await pool.query('BEGIN');
      const outputQuery = `
        INSERT INTO generated_outputs (session_id, public_id, media_type, file_path, width, height)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `;
      const outputRes = await pool.query(outputQuery, [
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
      await pool.query(pubQuery, [outputId, publicId]);

      await pool.query(
        `UPDATE sessions SET state = 'booth_confirmed', last_activity_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [sessionId],
      );

      await pool.query('COMMIT');
      return outputId;
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
}

export const dbRepository = new DatabaseRepository();
