import { Writable } from 'node:stream';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleError } from '../src/app.js';
import type { CoreRepository, DatabaseProvider } from '../src/db/contracts.js';
import { getDatabaseProvider, setDatabaseProvider } from '../src/db/provider.js';
import { INTERNAL_ERROR, UserFacingError } from '../src/errors.js';
import { sessionRoutes } from '../src/routes/sessions.js';

const DB_ERROR = 'SQLITE_CONSTRAINT: UNIQUE constraint failed: events.name, events.date';

interface LogLine {
  level: number;
  msg: string;
  err?: { message?: string };
}

/** A Fastify app with the production error handler and a captured JSON log. */
async function loggingApp(): Promise<{ app: FastifyInstance; logs: LogLine[] }> {
  const logs: LogLine[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      for (const line of String(chunk).split('\n').filter(Boolean)) logs.push(JSON.parse(line));
      done();
    },
  });
  const app = Fastify({ logger: { level: 'info', stream } });
  app.setErrorHandler(handleError);
  await app.register(sessionRoutes);
  app.get('/boom/fs', async () => {
    throw new Error("ENOENT: no such file or directory, open '/srv/booth/storage/secret.png'");
  });
  app.get('/boom/status', async () => {
    throw Object.assign(new Error('pg: relation "sessions" does not exist'), { statusCode: 400 });
  });
  app.post('/boom/json', async () => ({ ok: true }));
  return { app, logs };
}

/** Wraps the active provider so one repository method fails like a database driver. */
function failingProvider(method: keyof CoreRepository): DatabaseProvider {
  const real = getDatabaseProvider();
  const repository = new Proxy(real.repository, {
    get(target, property, receiver) {
      if (property === method)
        return async () => {
          throw Object.assign(new Error(DB_ERROR), { code: 'SQLITE_CONSTRAINT_UNIQUE' });
        };
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return { ...real, repository };
}

let original: DatabaseProvider;
beforeEach(() => {
  original = getDatabaseProvider();
});
afterEach(() => {
  setDatabaseProvider(original);
});

describe('client error responses', () => {
  it('never returns a database error message to the client, but logs it', async () => {
    const { app, logs } = await loggingApp();
    setDatabaseProvider(failingProvider('getOrCreateEvent'));
    const response = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        eventName: 'Launch',
        eventDate: '2026-10-16',
        operatorName: 'Ana',
        type: 'photo_strip',
      },
    });
    await app.close();

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ success: false, error: INTERNAL_ERROR });
    expect(response.body).not.toContain('SQLITE');
    const logged = logs.find((line) => line.msg === 'Creating a session failed');
    expect(logged?.level).toBe(50);
    expect(logged?.err?.message).toBe(DB_ERROR);
  });

  it('returns authored workflow messages as 4xx and logs them as warnings', async () => {
    const { app, logs } = await loggingApp();
    const created = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        eventName: 'Launch',
        eventDate: '2026-10-16',
        operatorName: 'Ana',
        type: 'photo_strip',
      },
    });
    const { sessionId, token } = created.json().data;
    const response = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/transition`,
      headers: { 'x-session-token': token },
      payload: { targetState: 'printed' },
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_STATE_TRANSITION');
    expect(response.json().error.message).toMatch(/^Invalid workflow transition from "created"/);
    const logged = logs.find((line) => line.msg === 'Session transition rejected');
    expect(logged?.level).toBe(40);
  });

  it('hides filesystem and driver text in the global handler while keeping framework 4xx text', async () => {
    const { app, logs } = await loggingApp();
    const fsError = await app.inject({ method: 'GET', url: '/boom/fs' });
    const statusError = await app.inject({ method: 'GET', url: '/boom/status' });
    const badJson = await app.inject({
      method: 'POST',
      url: '/boom/json',
      headers: { 'content-type': 'application/json' },
      payload: '{not json',
    });
    const emptyJson = await app.inject({
      method: 'POST',
      url: '/boom/json',
      headers: { 'content-type': 'application/json' },
      payload: '',
    });
    await app.close();

    expect(fsError.statusCode).toBe(500);
    expect(fsError.json()).toEqual({ success: false, error: INTERNAL_ERROR });
    expect(statusError.statusCode).toBe(400);
    expect(statusError.json().error).toEqual({
      code: 'BAD_REQUEST',
      message: 'The request could not be processed.',
    });
    // JSON.parse text is not ours to show; Fastify's own coded errors are.
    expect(badJson.statusCode).toBe(400);
    expect(badJson.json().error.code).toBe('BAD_REQUEST');
    expect(emptyJson.statusCode).toBe(400);
    expect(emptyJson.json().error.code).toBe('FST_ERR_CTP_EMPTY_JSON_BODY');
    for (const body of [fsError.body, statusError.body]) {
      expect(body).not.toMatch(/ENOENT|storage|relation|pg:/);
    }
    expect(logs.some((line) => line.err?.message?.startsWith('ENOENT'))).toBe(true);
  });

  it('passes a UserFacingError through unchanged', async () => {
    const app = Fastify({ logger: false });
    app.setErrorHandler(handleError);
    app.get('/limit', async () => {
      throw new UserFacingError(409, 'LIMIT_EXCEEDED', 'Maximum retake limit reached.');
    });
    const response = await app.inject({ method: 'GET', url: '/limit' });
    await app.close();
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toEqual({
      code: 'LIMIT_EXCEEDED',
      message: 'Maximum retake limit reached.',
    });
  });
});
