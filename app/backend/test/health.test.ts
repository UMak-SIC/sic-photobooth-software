import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

describe('Fastify Server Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns health check structure', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBeDefined();
    const body = JSON.parse(response.body);
    expect(body.services).toBeDefined();
    expect(body.services.storage).toBe('writable');
  });

  it('GET /photos/:id with invalid ID returns 400 with PRD contract message', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/photos/invalid_id',
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error.message).toBe(
      'Photo not found. Check the QR code or enter the full link/code again.',
    );
  });

  it('GET /photos/:id with missing photo returns 404 with PRD contract message', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/photos/7fK92pQ',
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error.message).toBe(
      'Photo not found. Check the QR code or enter the full link/code again.',
    );
  });
});
