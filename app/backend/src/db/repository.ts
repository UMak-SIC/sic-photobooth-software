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

export class DatabaseRepository {
  /**
   * Creates or returns an existing event by name and date.
   */
  public async getOrCreateEvent(
    name: string,
    date: string,
    operatorName: string,
  ): Promise<EventData> {
    const query = `
      INSERT INTO events (name, date, operator_name)
      VALUES ($1, $2, $3)
      ON CONFLICT (name, date) DO UPDATE
        SET operator_name = EXCLUDED.operator_name
      RETURNING id, name, date::text, operator_name AS "operatorName", created_at AS "createdAt"
    `;
    const res = await pool.query(query, [name, date, operatorName]);
    return res.rows[0];
  }

  /**
   * Creates a new session in PostgreSQL.
   */
  public async createSession(
    eventId: string,
    type: SessionType,
    token: string,
  ): Promise<SessionData> {
    const initialState: SessionState = 'created';
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
  }

  /**
   * Retrieves session by ID.
   */
  public async getSessionById(sessionId: string): Promise<SessionData | null> {
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
  }

  /**
   * Updates session state and last activity timestamp.
   */
  public async updateSessionState(
    sessionId: string,
    state: SessionState,
  ): Promise<SessionData | null> {
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
  }

  /**
   * Cancels an active session.
   */
  public async cancelSession(sessionId: string): Promise<SessionData | null> {
    const query = `
      UPDATE sessions
      SET state = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, last_activity_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND state != 'booth_confirmed' AND state != 'printed'
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
  }
}

export const dbRepository = new DatabaseRepository();
