import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { dbRepository } from '../src/db/repository.js';

describe('Publication routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists local publication records and rejects retrying a queued job', async () => {
    await dbRepository.saveGeneratedOutput(
      'publication-test-session',
      'PubTest',
      'image/png',
      'outputs/publication-test.png',
      1200,
      1800,
    );
    const listed = await app.inject({ method: 'GET', url: '/api/publications' });
    expect(listed.statusCode).toBe(200);
    const publication = JSON.parse(listed.body).data.find((item: { publicId: string }) => item.publicId === 'PubTest');
    expect(publication.status).toBe('queued');

    const retry = await app.inject({ method: 'POST', url: `/api/publications/${publication.id}/retry` });
    expect(retry.statusCode).toBe(409);
  });

  it('rejects malformed publication IDs', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/publications/not-a-uuid/retry' });
    expect(response.statusCode).toBe(400);
  });
});
