import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { runMigrations } from '../src/db/migrations.js';
import { sessionStateMachine } from '../src/services/session-state-machine.js';
import { photoStripRenderer } from '../src/services/photo-strip-renderer.js';
import { dbRepository } from '../src/db/repository.js';

describe('Photo Strip Workflow & Compositor Engine (EPIC-05)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    try {
      await runMigrations();
    } catch {
      // Postgres might not be running in isolated CI test run; in-memory fallback handles state
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('enforces valid Photo Strip state machine progression', () => {
    // Valid transitions
    expect(
      sessionStateMachine.isValidTransition('photo_strip', 'created', 'template_selected'),
    ).toBe(true);
    expect(
      sessionStateMachine.isValidTransition('photo_strip', 'template_selected', 'capturing'),
    ).toBe(true);
    expect(sessionStateMachine.isValidTransition('photo_strip', 'capturing', 'review')).toBe(true);
    expect(sessionStateMachine.isValidTransition('photo_strip', 'review', 'capturing')).toBe(
      true, // retake
    );
    expect(sessionStateMachine.isValidTransition('photo_strip', 'review', 'booth_confirmed')).toBe(
      true,
    );
    expect(sessionStateMachine.isValidTransition('photo_strip', 'booth_confirmed', 'printed')).toBe(
      true,
    );

    // Invalid transitions
    expect(sessionStateMachine.isValidTransition('photo_strip', 'created', 'review')).toBe(false);
    expect(sessionStateMachine.isValidTransition('photo_strip', 'created', 'booth_confirmed')).toBe(
      false,
    );
    expect(sessionStateMachine.isValidTransition('photo_strip', 'created', 'printed')).toBe(false);
    expect(sessionStateMachine.isValidTransition('photo_strip', 'capturing', 'printed')).toBe(
      false,
    );
    expect(sessionStateMachine.isValidTransition('photo_strip', 'printed', 'capturing')).toBe(
      false,
    );
  });

  it('enforces strict 4-retake limit on Photo Strip sessions', () => {
    expect(sessionStateMachine.canRetake('photo_strip', 0)).toBe(true);
    expect(sessionStateMachine.canRetake('photo_strip', 3)).toBe(true);
    expect(sessionStateMachine.canRetake('photo_strip', 4)).toBe(false);
    expect(sessionStateMachine.canRetake('photo_strip', 5)).toBe(false);

    // Fails when retake limit exceeded
    expect(() => sessionStateMachine.assertCanRetake('photo_strip', 4)).toThrow(
      'Maximum retake limit reached',
    );
    // Not applicable to flipbook
    expect(sessionStateMachine.canRetake('flipbook', 0)).toBe(false);
  });

  it('lists active templates from GET /api/templates with 4R canvas properties', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/templates',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    const template = body.data[0];
    expect(template).toHaveProperty('id');
    expect(template).toHaveProperty('name');
    expect(template).toHaveProperty('orientation');
    expect(template).toHaveProperty('outputWidth');
    expect(template).toHaveProperty('outputHeight');
    expect(template).toHaveProperty('placements');
    expect(Array.isArray(template.placements)).toBe(true);
    expect(template.placements.length).toBeGreaterThan(0);
  });

  it('executes full Photo Strip lifecycle: session -> template select -> captures -> confirm -> print', async () => {
    // 1. Create photo strip session
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        eventName: 'SIC Tech Expo 2026',
        eventDate: '2026-09-05',
        operatorName: 'Joey Dev',
        type: 'photo_strip',
      },
    });

    expect(createRes.statusCode).toBe(201);
    const createBody = JSON.parse(createRes.body);
    const sessionId = createBody.data.sessionId;
    const token = createBody.data.token;
    expect(sessionId).toBeDefined();
    expect(token).toHaveLength(64);
    expect(createBody.data.state).toBe('created');

    // 2. Fetch available templates
    const templatesRes = await app.inject({
      method: 'GET',
      url: '/api/templates',
    });
    const templates = JSON.parse(templatesRes.body).data;
    const selectedTemplate =
      templates.find(
        (t: { requiredCaptureCount?: number; placements?: unknown[] }) =>
          (t.requiredCaptureCount || t.placements?.length) === 3,
      ) || templates[0];
    expect(selectedTemplate).toBeDefined();

    // 3. Attempt template selection without token -> 403 Forbidden
    const unauthSelectRes = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/template`,
      payload: { templateId: selectedTemplate.id },
    });
    expect(unauthSelectRes.statusCode).toBe(403);

    // 4. Authorized template selection -> 200 OK and immutable snapshot
    const selectRes = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/template`,
      headers: { 'x-session-token': token },
      payload: { templateId: selectedTemplate.id },
    });
    expect(selectRes.statusCode).toBe(200);
    const selectBody = JSON.parse(selectRes.body);
    expect(selectBody.success).toBe(true);
    expect(selectBody.data.state).toBe('template_selected');
    expect(selectBody.data.templateSnapshot).toBeDefined();
    expect(selectBody.data.templateSnapshot.id).toBe(selectedTemplate.id);
    expect(selectBody.data.token).toBeUndefined(); // Token stripped

    // 5. Transition to capturing
    const transRes = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/transition`,
      headers: { 'x-session-token': token },
      payload: { targetState: 'capturing' },
    });
    expect(transRes.statusCode).toBe(200);
    expect(JSON.parse(transRes.body).data.state).toBe('capturing');

    // 6. Transition to review state
    const toReviewRes = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/transition`,
      headers: { 'x-session-token': token },
      payload: { targetState: 'review' },
    });
    expect(toReviewRes.statusCode).toBe(200);

    // 7. Attempt confirm without required captures -> 400 INCOMPLETE_CAPTURES
    const earlyConfirmRes = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/photo-strip/confirm`,
      headers: { 'x-session-token': token },
    });
    expect(earlyConfirmRes.statusCode).toBe(400);
    const earlyConfirmBody = JSON.parse(earlyConfirmRes.body);
    expect(earlyConfirmBody.error.code).toBe('INCOMPLETE_CAPTURES');

    // 8. Attempt print before confirmation -> 400 INVALID_STATE
    const earlyPrintRes = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/print`,
      headers: { 'x-session-token': token },
      payload: { copies: 2 },
    });
    expect(earlyPrintRes.statusCode).toBe(400);
    expect(JSON.parse(earlyPrintRes.body).error.code).toBe('INVALID_STATE');

    // 9. Upload the required captures
    const requiredPhotos =
      (typeof selectedTemplate.requiredCaptureCount === 'number'
        ? selectedTemplate.requiredCaptureCount
        : selectedTemplate.placements?.length) || 3;
    const boundary = '----WebKitFormBoundaryLifecycleTest';
    const samplePng = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
      'hex',
    );
    for (let slot = 1; slot <= requiredPhotos; slot++) {
      const payload = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="captureIndex"\r\n\r\n${slot}\r\n`,
        ),
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="slot-${slot}.png"\r\nContent-Type: image/png\r\n\r\n`,
        ),
        samplePng,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      const uploadRes = await app.inject({
        method: 'POST',
        url: `/api/sessions/${sessionId}/captures/photo`,
        headers: {
          'x-session-token': token,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });
      expect(uploadRes.statusCode).toBe(201);
    }

    // 10. Confirm Photo Strip -> 200 and transitions to booth_confirmed
    const confirmRes = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/photo-strip/confirm`,
      headers: { 'x-session-token': token },
    });
    expect(confirmRes.statusCode).toBe(200);
    const confirmBody = JSON.parse(confirmRes.body);
    expect(confirmBody.success).toBe(true);
    expect(confirmBody.data.publicId).toBeDefined();
    expect(confirmBody.data.qrUrl).toContain('https://myphotobooth.com/');

    // 11. Record first print (1 copy) -> transitions to printed
    const print1Res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/print`,
      headers: { 'x-session-token': token },
      payload: { copies: 1 },
    });
    expect(print1Res.statusCode).toBe(200);
    const print1Body = JSON.parse(print1Res.body);
    expect(print1Body.success).toBe(true);
    expect(print1Body.data.state).toBe('printed');
    expect(print1Body.data.isPrinted).toBe(true);
    expect(print1Body.data.copiesPrinted).toBe(1);
    expect(print1Body.data.jobId).toBeDefined();

    // 12. Record subsequent print (2 additional copies) -> stays printed and increments count to 3
    const print2Res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/print`,
      headers: { 'x-session-token': token },
      payload: { copies: 2 },
    });
    expect(print2Res.statusCode).toBe(200);
    const print2Body = JSON.parse(print2Res.body);
    expect(print2Body.success).toBe(true);
    expect(print2Body.data.state).toBe('printed');
    expect(print2Body.data.isPrinted).toBe(true);
    expect(print2Body.data.copiesPrinted).toBe(3);
  });

  it('renders high-resolution 300 DPI 4R PNG buffer', async () => {
    const publicId = '7fK92pQ';
    const qrUrl = `https://myphotobooth.com/${publicId}`;

    const pngBuffer = await photoStripRenderer.renderStrip({
      width: 1200,
      height: 1800,
      backgroundColor: '#ffffff',
      placements: [
        {
          captureIndex: 1,
          x: 100,
          y: 120,
          width: 1000,
          height: 440,
          rotation: 0,
          borderRadius: 8,
          zIndex: 1,
        },
        {
          captureIndex: 2,
          x: 100,
          y: 600,
          width: 1000,
          height: 440,
          rotation: 0,
          borderRadius: 8,
          zIndex: 1,
        },
        {
          captureIndex: 3,
          x: 100,
          y: 1080,
          width: 1000,
          height: 440,
          rotation: 0,
          borderRadius: 8,
          zIndex: 1,
        },
      ],
      overlays: [],
      captures: [], // Will use placeholder tiles
      publicId,
      qrUrl,
    });

    expect(Buffer.isBuffer(pngBuffer)).toBe(true);
    expect(pngBuffer.length).toBeGreaterThan(1000);

    // Check PNG signature: 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
    expect(pngBuffer[0]).toBe(0x89);
    expect(pngBuffer[1]).toBe(0x50); // P
    expect(pngBuffer[2]).toBe(0x4e); // N
    expect(pngBuffer[3]).toBe(0x47); // G
  });

  it('composites overlays on top of photo placements', async () => {
    const pngBuffer = await photoStripRenderer.renderStrip({
      width: 1200,
      height: 1800,
      backgroundColor: '#ffffff',
      placements: [
        {
          captureIndex: 1,
          x: 100,
          y: 120,
          width: 1000,
          height: 440,
          zIndex: 1,
        },
      ],
      overlays: [
        {
          label: 'Spiderman Overlay',
          x: 100,
          y: 120,
          width: 500,
          height: 300,
          zIndex: 2,
        },
      ],
      captures: [],
      publicId: 'overlayTest',
      qrUrl: 'https://myphotobooth.com/overlayTest',
    });

    expect(Buffer.isBuffer(pngBuffer)).toBe(true);
    expect(pngBuffer[0]).toBe(0x89);
  });

  it('safely tolerates floating-point placement dimensions without throwing sharp error', async () => {
    const pngBuffer = await photoStripRenderer.renderStrip({
      width: 1200.4,
      height: 1800.8,
      backgroundColor: '#ffffff',
      placements: [
        {
          captureIndex: 1,
          x: 90.2,
          y: 280.5,
          width: 420.0,
          height: 236.25, // The exact floating point height reported
          rotation: 0,
          borderRadius: 4.5,
          zIndex: 1,
        },
      ],
      overlays: [],
      captures: [],
      publicId: '8kL99zX',
      qrUrl: 'https://myphotobooth.com/8kL99zX',
    });

    expect(Buffer.isBuffer(pngBuffer)).toBe(true);
    expect(pngBuffer[0]).toBe(0x89);
    expect(pngBuffer[1]).toBe(0x50);
  });

  it('rejects out-of-bounds captureIndex in photo upload route', async () => {
    // 1. Create photo strip session
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        eventName: 'Bounds Test Expo',
        eventDate: '2026-09-05',
        operatorName: 'Sec Tester',
        type: 'photo_strip',
      },
    });
    const { sessionId, token } = JSON.parse(createRes.body).data;

    // 2. Select default 3-photo template
    const templatesRes = await app.inject({ method: 'GET', url: '/api/templates' });
    const template = JSON.parse(templatesRes.body).data[0];
    await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/template`,
      headers: { 'x-session-token': token },
      payload: { templateId: template.id },
    });

    // 3. Construct multipart upload with captureIndex = 999 (exceeds 3)
    const boundary = '----WebKitFormBoundaryTest123';
    const samplePng = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
      'hex',
    );
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="captureIndex"\r\n\r\n999\r\n`,
      ),
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="photo.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      samplePng,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const badSlotRes = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/captures/photo`,
      headers: {
        'x-session-token': token,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    expect(badSlotRes.statusCode).toBe(400);
    const badBody = JSON.parse(badSlotRes.body);
    expect(badBody.success).toBe(false);
    expect(badBody.error.code).toBe('INVALID_SLOT');
  });

  it('sanitizes overlay labels to prevent directory traversal in renderer', async () => {
    const pngBuffer = await photoStripRenderer.renderStrip({
      width: 1200,
      height: 1800,
      backgroundColor: '#ffffff',
      placements: [{ captureIndex: 1, x: 100, y: 100, width: 400, height: 300 }],
      overlays: [
        {
          label: '../../../../etc/shadow',
          x: 50,
          y: 50,
          width: 200,
          height: 100,
          zIndex: 10,
        },
      ],
      captures: [],
      publicId: 'Safe001',
      qrUrl: 'https://myphotobooth.com/Safe001',
    });

    expect(Buffer.isBuffer(pngBuffer)).toBe(true);
    expect(pngBuffer.length).toBeGreaterThan(1000);
  });

  it('enforces maximum 4-retake ceiling atomically in repository', async () => {
    const fakeSessionId = 'atomic-retake-session';
    // Simulate retakes in in-memory repository
    await dbRepository.savePhotoCapture(fakeSessionId, 1, '/tmp/1.jpg', false);
    await dbRepository.savePhotoCapture(fakeSessionId, 1, '/tmp/1_r1.jpg', true); // 1
    await dbRepository.savePhotoCapture(fakeSessionId, 1, '/tmp/1_r2.jpg', true); // 2
    await dbRepository.savePhotoCapture(fakeSessionId, 1, '/tmp/1_r3.jpg', true); // 3
    const finalAllowed = await dbRepository.savePhotoCapture(
      fakeSessionId,
      1,
      '/tmp/1_r4.jpg',
      true,
    ); // 4
    expect(finalAllowed.retakeCount).toBe(4);

    // 5th retake attempt must throw
    await expect(
      dbRepository.savePhotoCapture(fakeSessionId, 1, '/tmp/1_r5.jpg', true),
    ).rejects.toThrow('Maximum retake limit of 4 reached for this session');
  });

  it('creates and updates normalized template layouts with placements and overlays', async () => {
    const created = await dbRepository.createTemplate(
      'Custom Admin Strip',
      'portrait',
      1200,
      1800,
      'templates/custom.png',
      2,
      5,
      [
        {
          captureIndex: 1,
          x: 50,
          y: 50,
          width: 500,
          height: 400,
          rotation: 0,
          borderRadius: 10,
          zIndex: 1,
        },
        {
          captureIndex: 2,
          x: 50,
          y: 500,
          width: 500,
          height: 400,
          rotation: 0,
          borderRadius: 10,
          zIndex: 1,
        },
      ],
      [
        {
          label: 'Event Watermark',
          assetPath: 'templates/overlays/watermark.png',
          x: 0,
          y: 0,
          width: 1200,
          height: 200,
          rotation: 0,
          zIndex: 2,
        },
      ],
    );

    expect(created.id).toBeDefined();
    expect(created.placements).toHaveLength(2);
    expect(created.overlays).toHaveLength(1);

    // Update layout atomically
    const updated = await dbRepository.updateTemplateLayout(
      created.id,
      [
        {
          captureIndex: 1,
          x: 60,
          y: 60,
          width: 520,
          height: 420,
          rotation: 5,
          borderRadius: 12,
          zIndex: 1,
        },
      ],
      [],
    );
    expect(updated).toBe(true);

    const fetched = await dbRepository.getTemplateById(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.placements).toHaveLength(1);
    expect(fetched!.placements[0].width).toBe(520);
    expect(fetched!.overlays).toHaveLength(0);
  });
});
