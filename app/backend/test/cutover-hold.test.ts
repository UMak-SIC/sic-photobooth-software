import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify,{ type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isCutoverHoldActive } from '../src/db/cutover-hold.js';
import { CUTOVER_HOLD_ERROR, cutoverHoldPlugin } from '../src/plugins/cutover-hold.js';

const apps: FastifyInstance[] = [];

async function buildHeldApp(active: boolean): Promise<{ app: FastifyInstance; handled: string[] }> {
  const handled: string[] = [];
  const app = Fastify({ logger: false });
  apps.push(app);
  await app.register(cutoverHoldPlugin, { isActive: () => active });
  // Routes live in a sibling encapsulated plugin, mirroring app.ts registration.
  await app.register(async (routes) => {
    routes.get('/health', async () => ({ status: 'healthy' }));
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      routes.route({
        method,
        url: '/api/sessions',
        handler: async () => {
          handled.push(method);
          return { success: true };
        },
      });
    }
  });
  return { app, handled };
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

describe('cutover hold predicate', () => {
  it('reflects the configured flag', () => {
    expect(isCutoverHoldActive({ databaseCutoverHold: true })).toBe(true);
    expect(isCutoverHoldActive({ databaseCutoverHold: false })).toBe(false);
  });
});

describe('cutover hold plugin', () => {
  it('rejects every mutation method with a generic 503 before handlers run', async () => {
    const { app, handled } = await buildHeldApp(true);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const response = await app.inject({ method, url: '/api/sessions', payload: {} });
      expect(response.statusCode).toBe(503);
      expect(response.headers['retry-after']).toBe('300');
      expect(response.json()).toEqual({ success: false, error: CUTOVER_HOLD_ERROR });
    }
    expect(handled).toEqual([]);
  });

  it('keeps read-only routes and health available', async () => {
    const { app } = await buildHeldApp(true);
    const get = await app.inject({ method: 'GET', url: '/health' });
    expect(get.statusCode).toBe(200);
    expect(get.json()).toEqual({ status: 'healthy' });
    expect((await app.inject({ method: 'HEAD', url: '/health' })).statusCode).toBe(200);
  });

  it('is a no-op when the hold is inactive', async () => {
    const { app, handled } = await buildHeldApp(false);
    const response = await app.inject({ method: 'POST', url: '/api/sessions', payload: {} });
    expect(response.statusCode).toBe(200);
    expect(handled).toEqual(['POST']);
  });

  it('is registered by buildApp and follows the config flag', async () => {
    vi.resetModules();
    vi.stubEnv('DATABASE_CUTOVER_HOLD', '1');
    const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photobooth-cutover-'));
    vi.stubEnv('STORAGE_DIR', storageDir);
    try {
      const { buildApp } = await import('../src/app.js');
      const app = await buildApp();
      apps.push(app);
      const response = await app.inject({ method: 'POST', url: '/api/events', payload: {} });
      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe('MAINTENANCE_HOLD');
    } finally {
      vi.unstubAllEnvs();
      fs.rmSync(storageDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });

  it('refuses to start on an unrecognized flag value', async () => {
    vi.resetModules();
    vi.stubEnv('DATABASE_CUTOVER_HOLD', 'yes');
    try {
      await expect(import('../src/config.js')).rejects.toThrow(/DATABASE_CUTOVER_HOLD/);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
