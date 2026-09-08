import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

describe('Event routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects incomplete event details before accessing the database', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { name: ' ', date: '2026-02-30', operatorName: '' },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({
      success: false,
      error: { code: 'INVALID_REQUEST' },
    });
  });

  it('creates and deletes an event', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        name: 'Backend Test Event',
        date: '2026-10-15',
        operatorName: 'Operator Test',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body);
    expect(created.data.id).toBeDefined();

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/events/${created.data.id}`,
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(JSON.parse(deleteRes.body)).toMatchObject({
      success: true,
      data: { id: created.data.id },
    });
  });
});
