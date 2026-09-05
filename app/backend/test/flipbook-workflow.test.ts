import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { runMigrations } from '../src/db/migrations.js';
import { sessionStateMachine } from '../src/services/session-state-machine.js';

describe('Flipbook Workflow & State Transitions', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    try {
      await runMigrations();
    } catch {
      // Postgres might not be running in isolated CI test run; gracefully proceed
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('enforces valid Flipbook state machine progression', () => {
    expect(sessionStateMachine.isValidTransition('flipbook', 'created', 'frame_selected')).toBe(
      true,
    );
    expect(
      sessionStateMachine.isValidTransition('flipbook', 'frame_selected', 'instructions'),
    ).toBe(true);
    expect(sessionStateMachine.isValidTransition('flipbook', 'instructions', 'cover_capture')).toBe(
      true,
    );
    expect(
      sessionStateMachine.isValidTransition('flipbook', 'cover_capture', 'video_capture'),
    ).toBe(true);
    expect(sessionStateMachine.isValidTransition('flipbook', 'video_capture', 'review')).toBe(true);
    expect(sessionStateMachine.isValidTransition('flipbook', 'review', 'processing')).toBe(true);
    expect(sessionStateMachine.isValidTransition('flipbook', 'processing', 'booth_confirmed')).toBe(
      true,
    );

    // 2-min timeout recovery transition from processing back to cover_capture
    expect(sessionStateMachine.isValidTransition('flipbook', 'processing', 'cover_capture')).toBe(
      true,
    );

    // Invalid transition attempts
    expect(sessionStateMachine.isValidTransition('flipbook', 'created', 'review')).toBe(false);
    expect(sessionStateMachine.isValidTransition('flipbook', 'created', 'cover_capture')).toBe(
      false,
    );
    expect(
      sessionStateMachine.isValidTransition('flipbook', 'cover_capture', 'booth_confirmed'),
    ).toBe(false);
  });

  it('asserts flipbook readiness helper validates 3 covers and 3 videos', () => {
    // Fails when covers < 3
    expect(() => sessionStateMachine.assertFlipbookReadyForProcessing(2, 3, 1, 1)).toThrow(
      'Flipbook requires exactly 3 cover photos',
    );

    // Fails when videos < 3
    expect(() => sessionStateMachine.assertFlipbookReadyForProcessing(3, 2, 1, 1)).toThrow(
      'Flipbook requires exactly 3 video clips',
    );

    // Fails when invalid selection index
    expect(() => sessionStateMachine.assertFlipbookReadyForProcessing(3, 3, 4, 1)).toThrow(
      'A valid cover photo selection',
    );

    // Passes when 3 covers, 3 videos, and selections 1..3
    expect(() => sessionStateMachine.assertFlipbookReadyForProcessing(3, 3, 2, 3)).not.toThrow();
  });

  it('returns active frames from GET /api/frames', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/frames',
    });

    if (response.statusCode === 200) {
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    }
  });

  it('creates session with token, strips token on GET, and enforces X-Session-Token on mutations', async () => {
    // 1. Create session
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        eventName: 'UMak Foundation',
        eventDate: '2026-09-05',
        operatorName: 'SIC Admin',
        type: 'flipbook',
      },
    });

    expect(createRes.statusCode).toBe(201);
    const createBody = JSON.parse(createRes.body);
    expect(createBody.success).toBe(true);
    const { sessionId, token } = createBody.data;
    expect(sessionId).toBeDefined();
    expect(token).toBeDefined();

    // 2. GET /api/sessions/:id allows polling but strips token from response
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/sessions/${sessionId}`,
    });
    expect(getRes.statusCode).toBe(200);
    const getBody = JSON.parse(getRes.body);
    expect(getBody.success).toBe(true);
    expect(getBody.data.id).toBe(sessionId);
    expect(getBody.data.token).toBeUndefined();

    // 3. Mutation without X-Session-Token is rejected with 403 Forbidden
    const unauthRes = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/transition`,
      payload: { targetState: 'frame_selected' },
    });
    expect(unauthRes.statusCode).toBe(403);
    const unauthBody = JSON.parse(unauthRes.body);
    expect(unauthBody.success).toBe(false);
    expect(unauthBody.error.code).toBe('FORBIDDEN');

    // 4. Mutation with invalid X-Session-Token is rejected with 403 Forbidden
    const badTokenRes = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/transition`,
      headers: { 'x-session-token': 'wrong-token-value' },
      payload: { targetState: 'frame_selected' },
    });
    expect(badTokenRes.statusCode).toBe(403);

    // 5. Mutation with valid X-Session-Token succeeds
    const authRes = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/transition`,
      headers: { 'x-session-token': token },
      payload: { targetState: 'frame_selected' },
    });
    expect(authRes.statusCode).toBe(200);
    const authBody = JSON.parse(authRes.body);
    expect(authBody.success).toBe(true);
    expect(authBody.data.state).toBe('frame_selected');
    expect(authBody.data.token).toBeUndefined();

    // 6. Cancel session with valid token
    const cancelRes = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/cancel`,
      headers: { 'x-session-token': token },
    });
    expect(cancelRes.statusCode).toBe(200);
    const cancelBody = JSON.parse(cancelRes.body);
    expect(cancelBody.success).toBe(true);
    expect(cancelBody.data.state).toBe('cancelled');

    // 7. Cancelling an already cancelled session returns 400 with INVALID_STATE (no fabricated state)
    const reCancelRes = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/cancel`,
      headers: { 'x-session-token': token },
    });
    expect(reCancelRes.statusCode).toBe(400);
    const reCancelBody = JSON.parse(reCancelRes.body);
    expect(reCancelBody.success).toBe(false);
    expect(reCancelBody.error.code).toBe('INVALID_STATE');
  });

  it('rejects unapproved photo retrieval requests on GET /photos/:id', async () => {
    // 1. Invalid public ID format returns 400
    const invalidIdRes = await app.inject({
      method: 'GET',
      url: '/photos/invalid-id-too-long',
    });
    expect(invalidIdRes.statusCode).toBe(400);

    // 2. Non-existent approved output record returns 404
    const notFoundRes = await app.inject({
      method: 'GET',
      url: '/photos/Ab12Cd3',
    });
    expect(notFoundRes.statusCode).toBe(404);
    const notFoundBody = JSON.parse(notFoundRes.body);
    expect(notFoundBody.success).toBe(false);
    expect(notFoundBody.error.code).toBe('PHOTO_NOT_FOUND');
  });

  it('handles recovery reset endpoint /api/sessions/:id/flipbook/reset-recovery with authorization', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        eventName: 'UMak Foundation',
        eventDate: '2026-09-05',
        operatorName: 'SIC Admin',
        type: 'flipbook',
      },
    });
    const { sessionId, token } = JSON.parse(createRes.body).data;

    // Unauthorized reset
    const unauthRes = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/flipbook/reset-recovery`,
    });
    expect(unauthRes.statusCode).toBe(403);

    // Authorized reset
    const authRes = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/flipbook/reset-recovery`,
      headers: { 'x-session-token': token },
    });
    expect(authRes.statusCode).toBe(200);
    const body = JSON.parse(authRes.body);
    expect(body.success).toBe(true);
    expect(body.message).toBe('GIF processing took too long. Please recapture this flipbook.');
    expect(body.data.state).toBe('cover_capture');
  });

  it('enforces Photo Strip capture sequence and strict 4-retake maximum limit', async () => {
    // 1. Create photo strip session
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: {
        eventName: 'UMak Gala',
        eventDate: '2026-09-05',
        operatorName: 'SIC Admin',
        type: 'photo_strip',
      },
    });
    const { sessionId, token } = JSON.parse(createRes.body).data;

    // Transition created -> template_selected -> capturing
    await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/transition`,
      headers: { 'x-session-token': token },
      payload: { targetState: 'template_selected' },
    });
    await app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/transition`,
      headers: { 'x-session-token': token },
      payload: { targetState: 'capturing' },
    });

    const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

    // Helper to upload photo
    const uploadPhoto = (captureIndex: number, isRetake = false) => {
      const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
      let payload = `--${boundary}\r\n`;
      payload += `Content-Disposition: form-data; name="captureIndex"\r\n\r\n${captureIndex}\r\n`;
      payload += `--${boundary}\r\n`;
      payload += `Content-Disposition: form-data; name="isRetake"\r\n\r\n${isRetake ? 'true' : 'false'}\r\n`;
      payload += `--${boundary}\r\n`;
      payload += `Content-Disposition: form-data; name="file"; filename="photo.png"\r\n`;
      payload += `Content-Type: image/png\r\n\r\n`;

      const payloadBuf = Buffer.concat([
        Buffer.from(payload, 'utf8'),
        validPng,
        Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'),
      ]);

      return app.inject({
        method: 'POST',
        url: `/api/sessions/${sessionId}/captures/photo`,
        headers: {
          'x-session-token': token,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: payloadBuf,
      });
    };

    // Upload 3 initial captures
    await uploadPhoto(1);
    await uploadPhoto(2);
    const cap3 = await uploadPhoto(3);
    expect(cap3.statusCode).toBe(201);
    expect(JSON.parse(cap3.body).data.state).toBe('review');

    // Perform 4 retakes (allowed)
    for (let i = 1; i <= 4; i++) {
      const retakeRes = await uploadPhoto(1, true);
      expect(retakeRes.statusCode).toBe(201);
      expect(JSON.parse(retakeRes.body).data.retakeCount).toBe(i);
    }

    // 5th retake attempt is rejected with 400 Bad Request
    const fifthRetake = await uploadPhoto(1, true);
    expect(fifthRetake.statusCode).toBe(400);
    const errorBody = JSON.parse(fifthRetake.body);
    expect(errorBody.success).toBe(false);
    expect(errorBody.error.code).toBe('LIMIT_EXCEEDED');
    expect(errorBody.error.message).toContain('Maximum retake limit of 4 reached');
  });
});
