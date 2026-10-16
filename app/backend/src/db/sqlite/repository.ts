/**
 * SQLite implementation of the core repository contract.
 *
 * better-sqlite3 is synchronous; every method still returns a Promise so the
 * contract (and its callers) stay engine-neutral. Multi-statement writes run in
 * short `BEGIN IMMEDIATE` transactions and never span network, printer, or
 * filesystem work.
 */
import type { SessionType } from '@photobooth/public-output';
import type { SessionData, SessionState } from '../../services/session-state-machine.js';
import { resolveStoredPath, toStoredPath, withResolvedFilePath } from '../../services/storage-paths.js';
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
  PublicationStatus,
  QueuedPublication,
  SupersededPrintAttempt,
  TemplateItem,
  TemplateOverlay,
  TemplatePlacement,
} from '../contracts.js';
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
} from '../shared.js';
import type { SqliteDatabase } from './connection.js';
import {
  fromBool,
  fromJson,
  fromTimestamp,
  immediate,
  newId,
  nowTimestamp,
  registerSqliteFunctions,
  toJson,
  toTimestamp,
} from './mappers.js';

type Row = Record<string, unknown>;

const ACTIVE_PRINT_STATUSES = `('queued', 'submitting', 'pending', 'processing', 'stopped')`;

const SESSION_COLUMNS = `id, token, event_id, type, state, template_id, frame_id, template_snapshot,
  retake_count, is_printed, copies_printed, created_at, last_activity_at, cancelled_at`;

const PRINT_JOB_COLUMNS = `id, session_id, output_id, public_id, output_type, artifact_type,
  copies_requested, copies_completed, printer_name, media_size, mode, status, last_error,
  created_at, updated_at`;

const PUBLICATION_SELECT = `
  SELECT p.id, p.public_id, p.status, p.retry_count, p.last_attempt_at, p.next_attempt_at,
    p.last_error, p.cloud_finalized_at, p.cloudinary_url, p.cloudinary_public_id, p.expires_at,
    p.created_at, o.media_type, e.name AS event_name, e.date AS event_date
  FROM publication_records p
  JOIN generated_outputs o ON o.id = p.output_id
  JOIN sessions s ON s.id = o.session_id
  JOIN events e ON e.id = s.event_id`;

const OUTPUT_SELECT = `
  SELECT o.id, o.session_id, o.public_id, o.media_type, o.file_path, o.width, o.height,
    o.created_at, e.name AS event_name, e.date AS event_date
  FROM generated_outputs o
  JOIN sessions s ON s.id = o.session_id
  JOIN events e ON e.id = s.event_id`;

function mapEvent(row: Row, includeDescription = true): EventData {
  return {
    id: row.id as string,
    name: row.name as string,
    ...(includeDescription ? { description: (row.description as string | null) ?? null } : {}),
    date: row.date as string,
    operatorName: row.operator_name as string,
    createdAt: fromTimestamp(row.created_at as string),
  };
}

function mapSession(row: Row): SessionData {
  return {
    id: row.id as string,
    token: row.token as string,
    eventId: row.event_id as string,
    type: row.type as SessionType,
    state: row.state as SessionState,
    templateId: (row.template_id as string | null) ?? null,
    frameId: (row.frame_id as string | null) ?? null,
    templateSnapshot: fromJson<Record<string, unknown>>(row.template_snapshot as string | null),
    retakeCount: row.retake_count as number,
    isPrinted: fromBool(row.is_printed as number),
    copiesPrinted: row.copies_printed as number,
    createdAt: fromTimestamp(row.created_at as string),
    lastActivityAt: fromTimestamp(row.last_activity_at as string),
    cancelledAt: fromTimestamp(row.cancelled_at as string | null),
  };
}

function mapFrame(row: Row): FrameItem {
  return {
    id: row.id as string,
    name: row.name as string,
    overlayPath: row.overlay_path as string,
    isActive: fromBool(row.is_active as number),
  };
}

function mapOutput(row: Row): OutputItem {
  return withResolvedFilePath({
    id: row.id as string,
    sessionId: row.session_id as string,
    publicId: row.public_id as string,
    mediaType: row.media_type as string,
    filePath: row.file_path as string,
    width: row.width as number,
    height: row.height as number,
    createdAt: fromTimestamp(row.created_at as string),
    eventName: row.event_name as string,
    eventDate: row.event_date as string,
  });
}

function mapPublication(row: Row): PublicationRecord {
  return {
    id: row.id as string,
    publicId: row.public_id as string,
    status: row.status as PublicationStatus,
    retryCount: row.retry_count as number,
    lastAttemptAt: fromTimestamp(row.last_attempt_at as string | null),
    nextAttemptAt: fromTimestamp(row.next_attempt_at as string | null),
    lastError: (row.last_error as string | null) ?? null,
    cloudFinalizedAt: fromTimestamp(row.cloud_finalized_at as string | null),
    cloudinaryUrl: (row.cloudinary_url as string | null) ?? null,
    cloudinaryPublicId: (row.cloudinary_public_id as string | null) ?? null,
    expiresAt: fromTimestamp(row.expires_at as string | null),
    createdAt: fromTimestamp(row.created_at as string),
    mediaType: row.media_type as string,
    eventName: row.event_name as string,
    eventDate: row.event_date as string,
  };
}

function mapPrintJob(row: Row): PrintJob {
  const requested = row.copies_requested as number;
  const completed = row.copies_completed as number;
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    outputId: (row.output_id as string | null) ?? null,
    publicId: row.public_id as string,
    outputType: row.output_type as PrintJob['outputType'],
    artifactType: row.artifact_type as PrintJob['artifactType'],
    copiesRequested: requested,
    copiesCompleted: completed,
    copiesWaiting: Math.max(requested - completed, 0),
    printerName: row.printer_name as string,
    mediaSize: row.media_size as string,
    mode: row.mode as PrintJob['mode'],
    status: row.status as PrintJobStatus,
    lastError: (row.last_error as string | null) ?? null,
    createdAt: fromTimestamp(row.created_at as string),
    updatedAt: fromTimestamp(row.updated_at as string),
  };
}

function mapPrintAttempt(row: Row): PrintJobAttempt {
  return {
    id: row.id as string,
    printJobId: row.print_job_id as string,
    attemptNumber: row.attempt_number as number,
    title: row.title as string,
    cupsJobId: (row.cups_job_id as string | null) ?? null,
    state: row.state as PrintJobStatus,
    error: (row.error as string | null) ?? null,
    isCurrent: fromBool(row.is_current as number),
    supersededAt: fromTimestamp(row.superseded_at as string | null),
  };
}

export class SqliteDatabaseRepository implements CoreRepository {
  constructor(private readonly db: SqliteDatabase) {
    registerSqliteFunctions(db);
  }

  private get<T extends Row = Row>(sql: string, ...params: unknown[]): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  private all<T extends Row = Row>(sql: string, ...params: unknown[]): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  private run(sql: string, ...params: unknown[]): number {
    return this.db.prepare(sql).run(...params).changes;
  }

  private sessionRow(id: string): SessionData | null {
    const row = this.get(`SELECT ${SESSION_COLUMNS} FROM sessions WHERE id = ?`, id);
    return row ? mapSession(row) : null;
  }

  private printJobRow(id: string): PrintJob | null {
    const row = this.get(`SELECT ${PRINT_JOB_COLUMNS} FROM print_jobs WHERE id = ?`, id);
    return row ? mapPrintJob(row) : null;
  }

  private publicationRow(id: string): PublicationRecord | null {
    const row = this.get(`${PUBLICATION_SELECT} WHERE p.id = ?`, id);
    return row ? mapPublication(row) : null;
  }

  /** Updates one session and returns it, or null when `where` matched nothing. */
  private updateSession(sessionId: string, set: string, where: string, ...params: unknown[]) {
    return immediate(this.db, () => {
      const changed = this.run(`UPDATE sessions SET ${set} WHERE id = ? ${where}`, ...params, sessionId);
      return changed > 0 ? this.sessionRow(sessionId) : null;
    });
  }

  public async listEvents(): Promise<EventData[]> {
    return this.all(
      `SELECT id, name, description, date, operator_name, created_at FROM events
       ORDER BY date DESC, casefold(name) ASC, name ASC`,
    ).map((row) => mapEvent(row));
  }

  public async getEventById(id: string): Promise<EventData | null> {
    const row = this.get(
      'SELECT id, name, description, date, operator_name, created_at FROM events WHERE id = ?',
      id,
    );
    return row ? mapEvent(row) : null;
  }

  public async createEvent(
    name: string,
    date: string,
    operatorName: string,
    description?: string,
  ): Promise<EventData> {
    const event = { id: newId(), createdAt: nowTimestamp() };
    this.run(
      `INSERT INTO events (id, name, description, date, operator_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      event.id,
      name,
      description || null,
      date,
      operatorName,
      event.createdAt,
    );
    return (await this.getEventById(event.id))!;
  }

  public async deleteEvent(id: string): Promise<boolean> {
    return this.run('DELETE FROM events WHERE id = ?', id) > 0;
  }

  public async getOrCreateEvent(
    name: string,
    date: string,
    operatorName: string,
  ): Promise<EventData> {
    const row = this.get(
      `INSERT INTO events (id, name, date, operator_name, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (name, date) DO UPDATE SET operator_name = excluded.operator_name
       RETURNING id, name, date, operator_name, created_at`,
      newId(),
      name,
      date,
      operatorName,
      nowTimestamp(),
    )!;
    return mapEvent(row, false);
  }

  public async createSession(
    eventId: string,
    type: SessionType,
    token: string,
  ): Promise<SessionData> {
    const id = newId();
    const now = nowTimestamp();
    this.run(
      `INSERT INTO sessions (id, token, event_id, type, state, created_at, last_activity_at)
       VALUES (?, ?, ?, ?, 'created', ?, ?)`,
      id,
      token,
      eventId,
      type,
      now,
      now,
    );
    return this.sessionRow(id)!;
  }

  public async getSessionById(sessionId: string): Promise<SessionData | null> {
    return this.sessionRow(sessionId);
  }

  public async updateSessionState(
    sessionId: string,
    state: SessionState,
  ): Promise<SessionData | null> {
    return this.updateSession(sessionId, 'state = ?, last_activity_at = ?', '', state, nowTimestamp());
  }

  public async cancelSession(sessionId: string): Promise<SessionData | null> {
    const now = nowTimestamp();
    return this.updateSession(
      sessionId,
      `state = 'cancelled', cancelled_at = ?, last_activity_at = ?`,
      `AND state NOT IN ('booth_confirmed', 'printed', 'cancelled')`,
      now,
      now,
    );
  }

  public async listActiveFrames(): Promise<FrameItem[]> {
    const rows = this.all(
      `SELECT id, name, overlay_path, is_active FROM frames WHERE is_active = 1
       ORDER BY created_at ASC, rowid ASC`,
    );
    return rows.length > 0 ? rows.map((row) => withDefaultFramePlacements(mapFrame(row))) : builtInFrames();
  }

  public async getFrameById(frameId: string): Promise<FrameItem | null> {
    const row = isUuid(frameId)
      ? this.get('SELECT id, name, overlay_path, is_active FROM frames WHERE id = ?', frameId)
      : this.get(
          `SELECT id, name, overlay_path, is_active FROM frames
           WHERE instr(casefold(name), casefold(@term)) > 0 OR instr(casefold(overlay_path), casefold(@term)) > 0
           ORDER BY created_at ASC, rowid ASC
           LIMIT 1`,
          { term: frameId },
        );
    return row ? withDefaultFramePlacements(mapFrame(row)) : findBuiltInFrame(frameId);
  }

  public async createFrame(name: string, overlayPath: string): Promise<FrameItem> {
    const id = newId();
    const now = nowTimestamp();
    this.run(
      `INSERT INTO frames (id, name, overlay_path, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)`,
      id,
      name,
      overlayPath,
      now,
      now,
    );
    return { id, name, overlayPath, isActive: true };
  }

  public async setSessionFrame(
    sessionId: string,
    frameId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy template/frame union
    resolvedTemplate?: any,
  ): Promise<SessionData | null> {
    const snapshot = buildFlipbookSnapshot(frameId, resolvedTemplate);
    // Non-UUID ids never match a stored row, mirroring the legacy regex guard.
    const candidate = isUuid(frameId) ? frameId.toLowerCase() : null;
    return immediate(this.db, () => {
      const changed = this.run(
        `UPDATE sessions
         SET template_id = (SELECT id FROM templates WHERE id = @candidate),
           frame_id = (SELECT id FROM frames WHERE id = @candidate),
           template_snapshot = @snapshot,
           state = 'frame_selected',
           last_activity_at = @now
         WHERE id = @sessionId`,
        { candidate, snapshot: toJson(snapshot), now: nowTimestamp(), sessionId },
      );
      return changed > 0 ? this.sessionRow(sessionId) : null;
    });
  }

  public async saveCoverCapture(
    sessionId: string,
    captureIndex: number,
    filePath: string,
  ): Promise<void> {
    // The legacy `ON CONFLICT DO NOTHING` had no unique target to hit; a plain insert matches it.
    this.run(
      `INSERT INTO session_captures (id, session_id, capture_index, file_path, is_cover, is_selected, created_at)
       VALUES (?, ?, ?, ?, 1, 0, ?)`,
      newId(),
      sessionId,
      captureIndex,
      toStoredPath(filePath),
      nowTimestamp(),
    );
  }

  public async savePhotoCapture(
    sessionId: string,
    captureIndex: number,
    filePath: string,
    isRetake: boolean = false,
  ): Promise<{ captureCount: number; retakeCount: number }> {
    const storedPath = toStoredPath(filePath);
    return immediate(this.db, () => {
      const now = nowTimestamp();
      let retakeCount: number;
      if (isRetake) {
        const updated = this.get<{ retake_count: number }>(
          `UPDATE sessions SET retake_count = retake_count + 1, last_activity_at = ?
           WHERE id = ? AND retake_count < 4 RETURNING retake_count`,
          now,
          sessionId,
        );
        if (!updated) throw new Error('Maximum retake limit of 4 reached for this session');
        retakeCount = updated.retake_count;
        const replaced = this.run(
          `UPDATE session_captures SET file_path = ?, created_at = ?
           WHERE session_id = ? AND capture_index = ? AND is_cover = 0`,
          storedPath,
          now,
          sessionId,
          captureIndex,
        );
        if (replaced === 0) this.insertPhotoCapture(sessionId, captureIndex, storedPath, now);
      } else {
        this.run(
          'DELETE FROM session_captures WHERE session_id = ? AND capture_index = ? AND is_cover = 0',
          sessionId,
          captureIndex,
        );
        this.insertPhotoCapture(sessionId, captureIndex, storedPath, now);
        retakeCount =
          this.get<{ retake_count: number }>('SELECT retake_count FROM sessions WHERE id = ?', sessionId)
            ?.retake_count ?? 0;
      }
      const captureCount = this.get<{ count: number }>(
        'SELECT COUNT(DISTINCT capture_index) AS count FROM session_captures WHERE session_id = ? AND is_cover = 0',
        sessionId,
      )!.count;
      return { retakeCount, captureCount };
    });
  }

  private insertPhotoCapture(sessionId: string, captureIndex: number, filePath: string, now: string) {
    this.run(
      `INSERT INTO session_captures (id, session_id, capture_index, file_path, is_cover, is_selected, created_at)
       VALUES (?, ?, ?, ?, 0, 1, ?)`,
      newId(),
      sessionId,
      captureIndex,
      filePath,
      now,
    );
  }

  public async saveVideoCapture(
    sessionId: string,
    videoIndex: number,
    filePath: string,
    durationSeconds: number = 6.0,
  ): Promise<void> {
    this.run(
      `INSERT INTO session_videos (id, session_id, video_index, file_path, duration_seconds, is_selected, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
      newId(),
      sessionId,
      videoIndex,
      toStoredPath(filePath),
      durationSeconds,
      nowTimestamp(),
    );
  }

  public async getFlipbookCaptures(sessionId: string): Promise<FlipbookCaptures> {
    const covers = this.all(
      `SELECT id, capture_index, file_path, is_selected FROM session_captures
       WHERE session_id = ? AND is_cover = 1 ORDER BY capture_index ASC, rowid ASC`,
      sessionId,
    ).map((row) =>
      withResolvedFilePath({
        id: row.id as string,
        captureIndex: row.capture_index as number,
        filePath: row.file_path as string,
        isSelected: fromBool(row.is_selected as number),
      }),
    );
    const videos = this.all(
      `SELECT id, video_index, file_path, duration_seconds, is_selected FROM session_videos
       WHERE session_id = ? ORDER BY video_index ASC, rowid ASC`,
      sessionId,
    ).map((row) =>
      withResolvedFilePath({
        id: row.id as string,
        videoIndex: row.video_index as number,
        filePath: row.file_path as string,
        durationSeconds: row.duration_seconds as number,
        isSelected: fromBool(row.is_selected as number),
      }),
    );
    return { covers, videos };
  }

  public async recordFlipbookSelection(
    sessionId: string,
    coverIndex: number,
    videoIndex: number,
  ): Promise<void> {
    immediate(this.db, () => {
      this.run(
        'UPDATE session_captures SET is_selected = (capture_index = ?) WHERE session_id = ? AND is_cover = 1',
        coverIndex,
        sessionId,
      );
      this.run(
        'UPDATE session_videos SET is_selected = (video_index = ?) WHERE session_id = ?',
        videoIndex,
        sessionId,
      );
      this.run(
        `UPDATE sessions SET state = 'processing', last_activity_at = ? WHERE id = ?`,
        nowTimestamp(),
        sessionId,
      );
    });
  }

  public async resetFlipbookToCoverCapture(sessionId: string): Promise<void> {
    immediate(this.db, () => {
      this.run('DELETE FROM session_captures WHERE session_id = ? AND is_cover = 1', sessionId);
      this.run('DELETE FROM session_videos WHERE session_id = ?', sessionId);
      this.run(
        `UPDATE sessions SET state = 'cover_capture', last_activity_at = ? WHERE id = ?`,
        nowTimestamp(),
        sessionId,
      );
    });
  }

  public async saveGeneratedOutput(
    sessionId: string,
    publicId: string,
    mediaType: 'image/png' | 'image/gif',
    filePath: string,
    width: number,
    height: number,
  ): Promise<string> {
    const storedPath = toStoredPath(filePath);
    return immediate(this.db, () => {
      const outputId = newId();
      const now = nowTimestamp();
      this.run(
        `INSERT INTO generated_outputs (id, session_id, public_id, media_type, file_path, width, height, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        outputId,
        sessionId,
        publicId,
        mediaType,
        storedPath,
        width,
        height,
        now,
      );
      this.run(
        // next_attempt_at mirrors the legacy `DEFAULT CURRENT_TIMESTAMP`: due immediately.
        `INSERT INTO publication_records (id, output_id, public_id, status, retry_count, next_attempt_at, created_at)
         VALUES (?, ?, ?, 'queued', 0, ?, ?)
         ON CONFLICT (public_id) DO NOTHING`,
        newId(),
        outputId,
        publicId,
        now,
        now,
      );
      this.run(
        `UPDATE sessions SET state = 'booth_confirmed', last_activity_at = ? WHERE id = ?`,
        now,
        sessionId,
      );
      return outputId;
    });
  }

  public async getApprovedOutputByPublicId(publicId: string): Promise<OutputItem | null> {
    const row = this.get(
      `${OUTPUT_SELECT} WHERE o.public_id = ? AND s.state IN ('booth_confirmed', 'printed')`,
      publicId,
    );
    return row ? mapOutput(row) : null;
  }

  public async getLatestOutputForSession(sessionId: string): Promise<OutputItem | null> {
    const row = this.get(
      `${OUTPUT_SELECT} WHERE o.session_id = ? ORDER BY o.created_at DESC, o.rowid DESC LIMIT 1`,
      sessionId,
    );
    return row ? mapOutput(row) : null;
  }

  public async getOutputByPublicId(publicId: string): Promise<OutputItem | null> {
    const row = this.get(`${OUTPUT_SELECT} WHERE o.public_id = ?`, publicId);
    return row ? mapOutput(row) : null;
  }

  public async listPublications(): Promise<PublicationRecord[]> {
    return this.all(`${PUBLICATION_SELECT} ORDER BY p.created_at DESC, p.rowid DESC`).map(
      mapPublication,
    );
  }

  public async getPublicationOutput(id: string): Promise<LocalPublicationOutput | null> {
    const row = this.get(
      `SELECT o.public_id, o.file_path, o.media_type, o.session_id
       FROM publication_records p JOIN generated_outputs o ON o.id = p.output_id
       WHERE p.id = ?`,
      id,
    );
    return row
      ? withResolvedFilePath({
          publicId: row.public_id as string,
          filePath: row.file_path as string,
          mediaType: row.media_type as string,
          sessionId: row.session_id as string,
        })
      : null;
  }

  public async retryPublication(id: string): Promise<PublicationRecord | null> {
    return immediate(this.db, () => {
      const changed = this.run(
        `UPDATE publication_records
         SET status = 'queued', retry_count = 0, last_attempt_at = NULL, next_attempt_at = ?, last_error = NULL
         WHERE id = ? AND status = 'failed'`,
        nowTimestamp(),
        id,
      );
      return changed > 0 ? this.publicationRow(id) : null;
    });
  }

  public async deleteLocalPublication(id: string): Promise<LocalPublicationOutput | null> {
    const row = this.get(
      `DELETE FROM generated_outputs
       WHERE id = (SELECT output_id FROM publication_records WHERE id = ? AND status <> 'in_progress')
         AND NOT EXISTS (
           SELECT 1 FROM print_jobs j WHERE j.output_id = generated_outputs.id
             AND j.status IN ${ACTIVE_PRINT_STATUSES}
         )
       RETURNING public_id, file_path, media_type`,
      id,
    );
    return row
      ? withResolvedFilePath({
          publicId: row.public_id as string,
          filePath: row.file_path as string,
          mediaType: row.media_type as string,
        })
      : null;
  }

  public async removeCloudPublication(id: string): Promise<PublicationRecord | null> {
    return immediate(this.db, () => {
      const changed = this.run(
        `UPDATE publication_records
         SET status = 'failed', cloud_finalized_at = NULL, cloudinary_url = NULL,
           cloudinary_public_id = NULL, expires_at = NULL, next_attempt_at = NULL, last_error = NULL
         WHERE id = ? AND status = 'uploaded'`,
        id,
      );
      return changed > 0 ? this.publicationRow(id) : null;
    });
  }

  /**
   * Replaces `FOR UPDATE SKIP LOCKED`: one IMMEDIATE transaction selects due
   * jobs, flips only rows still `queued`, and reads the claimed details before
   * commit, so two workers can never claim the same publication.
   */
  public async claimQueuedPublications(
    limit: number,
    now: Date = new Date(),
  ): Promise<QueuedPublication[]> {
    return immediate(this.db, () => {
      const due = this.all<{ id: string }>(
        `SELECT q.id FROM publication_records q
         JOIN generated_outputs o ON o.id = q.output_id
         WHERE q.status = 'queued' AND q.next_attempt_at <= ?
         ORDER BY q.created_at, q.rowid
         LIMIT ?`,
        toTimestamp(now),
        limit,
      );
      const attemptedAt = nowTimestamp();
      const claim = this.db.prepare(
        `UPDATE publication_records SET status = 'in_progress', last_attempt_at = ?
         WHERE id = ? AND status = 'queued'`,
      );
      const details = this.db.prepare(
        `SELECT p.id, p.public_id, o.file_path, o.media_type, e.name AS event_name, e.date AS event_date,
           s.copies_printed, p.retry_count
         FROM publication_records p
         JOIN generated_outputs o ON o.id = p.output_id
         JOIN sessions s ON s.id = o.session_id
         JOIN events e ON e.id = s.event_id
         WHERE p.id = ?`,
      );
      const claimed: QueuedPublication[] = [];
      for (const { id } of due) {
        if (claim.run(attemptedAt, id).changes === 0) continue;
        const row = details.get(id) as Row;
        claimed.push(
          withResolvedFilePath({
            id,
            publicId: row.public_id as string,
            filePath: row.file_path as string,
            mediaType: row.media_type as string,
            eventName: row.event_name as string,
            eventDate: row.event_date as string,
            copiesPrinted: row.copies_printed as number,
            retryCount: row.retry_count as number,
          }),
        );
      }
      return claimed;
    });
  }

  public async markPublicationUploaded(
    id: string,
    cloudinaryUrl: string,
    cloudinaryPublicId: string,
    cloudFinalizedAt: Date,
    expiresAt: Date,
  ): Promise<boolean> {
    return (
      this.run(
        `UPDATE publication_records
         SET status = 'uploaded', cloudinary_url = ?, cloudinary_public_id = ?,
           cloud_finalized_at = ?, expires_at = ?, next_attempt_at = NULL, last_error = NULL
         WHERE id = ?`,
        cloudinaryUrl,
        cloudinaryPublicId,
        toTimestamp(cloudFinalizedAt),
        toTimestamp(expiresAt),
        id,
      ) > 0
    );
  }

  public async markPublicationFailed(
    id: string,
    error: string,
    nextAttemptAt: Date | null,
  ): Promise<void> {
    const next = toTimestamp(nextAttemptAt);
    this.run(
      `UPDATE publication_records
       SET status = CASE WHEN @next IS NULL THEN 'failed' ELSE 'queued' END,
         retry_count = retry_count + 1,
         last_attempt_at = @now,
         next_attempt_at = @next,
         last_error = @error
       WHERE id = @id`,
      { next, now: nowTimestamp(), error, id },
    );
  }

  public async recoverStalledPublications(staleBefore: Date, maxAttempts: number): Promise<void> {
    this.run(
      `UPDATE publication_records
       SET retry_count = retry_count + 1,
         status = CASE WHEN retry_count + 1 >= @maxAttempts THEN 'failed' ELSE 'queued' END,
         next_attempt_at = CASE WHEN retry_count + 1 >= @maxAttempts THEN NULL ELSE @now END,
         last_error = 'Upload worker interrupted; job requeued.'
       WHERE status = 'in_progress' AND last_attempt_at < @staleBefore`,
      { staleBefore: toTimestamp(staleBefore), maxAttempts, now: nowTimestamp() },
    );
  }

  public async createPrintJob(input: CreatePrintJobInput): Promise<PrintJob | null> {
    return immediate(this.db, () => {
      const existing = this.get<{ id: string }>(
        'SELECT id FROM print_jobs WHERE request_key = ?',
        input.requestKey,
      );
      if (existing) return this.printJobRow(existing.id);
      if (input.rejectAfterInitialCompletion) {
        const completed = this.get(
          `SELECT id FROM print_jobs
           WHERE session_id = ? AND reprint_of_id IS NULL AND status = 'completed' LIMIT 1`,
          input.output.sessionId,
        );
        if (completed) return null;
      }
      const id = newId();
      const now = nowTimestamp();
      this.run(
        `INSERT INTO print_jobs
          (id, output_id, session_id, request_key, artifact_path, artifact_type, public_id, output_type,
           printer_name, media_size, copies_requested, mode, reprint_of_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
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
        now,
        now,
      );
      return this.printJobRow(id);
    });
  }

  public async getPrintJob(id: string): Promise<PrintJob | null> {
    return this.printJobRow(id);
  }

  public async getPrintJobArtifact(id: string): Promise<string | null> {
    const row = this.get<{ artifact_path: string }>(
      'SELECT artifact_path FROM print_jobs WHERE id = ?',
      id,
    );
    return resolveStoredPath(row?.artifact_path) ?? null;
  }

  public async listPrintJobs(limit: number, before?: Date): Promise<PrintJob[]> {
    return this.all(
      `SELECT ${PRINT_JOB_COLUMNS} FROM print_jobs
       WHERE (@before IS NULL OR created_at < @before)
       ORDER BY CASE WHEN status IN ('queued','submitting','pending','processing','stopped','needs_attention') THEN 0 ELSE 1 END,
         created_at DESC, rowid DESC
       LIMIT @limit`,
      { before: toTimestamp(before), limit },
    ).map(mapPrintJob);
  }

  /** Atomic print claim: see `claimQueuedPublications`. */
  public async claimQueuedPrintJobs(limit: number): Promise<PrintJob[]> {
    return immediate(this.db, () => {
      const due = this.all<{ id: string }>(
        `SELECT id FROM print_jobs WHERE status = 'queued' ORDER BY created_at, rowid LIMIT ?`,
        limit,
      );
      const now = nowTimestamp();
      const claim = this.db.prepare(
        `UPDATE print_jobs SET status = 'submitting', updated_at = ? WHERE id = ? AND status = 'queued'`,
      );
      return due
        .filter(({ id }) => claim.run(now, id).changes > 0)
        .map(({ id }) => this.printJobRow(id)!);
    });
  }

  public async listActivePrintAttempts(): Promise<ActivePrintAttempt[]> {
    return this.all(
      `SELECT j.id, j.session_id, j.output_id, j.public_id, j.output_type, j.artifact_type,
         j.copies_requested, j.copies_completed, j.printer_name, j.media_size, j.mode, j.status,
         j.last_error, j.created_at, j.updated_at, a.id AS attempt_id, a.cups_job_id
       FROM print_jobs j JOIN print_job_attempts a ON a.print_job_id = j.id AND a.is_current = 1
       WHERE j.status IN ('pending', 'processing', 'stopped')`,
    ).map((row) => ({
      ...mapPrintJob(row),
      attemptId: row.attempt_id as string,
      cupsJobId: (row.cups_job_id as string | null) ?? null,
    }));
  }

  public async listSupersededPrintAttempts(): Promise<SupersededPrintAttempt[]> {
    return this.all(
      `SELECT print_job_id, id, cups_job_id FROM print_job_attempts
       WHERE is_current = 0 AND cups_job_id IS NOT NULL AND state <> 'completed'`,
    ).map((row) => ({
      jobId: row.print_job_id as string,
      attemptId: row.id as string,
      cupsJobId: row.cups_job_id as string,
    }));
  }

  public async createPrintAttempt(jobId: string): Promise<PrintJobAttempt> {
    return immediate(this.db, () => {
      const now = nowTimestamp();
      const { number } = this.get<{ number: number }>(
        'SELECT COALESCE(MAX(attempt_number), 0) + 1 AS number FROM print_job_attempts WHERE print_job_id = ?',
        jobId,
      )!;
      this.run(
        `UPDATE print_job_attempts SET is_current = 0, superseded_at = ?
         WHERE print_job_id = ? AND is_current = 1`,
        now,
        jobId,
      );
      const row = this.get(
        `INSERT INTO print_job_attempts (id, print_job_id, attempt_number, title, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         RETURNING id, print_job_id, attempt_number, title, cups_job_id, state, error, is_current, superseded_at`,
        newId(),
        jobId,
        number,
        `sic-print:${jobId}:${number}`,
        now,
        now,
      )!;
      return mapPrintAttempt(row);
    });
  }

  public async updatePrintAttempt(
    attemptId: string,
    state: PrintJobStatus,
    cupsJobId?: string,
    error?: string,
  ): Promise<void> {
    this.run(
      `UPDATE print_job_attempts SET state = ?, cups_job_id = COALESCE(?, cups_job_id), error = ?, updated_at = ?
       WHERE id = ?`,
      state,
      cupsJobId ?? null,
      error ?? null,
      nowTimestamp(),
      attemptId,
    );
  }

  public async updatePrintJobStatus(
    id: string,
    status: PrintJobStatus,
    error?: string,
    expectedStatus?: PrintJobStatus,
  ): Promise<PrintJob | null> {
    return immediate(this.db, () => {
      const now = nowTimestamp();
      const changed = this.run(
        `UPDATE print_jobs SET status = @status, last_error = @error, last_reconciled_at = @now, updated_at = @now
         WHERE id = @id AND (@expected IS NULL OR status = @expected)`,
        { status, error: error ?? null, now, id, expected: expectedStatus ?? null },
      );
      return changed > 0 ? this.printJobRow(id) : null;
    });
  }

  public async getCurrentCupsJobId(id: string): Promise<string | null> {
    return (
      this.get<{ cups_job_id: string | null }>(
        'SELECT cups_job_id FROM print_job_attempts WHERE print_job_id = ? AND is_current = 1',
        id,
      )?.cups_job_id ?? null
    );
  }

  public async cancelPrintJob(id: string): Promise<PrintJob | null> {
    return immediate(this.db, () => {
      const changed = this.run(
        `UPDATE print_jobs SET status = 'canceled', last_error = NULL, updated_at = ?
         WHERE id = ? AND status IN ${ACTIVE_PRINT_STATUSES}`,
        nowTimestamp(),
        id,
      );
      return changed > 0 ? this.printJobRow(id) : null;
    });
  }

  public async retryPrintJob(id: string): Promise<PrintJob | null> {
    return immediate(this.db, () => {
      const now = nowTimestamp();
      const changed = this.run(
        `UPDATE print_jobs SET status = 'queued', last_error = NULL, updated_at = ?
         WHERE id = ? AND status IN ('failed', 'canceled', 'needs_attention')`,
        now,
        id,
      );
      if (changed === 0) return null;
      this.run(
        `UPDATE print_job_attempts SET is_current = 0, superseded_at = ?
         WHERE print_job_id = ? AND is_current = 1`,
        now,
        id,
      );
      return this.printJobRow(id);
    });
  }

  public async reprintPrintJob(id: string, requestKey: string): Promise<PrintJob | null> {
    return immediate(this.db, () => {
      const newJobId = newId();
      const now = nowTimestamp();
      const changed = this.run(
        `INSERT INTO print_jobs (id, output_id, session_id, request_key, artifact_path, artifact_type, public_id,
           output_type, printer_name, media_size, copies_requested, mode, reprint_of_id, created_at, updated_at)
         SELECT ?, output_id, session_id, ?, artifact_path, artifact_type, public_id, output_type,
           printer_name, media_size, copies_requested, mode, id, ?, ?
         FROM print_jobs WHERE id = ? AND status = 'completed'`,
        newJobId,
        requestKey,
        now,
        now,
        id,
      );
      return changed > 0 ? this.printJobRow(newJobId) : null;
    });
  }

  /** Completion and session accounting share one transaction, so repeated reconciliation is harmless. */
  public async completePrintJob(id: string, attemptId: string): Promise<PrintJob | null> {
    return immediate(this.db, () => {
      const now = nowTimestamp();
      const completed = this.get<{ session_id: string; copies_requested: number }>(
        `UPDATE print_jobs SET status = 'completed', copies_completed = copies_requested,
           last_error = NULL, last_reconciled_at = @now, updated_at = @now
         WHERE id = @id AND status IN ('submitting', 'pending', 'processing', 'stopped')
           AND EXISTS (
             SELECT 1 FROM print_job_attempts
             WHERE id = @attemptId AND print_job_id = print_jobs.id AND is_current = 1
           )
         RETURNING session_id, copies_requested`,
        { now, id, attemptId },
      );
      if (!completed) return null;
      this.run(
        `UPDATE sessions SET is_printed = 1, copies_printed = copies_printed + ?, state = 'printed',
           last_activity_at = ?
         WHERE id = ? AND state IN ('booth_confirmed', 'printed')`,
        completed.copies_requested,
        now,
        completed.session_id,
      );
      return this.printJobRow(id);
    });
  }

  public async recordPrintStatus(
    sessionId: string,
    copiesPrinted: number,
  ): Promise<SessionData | null> {
    return this.updateSession(
      sessionId,
      `is_printed = 1, copies_printed = copies_printed + ?, state = 'printed', last_activity_at = ?`,
      `AND state IN ('booth_confirmed', 'printed')`,
      copiesPrinted,
      nowTimestamp(),
    );
  }

  private templateItem(row: Row): TemplateItem {
    const id = row.id as string;
    const placements = this.all(
      `SELECT id, capture_index, x, y, width, height, rotation, border_radius, z_index
       FROM template_placements WHERE template_id = ? ORDER BY z_index ASC, capture_index ASC, rowid ASC`,
      id,
    ).map((p) => ({
      id: p.id as string,
      captureIndex: p.capture_index as number,
      x: p.x as number,
      y: p.y as number,
      width: p.width as number,
      height: p.height as number,
      rotation: p.rotation as number,
      borderRadius: p.border_radius as number,
      zIndex: p.z_index as number,
    }));
    const overlays = this.all(
      `SELECT id, label, asset_path, x, y, width, height, rotation, z_index
       FROM template_overlays WHERE template_id = ? ORDER BY z_index ASC, rowid ASC`,
      id,
    ).map((o) => ({
      id: o.id as string,
      label: o.label as string,
      assetPath: o.asset_path as string,
      x: o.x as number,
      y: o.y as number,
      width: o.width as number,
      height: o.height as number,
      rotation: o.rotation as number,
      zIndex: o.z_index as number,
    }));
    return {
      id,
      name: row.name as string,
      orientation: row.orientation as TemplateItem['orientation'],
      outputWidth: row.output_width as number,
      outputHeight: row.output_height as number,
      backgroundPath: row.background_path as string,
      isActive: fromBool(row.is_active as number),
      requiredCaptureCount: row.required_capture_count as number,
      countdownSeconds: row.countdown_seconds as TemplateItem['countdownSeconds'],
      placements,
      overlays,
      createdAt: fromTimestamp(row.created_at as string),
      updatedAt: fromTimestamp(row.updated_at as string),
    };
  }

  private static readonly TEMPLATE_COLUMNS = `id, name, orientation, output_width, output_height,
    background_path, is_active, required_capture_count, countdown_seconds, created_at, updated_at`;

  public async listActiveTemplates(): Promise<TemplateItem[]> {
    const rows = this.all(
      `SELECT ${SqliteDatabaseRepository.TEMPLATE_COLUMNS} FROM templates WHERE is_active = 1
       ORDER BY created_at ASC, rowid ASC`,
    );
    return rows.length > 0 ? rows.map((row) => this.templateItem(row)) : activeBuiltInTemplates();
  }

  public async getTemplateById(templateId: string): Promise<TemplateItem | null> {
    const columns = SqliteDatabaseRepository.TEMPLATE_COLUMNS;
    const row = isUuid(templateId)
      ? this.get(`SELECT ${columns} FROM templates WHERE id = ?`, templateId)
      : this.get(
          `SELECT ${columns} FROM templates WHERE instr(casefold(name), casefold(?)) > 0
           ORDER BY created_at ASC, rowid ASC LIMIT 1`,
          templateId,
        );
    return row ? this.templateItem(row) : findBuiltInTemplate(templateId);
  }

  private insertTemplateChildren(
    templateId: string,
    placements: TemplatePlacement[],
    overlays: TemplateOverlay[],
    now: string,
  ): void {
    const placement = this.db.prepare(
      `INSERT INTO template_placements
         (id, template_id, capture_index, x, y, width, height, rotation, border_radius, z_index, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const p of placements) {
      placement.run(
        newId(),
        templateId,
        p.captureIndex,
        p.x,
        p.y,
        p.width,
        p.height,
        p.rotation || 0,
        p.borderRadius || 0,
        p.zIndex || 1,
        now,
      );
    }
    const overlay = this.db.prepare(
      `INSERT INTO template_overlays
         (id, template_id, label, asset_path, x, y, width, height, rotation, z_index, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const o of overlays) {
      overlay.run(
        newId(),
        templateId,
        o.label,
        toStoredPath(o.assetPath) || '',
        o.x || 0,
        o.y || 0,
        o.width,
        o.height,
        o.rotation || 0,
        o.zIndex || 2,
        now,
      );
    }
  }

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
    return immediate(this.db, () => {
      const id = newId();
      const now = nowTimestamp();
      this.run(
        `INSERT INTO templates (id, name, orientation, output_width, output_height, background_path,
           required_capture_count, countdown_seconds, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        name,
        orientation,
        outputWidth,
        outputHeight,
        toStoredPath(backgroundPath),
        requiredCaptureCount,
        countdownSeconds,
        now,
        now,
      );
      this.insertTemplateChildren(id, placements, overlays, now);
      const row = this.get(
        `SELECT ${SqliteDatabaseRepository.TEMPLATE_COLUMNS} FROM templates WHERE id = ?`,
        id,
      )!;
      return { ...this.templateItem(row), placements, overlays };
    });
  }

  public async updateTemplateLayout(
    templateId: string,
    placements: TemplatePlacement[],
    overlays: TemplateOverlay[] = [],
  ): Promise<boolean> {
    return immediate(this.db, () => {
      const now = nowTimestamp();
      if (this.run('UPDATE templates SET updated_at = ? WHERE id = ?', now, templateId) === 0) {
        return false;
      }
      this.run('DELETE FROM template_placements WHERE template_id = ?', templateId);
      this.run('DELETE FROM template_overlays WHERE template_id = ?', templateId);
      this.insertTemplateChildren(templateId, placements, overlays, now);
      return true;
    });
  }

  public async selectTemplate(
    sessionId: string,
    template: TemplateItem,
  ): Promise<SessionData | null> {
    const snapshot = buildTemplateSnapshot(template);
    return this.updateSession(
      sessionId,
      `template_id = ?, template_snapshot = ?, state = 'template_selected', last_activity_at = ?`,
      '',
      isUuid(template.id) ? template.id : null,
      toJson(snapshot),
      nowTimestamp(),
    );
  }

  public async getPhotoCaptures(sessionId: string): Promise<CaptureItem[]> {
    return this.all(
      `SELECT id, session_id, capture_index, file_path, is_cover, is_selected, created_at
       FROM session_captures
       WHERE session_id = ? AND is_cover = 0 AND is_selected = 1
       ORDER BY capture_index ASC, rowid ASC`,
      sessionId,
    ).map((row) =>
      withResolvedFilePath({
        id: row.id as string,
        sessionId: row.session_id as string,
        captureIndex: row.capture_index as number,
        filePath: row.file_path as string,
        isCover: fromBool(row.is_cover as number),
        isSelected: fromBool(row.is_selected as number),
        createdAt: fromTimestamp(row.created_at as string),
      }),
    );
  }

  public async getAnalyticsData(filters: AnalyticsFilters = {}): Promise<AnalyticsData> {
    const { eventId, startDate, endDate } = filters;
    const startIso = startDate ? new Date(startDate).toISOString() : null;
    const endIso = endDate ? new Date(endDate).toISOString() : null;
    const rows = this.all(
      `SELECT s.id, s.event_id, s.type, s.state, s.template_id, s.frame_id, s.template_snapshot,
         s.is_printed, s.copies_printed, s.created_at,
         COALESCE(t.name, json_extract(s.template_snapshot, '$.name')) AS template_name,
         t.type AS template_type
       FROM sessions s
       LEFT JOIN templates t ON s.template_id = t.id
       WHERE s.state IN ('booth_confirmed', 'printed')
         AND (@eventId IS NULL OR s.event_id = @eventId)
         AND (@startIso IS NULL OR s.created_at >= @startIso)
         AND (@endIso IS NULL OR s.created_at <= @endIso)
       ORDER BY s.created_at ASC, s.rowid ASC`,
      { eventId: eventId || null, startIso, endIso },
    );
    return buildAnalyticsData(
      rows.map((row) => ({
        id: row.id as string,
        eventId: row.event_id as string,
        type: row.type as 'photo_strip' | 'flipbook',
        state: row.state as string,
        templateId: (row.template_id as string | null) ?? null,
        frameId: (row.frame_id as string | null) ?? null,
        templateSnapshot: fromJson(row.template_snapshot as string | null),
        isPrinted: fromBool(row.is_printed as number),
        copiesPrinted: row.copies_printed as number,
        createdAt: fromTimestamp(row.created_at as string),
        templateName: (row.template_name as string | null) ?? null,
        templateType: (row.template_type as string | null) ?? null,
      })),
    );
  }
}
