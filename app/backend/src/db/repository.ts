/**
 * Legacy PostgreSQL implementation of the core repository contract. It stays
 * selectable through `LOCAL_DATABASE_ENGINE=postgres` until the SQLite cutover
 * is verified. Database failures propagate to callers; there is no in-memory
 * fallback store.
 */
import { pool } from './pool.js';
import type { SessionData, SessionState } from '../services/session-state-machine.js';
import type { SessionType } from '@photobooth/public-output';
import { resolveStoredPath, toStoredPath, withResolvedFilePath } from '../services/storage-paths.js';
import type {
  ActivePrintAttempt,
  AnalyticsData,
  AnalyticsFilters,
  CaptureItem,
  CoreRepository,
  CreatePrintJobInput,
  EventData,
  FlipbookCaptures,
  FrameItem,
  LocalPublicationOutput,
  OutputItem,
  PrintJob,
  PrintJobAttempt,
  PrintJobStatus,
  PublicationRecord,
  QueuedPublication,
  SupersededPrintAttempt,
  TemplateItem,
  TemplateOverlay,
  TemplatePlacement,
} from './contracts.js';
import {
  activeBuiltInTemplates,
  buildAnalyticsData,
  buildFlipbookSnapshot,
  buildTemplateSnapshot,
  builtInFrames,
  findBuiltInFrame,
  findBuiltInTemplate,
  isUuid,
  withDefaultFramePlacements,
  type AnalyticsSessionRow,
} from './shared.js';

export type * from './contracts.js';

/**
 * An ILIKE pattern that matches `term` literally anywhere, as the SQLite engine's
 * instr() lookup does: `%`, `_`, and the default escape `\\` lose their wildcard meaning.
 */
export function containsPattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

const SESSION_RETURNING = `
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
  cancelled_at AS "cancelledAt"`;

const PRINT_JOB_FIELDS = `id, session_id AS "sessionId", output_id AS "outputId", public_id AS "publicId",
  output_type AS "outputType", artifact_type AS "artifactType", copies_requested AS "copiesRequested",
  copies_completed AS "copiesCompleted", GREATEST(copies_requested - copies_completed, 0) AS "copiesWaiting",
  printer_name AS "printerName", media_size AS "mediaSize", mode, status, last_error AS "lastError",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

const PUBLICATION_FIELDS = `p.id, p.public_id AS "publicId", p.status, p.retry_count AS "retryCount",
  p.last_attempt_at AS "lastAttemptAt", p.next_attempt_at AS "nextAttemptAt", p.last_error AS "lastError",
  p.cloud_finalized_at AS "cloudFinalizedAt",
  p.cloudinary_url AS "cloudinaryUrl", p.cloudinary_public_id AS "cloudinaryPublicId",
  p.expires_at AS "expiresAt", p.created_at AS "createdAt",
  o.media_type AS "mediaType", e.name AS "eventName", e.date::text AS "eventDate"`;

const OUTPUT_FIELDS = `o.id, o.session_id AS "sessionId", o.public_id AS "publicId", o.media_type AS "mediaType",
  o.file_path AS "filePath", o.width, o.height, o.created_at AS "createdAt",
  e.name AS "eventName", e.date::text AS "eventDate"`;

type Queryable = Pick<typeof pool, 'query'>;

export class DatabaseRepository implements CoreRepository {
  public async listEvents(): Promise<EventData[]> {
    const result = await pool.query(`
      SELECT id, name, description, date::text, operator_name AS "operatorName", created_at AS "createdAt"
      FROM events
      ORDER BY date DESC, name ASC
    `);
    return result.rows;
  }

  public async getEventById(id: string): Promise<EventData | null> {
    if (!isUuid(id)) return null;
    const result = await pool.query(
      `SELECT id, name, description, date::text, operator_name AS "operatorName", created_at AS "createdAt"
       FROM events
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] || null;
  }

  public async createEvent(
    name: string,
    date: string,
    operatorName: string,
    description?: string,
  ): Promise<EventData> {
    const result = await pool.query(
      `INSERT INTO events (name, description, date, operator_name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, description, date::text, operator_name AS "operatorName", created_at AS "createdAt"`,
      [name, description || null, date, operatorName],
    );
    return result.rows[0];
  }

  public async deleteEvent(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    const result = await pool.query('DELETE FROM events WHERE id = $1 RETURNING id', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Creates or returns an existing event by name and date.
   */
  public async getOrCreateEvent(
    name: string,
    date: string,
    operatorName: string,
  ): Promise<EventData> {
    const res = await pool.query(
      `INSERT INTO events (name, date, operator_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (name, date) DO UPDATE
         SET operator_name = EXCLUDED.operator_name
       RETURNING id, name, date::text, operator_name AS "operatorName", created_at AS "createdAt"`,
      [name, date, operatorName],
    );
    return res.rows[0];
  }

  public async createSession(
    eventId: string,
    type: SessionType,
    token: string,
  ): Promise<SessionData> {
    const initialState: SessionState = 'created';
    const res = await pool.query(
      `INSERT INTO sessions (event_id, type, state, token)
       VALUES ($1, $2, $3, $4)
       RETURNING ${SESSION_RETURNING}`,
      [eventId, type, initialState, token],
    );
    return res.rows[0];
  }

  public async getSessionById(sessionId: string): Promise<SessionData | null> {
    if (!isUuid(sessionId)) return null;
    const res = await pool.query(`SELECT ${SESSION_RETURNING} FROM sessions WHERE id = $1`, [
      sessionId,
    ]);
    return res.rows[0] || null;
  }

  public async updateSessionState(
    sessionId: string,
    state: SessionState,
  ): Promise<SessionData | null> {
    if (!isUuid(sessionId)) return null;
    const res = await pool.query(
      `UPDATE sessions
       SET state = $2, last_activity_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING ${SESSION_RETURNING}`,
      [sessionId, state],
    );
    return res.rows[0] || null;
  }

  public async cancelSession(sessionId: string): Promise<SessionData | null> {
    if (!isUuid(sessionId)) return null;
    const res = await pool.query(
      `UPDATE sessions
       SET state = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, last_activity_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND state != 'booth_confirmed' AND state != 'printed' AND state != 'cancelled'
       RETURNING ${SESSION_RETURNING}`,
      [sessionId],
    );
    return res.rows[0] || null;
  }

  public async listActiveFrames(): Promise<FrameItem[]> {
    const res = await pool.query(`
      SELECT id, name, overlay_path AS "overlayPath", is_active AS "isActive"
      FROM frames
      WHERE is_active = true
      ORDER BY created_at ASC
    `);
    if (res.rows.length > 0) return res.rows.map((row: FrameItem) => withDefaultFramePlacements(row));
    return builtInFrames();
  }

  public async getFrameById(frameId: string): Promise<FrameItem | null> {
    const res = isUuid(frameId)
      ? await pool.query(
          `SELECT id, name, overlay_path AS "overlayPath", is_active AS "isActive"
           FROM frames
           WHERE id = $1`,
          [frameId],
        )
      : await pool.query(
          `SELECT id, name, overlay_path AS "overlayPath", is_active AS "isActive"
           FROM frames
           WHERE name ILIKE $1 OR overlay_path ILIKE $1
           ORDER BY created_at ASC, id ASC
           LIMIT 1`,
          [containsPattern(frameId)],
        );
    if (res.rows[0]) return withDefaultFramePlacements(res.rows[0]);
    return findBuiltInFrame(frameId);
  }

  public async createFrame(name: string, overlayPath: string): Promise<FrameItem> {
    const res = await pool.query(
      `INSERT INTO frames (name, overlay_path)
       VALUES ($1, $2)
       RETURNING id, name, overlay_path AS "overlayPath", is_active AS "isActive"`,
      [name, overlayPath],
    );
    return res.rows[0];
  }

  /**
   * Associates a frame with an active session and sets state to frame_selected.
   */
  public async setSessionFrame(
    sessionId: string,
    frameId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy template/frame union
    resolvedTemplate?: any,
  ): Promise<SessionData | null> {
    const snapshot = buildFlipbookSnapshot(frameId, resolvedTemplate);
    const res = await pool.query(
      `UPDATE sessions
       SET
         template_id = CASE
           WHEN $2::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             AND EXISTS (SELECT 1 FROM templates WHERE id = $2::uuid)
           THEN $2::uuid
           ELSE NULL
         END,
         frame_id = CASE
           WHEN $2::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             AND EXISTS (SELECT 1 FROM frames WHERE id = $2::uuid)
           THEN $2::uuid
           ELSE NULL
         END,
         template_snapshot = $3::jsonb,
         state = 'frame_selected',
         last_activity_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING ${SESSION_RETURNING}`,
      [sessionId, frameId, JSON.stringify(snapshot)],
    );
    return res.rows[0] || null;
  }

  public async saveCoverCapture(
    sessionId: string,
    captureIndex: number,
    filePath: string,
  ): Promise<void> {
    await pool.query(
      `INSERT INTO session_captures (session_id, capture_index, file_path, is_cover, is_selected)
       VALUES ($1, $2, $3, true, false)
       ON CONFLICT DO NOTHING`,
      [sessionId, captureIndex, toStoredPath(filePath)],
    );
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
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let retakeCount: number;
      if (isRetake) {
        const updateRes = await client.query(
          `UPDATE sessions
           SET retake_count = retake_count + 1, last_activity_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND retake_count < 4
           RETURNING retake_count AS "retakeCount"`,
          [sessionId],
        );
        if (updateRes.rowCount === 0) {
          throw new Error('Maximum retake limit of 4 reached for this session');
        }
        retakeCount = updateRes.rows[0].retakeCount;

        const updCapRes = await client.query(
          `UPDATE session_captures
           SET file_path = $3, created_at = CURRENT_TIMESTAMP
           WHERE session_id = $1 AND capture_index = $2 AND is_cover = false`,
          [sessionId, captureIndex, toStoredPath(filePath)],
        );
        if (updCapRes.rowCount === 0) {
          await client.query(
            `INSERT INTO session_captures (session_id, capture_index, file_path, is_cover, is_selected)
             VALUES ($1, $2, $3, false, true)`,
            [sessionId, captureIndex, toStoredPath(filePath)],
          );
        }
      } else {
        await client.query(
          `DELETE FROM session_captures WHERE session_id = $1 AND capture_index = $2 AND is_cover = false`,
          [sessionId, captureIndex],
        );
        await client.query(
          `INSERT INTO session_captures (session_id, capture_index, file_path, is_cover, is_selected)
           VALUES ($1, $2, $3, false, true)`,
          [sessionId, captureIndex, toStoredPath(filePath)],
        );
        const sessRes = await client.query(
          `SELECT retake_count AS "retakeCount" FROM sessions WHERE id = $1`,
          [sessionId],
        );
        retakeCount = sessRes.rows[0]?.retakeCount ?? 0;
      }

      const capRes = await client.query(
        `SELECT COUNT(DISTINCT capture_index) AS count FROM session_captures WHERE session_id = $1 AND is_cover = false`,
        [sessionId],
      );
      await client.query('COMMIT');
      return { retakeCount, captureCount: parseInt(capRes.rows[0]?.count ?? '0', 10) };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  public async saveVideoCapture(
    sessionId: string,
    videoIndex: number,
    filePath: string,
    durationSeconds: number = 6.0,
  ): Promise<void> {
    await pool.query(
      `INSERT INTO session_videos (session_id, video_index, file_path, duration_seconds, is_selected)
       VALUES ($1, $2, $3, $4, false)
       ON CONFLICT DO NOTHING`,
      [sessionId, videoIndex, toStoredPath(filePath), durationSeconds],
    );
  }

  public async getFlipbookCaptures(sessionId: string): Promise<FlipbookCaptures> {
    const [coversRes, videosRes] = await Promise.all([
      pool.query(
        `SELECT id, capture_index AS "captureIndex", file_path AS "filePath", is_selected AS "isSelected"
         FROM session_captures
         WHERE session_id = $1 AND is_cover = true
         ORDER BY capture_index ASC`,
        [sessionId],
      ),
      pool.query(
        `SELECT id, video_index AS "videoIndex", file_path AS "filePath", duration_seconds AS "durationSeconds", is_selected AS "isSelected"
         FROM session_videos
         WHERE session_id = $1
         ORDER BY video_index ASC`,
        [sessionId],
      ),
    ]);
    return {
      covers: coversRes.rows.map((row) => withResolvedFilePath(row)),
      videos: videosRes.rows.map((row) => withResolvedFilePath(row)),
    };
  }

  private async inTransaction<T>(work: (client: Queryable) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  public async recordFlipbookSelection(
    sessionId: string,
    coverIndex: number,
    videoIndex: number,
  ): Promise<void> {
    await this.inTransaction(async (client) => {
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
    });
  }

  /**
   * Resets session to cover_capture state on 2-minute GIF processing timeout recovery.
   */
  public async resetFlipbookToCoverCapture(sessionId: string): Promise<void> {
    await this.inTransaction(async (client) => {
      await client.query(`DELETE FROM session_captures WHERE session_id = $1 AND is_cover = true`, [
        sessionId,
      ]);
      await client.query(`DELETE FROM session_videos WHERE session_id = $1`, [sessionId]);
      await client.query(
        `UPDATE sessions SET state = 'cover_capture', last_activity_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [sessionId],
      );
    });
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
    return this.inTransaction(async (client) => {
      const outputRes = await client.query(
        `INSERT INTO generated_outputs (session_id, public_id, media_type, file_path, width, height)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [sessionId, publicId, mediaType, toStoredPath(filePath), width, height],
      );
      const outputId = outputRes.rows[0].id;
      await client.query(
        `INSERT INTO publication_records (output_id, public_id, status)
         VALUES ($1, $2, 'queued')
         ON CONFLICT (public_id) DO NOTHING`,
        [outputId, publicId],
      );
      await client.query(
        `UPDATE sessions SET state = 'booth_confirmed', last_activity_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [sessionId],
      );
      return outputId;
    });
  }

  public async getApprovedOutputByPublicId(publicId: string): Promise<OutputItem | null> {
    const res = await pool.query(
      `SELECT ${OUTPUT_FIELDS}
       FROM generated_outputs o
       JOIN sessions s ON o.session_id = s.id
       JOIN events e ON s.event_id = e.id
       WHERE o.public_id = $1 AND s.state IN ('booth_confirmed', 'printed')`,
      [publicId],
    );
    return withResolvedFilePath(res.rows[0]) ?? null;
  }

  public async listPublications(): Promise<PublicationRecord[]> {
    const result = await pool.query(`
      SELECT ${PUBLICATION_FIELDS}
      FROM publication_records p
      JOIN generated_outputs o ON o.id = p.output_id
      JOIN sessions s ON s.id = o.session_id
      JOIN events e ON e.id = s.event_id
      ORDER BY p.created_at DESC
    `);
    return result.rows;
  }

  public async getPublicationOutput(id: string): Promise<LocalPublicationOutput | null> {
    if (!isUuid(id)) return null;
    const result = await pool.query(
      `SELECT o.public_id AS "publicId", o.file_path AS "filePath", o.media_type AS "mediaType", o.session_id AS "sessionId"
       FROM publication_records p
       JOIN generated_outputs o ON o.id = p.output_id
       WHERE p.id = $1`,
      [id],
    );
    return withResolvedFilePath(result.rows[0]) ?? null;
  }

  public async retryPublication(id: string): Promise<PublicationRecord | null> {
    if (!isUuid(id)) return null;
    const result = await pool.query(
      `WITH requeued AS (
        UPDATE publication_records
        SET status = 'queued', retry_count = 0, last_attempt_at = NULL,
          next_attempt_at = CURRENT_TIMESTAMP, last_error = NULL
        WHERE id = $1 AND status = 'failed'
        RETURNING *
      )
      SELECT ${PUBLICATION_FIELDS}
      FROM requeued p
      JOIN generated_outputs o ON o.id = p.output_id
      JOIN sessions s ON s.id = o.session_id
      JOIN events e ON e.id = s.event_id`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  public async deleteLocalPublication(id: string): Promise<LocalPublicationOutput | null> {
    if (!isUuid(id)) return null;
    const result = await pool.query(
      `DELETE FROM generated_outputs o
       WHERE o.id = (
          SELECT output_id FROM publication_records WHERE id = $1 AND status <> 'in_progress'
       )
       AND NOT EXISTS (
         SELECT 1 FROM print_jobs j WHERE j.output_id = o.id
           AND j.status IN ('queued', 'submitting', 'pending', 'processing', 'stopped')
       )
       RETURNING public_id AS "publicId", file_path AS "filePath", media_type AS "mediaType"`,
      [id],
    );
    return withResolvedFilePath(result.rows[0]) ?? null;
  }

  public async removeCloudPublication(id: string): Promise<PublicationRecord | null> {
    if (!isUuid(id)) return null;
    const result = await pool.query(
      `WITH removed AS (
         UPDATE publication_records
         SET status = 'failed', cloud_finalized_at = NULL, cloudinary_url = NULL,
           cloudinary_public_id = NULL, expires_at = NULL, next_attempt_at = NULL, last_error = NULL
         WHERE id = $1 AND status = 'uploaded'
         RETURNING *
       )
       SELECT ${PUBLICATION_FIELDS}
       FROM removed p
       JOIN generated_outputs o ON o.id = p.output_id
       JOIN sessions s ON s.id = o.session_id
       JOIN events e ON e.id = s.event_id`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  /**
   * Atomically claims up to `limit` queued publications for upload, marking them in_progress.
   */
  public async claimQueuedPublications(
    limit: number,
    now: Date = new Date(),
  ): Promise<QueuedPublication[]> {
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
    if (claim.rows.length === 0) return [];
    const details = await pool.query(
      `SELECT p.id, p.public_id AS "publicId", o.file_path AS "filePath", o.media_type AS "mediaType",
          e.name AS "eventName", e.date::text AS "eventDate", s.copies_printed AS "copiesPrinted",
          p.retry_count AS "retryCount"
       FROM publication_records p
       JOIN generated_outputs o ON o.id = p.output_id
       JOIN sessions s ON s.id = o.session_id
       JOIN events e ON e.id = s.event_id
       WHERE p.id = ANY($1::uuid[])
       ORDER BY p.created_at`,
      [claim.rows.map((r) => r.id)],
    );
    return details.rows.map((row) => withResolvedFilePath(row));
  }

  public async markPublicationUploaded(
    id: string,
    cloudinaryUrl: string,
    cloudinaryPublicId: string,
    cloudFinalizedAt: Date,
    expiresAt: Date,
  ): Promise<boolean> {
    const result = await pool.query(
      `UPDATE publication_records
       SET status = 'uploaded', cloudinary_url = $2, cloudinary_public_id = $3,
         cloud_finalized_at = $4, expires_at = $5, next_attempt_at = NULL, last_error = NULL
       WHERE id = $1`,
      [id, cloudinaryUrl, cloudinaryPublicId, cloudFinalizedAt, expiresAt],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Records a failed upload attempt. A null nextAttemptAt is a dead-letter job.
   */
  public async markPublicationFailed(
    id: string,
    error: string,
    nextAttemptAt: Date | null,
  ): Promise<void> {
    await pool.query(
      `UPDATE publication_records
       SET status = CASE WHEN $3 IS NULL THEN 'failed' ELSE 'queued' END,
         retry_count = retry_count + 1,
         last_attempt_at = CURRENT_TIMESTAMP,
         next_attempt_at = $3,
         last_error = $2
       WHERE id = $1`,
      [id, error, nextAttemptAt],
    );
  }

  /** Requeues interrupted work and counts the interrupted attempt toward the dead-letter limit. */
  public async recoverStalledPublications(staleBefore: Date, maxAttempts: number): Promise<void> {
    await pool.query(
      `UPDATE publication_records
       SET retry_count = retry_count + 1,
         status = CASE WHEN retry_count + 1 >= $2 THEN 'failed' ELSE 'queued' END,
         next_attempt_at = CASE WHEN retry_count + 1 >= $2 THEN NULL ELSE CURRENT_TIMESTAMP END,
         last_error = 'Upload worker interrupted; job requeued.'
       WHERE status = 'in_progress' AND last_attempt_at < $1`,
      [staleBefore, maxAttempts],
    );
  }

  public async getLatestOutputForSession(sessionId: string): Promise<OutputItem | null> {
    if (!isUuid(sessionId)) return null;
    const res = await pool.query(
      `SELECT ${OUTPUT_FIELDS}
       FROM generated_outputs o
       JOIN sessions s ON o.session_id = s.id
       JOIN events e ON s.event_id = e.id
       WHERE o.session_id = $1
       ORDER BY o.created_at DESC
       LIMIT 1`,
      [sessionId],
    );
    return withResolvedFilePath(res.rows[0]) ?? null;
  }

  public async getOutputByPublicId(publicId: string): Promise<OutputItem | null> {
    const result = await pool.query(
      `SELECT ${OUTPUT_FIELDS}
       FROM generated_outputs o JOIN sessions s ON s.id = o.session_id JOIN events e ON e.id = s.event_id WHERE o.public_id = $1`,
      [publicId],
    );
    return withResolvedFilePath(result.rows[0]) ?? null;
  }

  public async createPrintJob(input: CreatePrintJobInput): Promise<PrintJob | null> {
    if (!input.rejectAfterInitialCompletion) return this.insertPrintJob(pool, input);
    return this.inTransaction(async (client) => {
      await client.query('SELECT id FROM sessions WHERE id = $1 FOR UPDATE', [
        input.output.sessionId,
      ]);
      const existing = await client.query<PrintJob>(
        `SELECT ${PRINT_JOB_FIELDS} FROM print_jobs WHERE request_key = $1`,
        [input.requestKey],
      );
      if (existing.rows[0]) return existing.rows[0];
      const completed = await client.query(
        `SELECT id FROM print_jobs
         WHERE session_id = $1 AND reprint_of_id IS NULL AND status = 'completed' LIMIT 1`,
        [input.output.sessionId],
      );
      if (completed.rows[0]) return null;
      return this.insertPrintJob(client, input);
    });
  }

  private async insertPrintJob(client: Queryable, input: CreatePrintJobInput): Promise<PrintJob> {
    const result = await client.query(
      `INSERT INTO print_jobs
        (output_id, session_id, request_key, artifact_path, artifact_type, public_id, output_type,
         printer_name, media_size, copies_requested, mode, reprint_of_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (request_key) DO UPDATE SET request_key = EXCLUDED.request_key
       RETURNING ${PRINT_JOB_FIELDS}`,
      [
        input.output.id,
        input.output.sessionId,
        input.requestKey,
        toStoredPath(input.artifactPath),
        input.artifactType,
        input.output.publicId,
        input.output.mediaType === 'image/png' ? 'photo_strip' : 'flipbook',
        input.printerName,
        input.mediaSize,
        input.copies,
        input.mode,
        input.reprintOfId ?? null,
      ],
    );
    return result.rows[0];
  }

  public async getPrintJob(id: string): Promise<PrintJob | null> {
    if (!isUuid(id)) return null;
    const result = await pool.query(`SELECT ${PRINT_JOB_FIELDS} FROM print_jobs WHERE id = $1`, [
      id,
    ]);
    return result.rows[0] ?? null;
  }

  public async getPrintJobArtifact(id: string): Promise<string | null> {
    if (!isUuid(id)) return null;
    const result = await pool.query<{ artifactPath: string }>(
      'SELECT artifact_path AS "artifactPath" FROM print_jobs WHERE id = $1',
      [id],
    );
    return resolveStoredPath(result.rows[0]?.artifactPath) ?? null;
  }

  public async listPrintJobs(limit: number, before?: Date): Promise<PrintJob[]> {
    const result = await pool.query(
      `SELECT ${PRINT_JOB_FIELDS} FROM print_jobs
       WHERE ($2::timestamptz IS NULL OR created_at < $2)
       ORDER BY CASE WHEN status IN ('queued','submitting','pending','processing','stopped','needs_attention') THEN 0 ELSE 1 END, created_at DESC
       LIMIT $1`,
      [limit, before ?? null],
    );
    return result.rows;
  }

  public async claimQueuedPrintJobs(limit: number): Promise<PrintJob[]> {
    const result = await pool.query(
      `WITH claimed AS (
        UPDATE print_jobs SET status = 'submitting', updated_at = CURRENT_TIMESTAMP
        WHERE id IN (SELECT id FROM print_jobs WHERE status = 'queued' ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED)
        RETURNING *
      ) SELECT ${PRINT_JOB_FIELDS} FROM claimed`,
      [limit],
    );
    return result.rows;
  }

  public async listActivePrintAttempts(): Promise<ActivePrintAttempt[]> {
    const result = await pool.query(
      `SELECT j.id, j.session_id AS "sessionId", j.output_id AS "outputId", j.public_id AS "publicId",
        j.output_type AS "outputType", j.artifact_type AS "artifactType", j.copies_requested AS "copiesRequested",
        j.copies_completed AS "copiesCompleted", GREATEST(j.copies_requested - j.copies_completed, 0) AS "copiesWaiting",
        j.printer_name AS "printerName", j.media_size AS "mediaSize", j.mode, j.status, j.last_error AS "lastError",
        j.created_at AS "createdAt", j.updated_at AS "updatedAt", a.id AS "attemptId", a.cups_job_id AS "cupsJobId"
       FROM print_jobs j JOIN print_job_attempts a ON a.print_job_id = j.id AND a.is_current
       WHERE j.status IN ('pending', 'processing', 'stopped')`,
    );
    return result.rows;
  }

  public async listSupersededPrintAttempts(): Promise<SupersededPrintAttempt[]> {
    const result = await pool.query(
      `SELECT print_job_id AS "jobId", id AS "attemptId", cups_job_id AS "cupsJobId"
       FROM print_job_attempts
       WHERE is_current = false AND cups_job_id IS NOT NULL AND state <> 'completed'`,
    );
    return result.rows;
  }

  public async createPrintAttempt(jobId: string): Promise<PrintJobAttempt> {
    const result = await pool.query(
      `WITH next_attempt AS (
        SELECT COALESCE(MAX(attempt_number), 0) + 1 AS number FROM print_job_attempts WHERE print_job_id = $1
      ), superseded AS (
        UPDATE print_job_attempts SET is_current = false, superseded_at = CURRENT_TIMESTAMP
        WHERE print_job_id = $1 AND is_current
      ) INSERT INTO print_job_attempts (print_job_id, attempt_number, title)
      SELECT $1, number, 'sic-print:' || $1 || ':' || number FROM next_attempt
      RETURNING id, print_job_id AS "printJobId", attempt_number AS "attemptNumber", title, cups_job_id AS "cupsJobId", state, error,
        is_current AS "isCurrent", superseded_at AS "supersededAt"`,
      [jobId],
    );
    return result.rows[0];
  }

  public async updatePrintAttempt(
    attemptId: string,
    state: PrintJobStatus,
    cupsJobId?: string,
    error?: string,
  ): Promise<void> {
    await pool.query(
      `UPDATE print_job_attempts SET state = $2, cups_job_id = COALESCE($3, cups_job_id), error = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [attemptId, state, cupsJobId ?? null, error ?? null],
    );
  }

  public async updatePrintJobStatus(
    id: string,
    status: PrintJobStatus,
    error?: string,
    expectedStatus?: PrintJobStatus,
  ): Promise<PrintJob | null> {
    const result = await pool.query(
      `UPDATE print_jobs SET status = $2, last_error = $3, last_reconciled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND ($4::text IS NULL OR status = $4) RETURNING ${PRINT_JOB_FIELDS}`,
      [id, status, error ?? null, expectedStatus ?? null],
    );
    return result.rows[0] ?? null;
  }

  public async getCurrentCupsJobId(id: string): Promise<string | null> {
    if (!isUuid(id)) return null;
    const result = await pool.query<{ cupsJobId: string | null }>(
      `SELECT cups_job_id AS "cupsJobId" FROM print_job_attempts
       WHERE print_job_id = $1 AND is_current`,
      [id],
    );
    return result.rows[0]?.cupsJobId ?? null;
  }

  public async cancelPrintJob(id: string): Promise<PrintJob | null> {
    if (!isUuid(id)) return null;
    const result = await pool.query(
      `UPDATE print_jobs SET status = 'canceled', last_error = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status IN ('queued', 'submitting', 'pending', 'processing', 'stopped')
       RETURNING ${PRINT_JOB_FIELDS}`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  public async retryPrintJob(id: string): Promise<PrintJob | null> {
    if (!isUuid(id)) return null;
    return this.inTransaction(async (client) => {
      const result = await client.query(
        `UPDATE print_jobs SET status = 'queued', last_error = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status IN ('failed', 'canceled', 'needs_attention')
         RETURNING ${PRINT_JOB_FIELDS}`,
        [id],
      );
      if (result.rows[0]) {
        await client.query(
          `UPDATE print_job_attempts SET is_current = false, superseded_at = CURRENT_TIMESTAMP
           WHERE print_job_id = $1 AND is_current`,
          [id],
        );
      }
      return result.rows[0] ?? null;
    });
  }

  public async reprintPrintJob(id: string, requestKey: string): Promise<PrintJob | null> {
    if (!isUuid(id)) return null;
    const result = await pool.query(
      `INSERT INTO print_jobs (output_id, session_id, request_key, artifact_path, artifact_type, public_id, output_type,
         printer_name, media_size, copies_requested, mode, reprint_of_id)
       SELECT output_id, session_id, $2, artifact_path, artifact_type, public_id, output_type,
         printer_name, media_size, copies_requested, mode, id FROM print_jobs WHERE id = $1 AND status = 'completed'
       RETURNING ${PRINT_JOB_FIELDS}`,
      [id, requestKey],
    );
    return result.rows[0] ?? null;
  }

  /** Completion and session accounting share one transaction, so repeated reconciliation is harmless. */
  public async completePrintJob(id: string, attemptId: string): Promise<PrintJob | null> {
    return this.inTransaction(async (client) => {
      const completed = await client.query(
        `UPDATE print_jobs SET status = 'completed', copies_completed = copies_requested,
          last_error = NULL, last_reconciled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1 AND status IN ('submitting', 'pending', 'processing', 'stopped')
            AND EXISTS (
              SELECT 1 FROM print_job_attempts
              WHERE id = $2 AND print_job_id = print_jobs.id AND is_current
            )
          RETURNING session_id, copies_requested`,
        [id, attemptId],
      );
      if (!completed.rows[0]) return null;
      await client.query(
        `UPDATE sessions SET is_printed = true, copies_printed = copies_printed + $2,
          state = 'printed', last_activity_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND state IN ('booth_confirmed', 'printed')`,
        [completed.rows[0].session_id, completed.rows[0].copies_requested],
      );
      const job = await client.query(`SELECT ${PRINT_JOB_FIELDS} FROM print_jobs WHERE id = $1`, [
        id,
      ]);
      return job.rows[0] ?? null;
    });
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

  public async listActiveTemplates(): Promise<TemplateItem[]> {
    const res = await pool.query(`
      ${this.templateSelectFields}
      WHERE t.is_active = true
      ORDER BY t.created_at ASC
    `);
    return res.rows.length > 0 ? res.rows : activeBuiltInTemplates();
  }

  public async getTemplateById(templateId: string): Promise<TemplateItem | null> {
    const res = isUuid(templateId)
      ? await pool.query(`${this.templateSelectFields} WHERE t.id = $1`, [templateId])
      : await pool.query(
          `${this.templateSelectFields} WHERE t.name ILIKE $1 ORDER BY t.created_at ASC, t.id ASC LIMIT 1`,
          [containsPattern(templateId)],
        );
    return res.rows[0] ?? findBuiltInTemplate(templateId);
  }

  private async insertTemplateChildren(
    client: Queryable,
    templateId: string,
    placements: TemplatePlacement[],
    overlays: TemplateOverlay[],
  ): Promise<void> {
    for (const p of placements) {
      await client.query(
        `INSERT INTO template_placements (
           template_id, capture_index, x, y, width, height, rotation, border_radius, z_index
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
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
    for (const o of overlays) {
      await client.query(
        `INSERT INTO template_overlays (
           template_id, label, asset_path, x, y, width, height, rotation, z_index
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          templateId,
          o.label,
          toStoredPath(o.assetPath) || '',
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
    return this.inTransaction(async (client) => {
      const templateRes = await client.query(
        `INSERT INTO templates (
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
           updated_at AS "updatedAt"`,
        [
          name,
          orientation,
          outputWidth,
          outputHeight,
          toStoredPath(backgroundPath),
          requiredCaptureCount,
          countdownSeconds,
        ],
      );
      const row = templateRes.rows[0];
      await this.insertTemplateChildren(client, row.id, placements, overlays);
      return { ...row, placements, overlays };
    });
  }

  /**
   * Updates template placements and overlays using transactional replace-all.
   */
  public async updateTemplateLayout(
    templateId: string,
    placements: TemplatePlacement[],
    overlays: TemplateOverlay[] = [],
  ): Promise<boolean> {
    if (!isUuid(templateId)) return false;
    return this.inTransaction(async (client) => {
      const updated = await client.query(
        'UPDATE templates SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [templateId],
      );
      if (!updated.rowCount) return false;
      await client.query('DELETE FROM template_placements WHERE template_id = $1', [templateId]);
      await client.query('DELETE FROM template_overlays WHERE template_id = $1', [templateId]);
      await this.insertTemplateChildren(client, templateId, placements, overlays);
      return true;
    });
  }

  /**
   * Associates a template with a Photo Strip session, saves an immutable snapshot,
   * and advances state to 'template_selected'.
   */
  public async selectTemplate(
    sessionId: string,
    template: TemplateItem,
  ): Promise<SessionData | null> {
    const snapshot = buildTemplateSnapshot(template);
    const dbTemplateId = isUuid(template.id) ? template.id : null;
    const res = await pool.query(
      `UPDATE sessions
       SET template_id = $2,
           template_snapshot = $3::jsonb,
           state = 'template_selected',
           last_activity_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING ${SESSION_RETURNING}`,
      [sessionId, dbTemplateId, JSON.stringify(snapshot)],
    );
    return res.rows[0] ?? null;
  }

  public async getPhotoCaptures(sessionId: string): Promise<CaptureItem[]> {
    const res = await pool.query(
      `SELECT
         id,
         session_id AS "sessionId",
         capture_index AS "captureIndex",
         file_path AS "filePath",
         is_cover AS "isCover",
         is_selected AS "isSelected",
         created_at AS "createdAt"
       FROM session_captures
       WHERE session_id = $1 AND is_cover = false AND is_selected = true
       ORDER BY capture_index ASC`,
      [sessionId],
    );
    return res.rows.map((row) => withResolvedFilePath(row));
  }

  /**
   * Records print status for a confirmed session and transitions state to 'printed'.
   */
  public async recordPrintStatus(
    sessionId: string,
    copiesPrinted: number,
  ): Promise<SessionData | null> {
    if (!isUuid(sessionId)) return null;
    const res = await pool.query(
      `UPDATE sessions
       SET is_printed = true,
           copies_printed = copies_printed + $2,
           state = 'printed',
           last_activity_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND (state = 'booth_confirmed' OR state = 'printed')
       RETURNING ${SESSION_RETURNING}`,
      [sessionId, copiesPrinted],
    );
    return res.rows[0] ?? null;
  }

  /**
   * Aggregates and calculates full KPI & analytics metrics across sessions.
   */
  public async getAnalyticsData(filters: AnalyticsFilters = {}): Promise<AnalyticsData> {
    const { eventId, startDate, endDate } = filters;
    if (eventId && !isUuid(eventId)) return buildAnalyticsData([]);
    const startIso = startDate ? new Date(startDate).toISOString() : null;
    const endIso = endDate ? new Date(endDate).toISOString() : null;
    const res = await pool.query<AnalyticsSessionRow>(
      `SELECT
         s.id,
         s.event_id AS "eventId",
         s.type,
         s.state,
         s.template_id AS "templateId",
         s.frame_id AS "frameId",
         s.template_snapshot AS "templateSnapshot",
         s.is_printed AS "isPrinted",
         s.copies_printed AS "copiesPrinted",
         s.created_at AS "createdAt",
         COALESCE(t.name, s.template_snapshot->>'name') AS "templateName",
         t.type AS "templateType"
       FROM sessions s
       LEFT JOIN templates t ON s.template_id = t.id
       WHERE s.state IN ('booth_confirmed', 'printed')
         AND ($1::UUID IS NULL OR s.event_id = $1::UUID)
         AND ($2::TIMESTAMPTZ IS NULL OR s.created_at >= $2::TIMESTAMPTZ)
         AND ($3::TIMESTAMPTZ IS NULL OR s.created_at <= $3::TIMESTAMPTZ)
       ORDER BY s.created_at ASC`,
      [eventId || null, startIso, endIso],
    );
    return buildAnalyticsData(res.rows);
  }
}

export const dbRepository = new DatabaseRepository();
