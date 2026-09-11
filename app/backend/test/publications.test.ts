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

  it('deletes a local output and its publication record', async () => {
    const publicId = `D${crypto.randomUUID().replaceAll('-', '').slice(0, 6)}`;
    await dbRepository.saveGeneratedOutput(
      'publication-delete-session',
      publicId,
      'image/png',
      'outputs/publication-delete.png',
      1200,
      1800,
    );
    const listed = await app.inject({ method: 'GET', url: '/api/publications' });
    const publication = JSON.parse(listed.body).data.find((item: { publicId: string }) => item.publicId === publicId);

    const deleted = await app.inject({ method: 'DELETE', url: `/api/publications/${publication.id}/local` });

    expect(deleted.statusCode).toBe(204);
    const after = await app.inject({ method: 'GET', url: '/api/publications' });
    expect(JSON.parse(after.body).data.some((item: { publicId: string }) => item.publicId === publicId)).toBe(false);
  });

  it('prints publication with copy count and returns flipbook data', async () => {
    const publicId = `F${crypto.randomUUID().replaceAll('-', '').slice(0, 6)}`;
    const event = await dbRepository.createEvent({
      name: 'Flipbook Event',
      date: '2026-09-10',
      operatorName: 'SIC Admin',
    });
    const session = await dbRepository.createSession(event.id, 'flipbook', 'token-pub-print');
    await dbRepository.updateSessionState(session.id, 'booth_confirmed');

    await dbRepository.saveGeneratedOutput(
      session.id,
      publicId,
      'image/gif',
      'outputs/test-flip.gif',
      800,
      450,
    );

    const listed = await app.inject({ method: 'GET', url: '/api/publications' });
    const publication = JSON.parse(listed.body).data.find((item: { publicId: string }) => item.publicId === publicId);
    expect(publication).toBeDefined();

    // Test flipbook-data
    const flipDataRes = await app.inject({
      method: 'GET',
      url: `/api/publications/${publication.id}/flipbook-data`,
    });
    expect(flipDataRes.statusCode).toBe(200);
    const flipData = JSON.parse(flipDataRes.body).data;
    expect(flipData.publicId).toBe(publicId);
    expect(flipData.mediaType).toBe('image/gif');
    expect(flipData.motionFrameUrls).toHaveLength(15);

    // Test printing publication with 2 copies
    const printRes = await app.inject({
      method: 'POST',
      url: `/api/publications/${publication.id}/print`,
      payload: { copies: 2, recordOnly: true },
    });
    expect(printRes.statusCode).toBe(200);
    const printBody = JSON.parse(printRes.body);
    expect(printBody.success).toBe(true);
    expect(printBody.data.copiesPrinted).toBe(2);

    // Test PDF not found initially
    const pdfMissingRes = await app.inject({
      method: 'GET',
      url: `/api/publications/${publication.id}/pdf`,
    });
    expect(pdfMissingRes.statusCode).toBe(404);

    // Test PDF upload and retrieval
    const pdfBuffer = Buffer.from('%PDF-1.4 mock pdf content');
    const formBoundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    const formPayload = Buffer.concat([
      Buffer.from(`--${formBoundary}\r\nContent-Disposition: form-data; name="file"; filename="output.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
      pdfBuffer,
      Buffer.from(`\r\n--${formBoundary}--\r\n`),
    ]);

    const uploadPdfRes = await app.inject({
      method: 'POST',
      url: `/api/publications/${publication.id}/pdf`,
      headers: {
        'content-type': `multipart/form-data; boundary=${formBoundary}`,
      },
      payload: formPayload,
    });
    expect(uploadPdfRes.statusCode).toBe(200);
    expect(JSON.parse(uploadPdfRes.body).success).toBe(true);

    // Test PDF retrieval
    const pdfFoundRes = await app.inject({
      method: 'GET',
      url: `/api/publications/${publication.id}/pdf`,
    });
    expect(pdfFoundRes.statusCode).toBe(200);
    expect(pdfFoundRes.headers['content-type']).toContain('application/pdf');
    expect(pdfFoundRes.rawPayload.toString()).toBe('%PDF-1.4 mock pdf content');
  });
});
