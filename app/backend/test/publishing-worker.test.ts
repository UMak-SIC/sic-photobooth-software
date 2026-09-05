import { beforeAll, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cloudinaryUpload: vi.fn(),
  cloudinaryDestroy: vi.fn(),
  supabaseFrom: vi.fn(),
  supabaseUpsert: vi.fn(),
  supabaseSelect: vi.fn(),
  supabaseEq: vi.fn(),
  supabaseMaybeSingle: vi.fn(),
}));

vi.mock('cloudinary', () => ({
  v2: {
    config: vi.fn(),
    uploader: { upload: mocks.cloudinaryUpload, destroy: mocks.cloudinaryDestroy },
  },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mocks.supabaseFrom })),
}));

describe('Publishing worker', () => {
  let cloudinaryV2: {
    uploader: { upload: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
  };
  let worker: typeof import('../src/services/publishing-worker.js');
  let repo: typeof import('../src/db/repository.js');

  beforeAll(async () => {
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    process.env.CLOUDINARY_API_KEY = 'test-key';
    process.env.CLOUDINARY_API_SECRET = 'test-secret';
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    process.env.PUBLIC_APP_URL = '';
    mocks.supabaseEq.mockReturnValue({ maybeSingle: mocks.supabaseMaybeSingle });
    mocks.supabaseSelect.mockReturnValue({ eq: mocks.supabaseEq });
    mocks.supabaseFrom.mockReturnValue({
      upsert: mocks.supabaseUpsert,
      select: mocks.supabaseSelect,
    });
    cloudinaryV2 = (await import('cloudinary')).v2;
    worker = await import('../src/services/publishing-worker.js');
    repo = await import('../src/db/repository.js');
  });

  it('uploads a queued publication and marks it uploaded', async () => {
    cloudinaryV2.uploader.upload.mockResolvedValue({
      secure_url: 'https://res.cloudinary.com/test/image/upload/v1/photobooth/WkrTst',
      public_id: 'photobooth/WkrTst',
    });
    mocks.supabaseUpsert.mockResolvedValue({ error: null });
    await repo.dbRepository.saveGeneratedOutput(
      'worker-happy-session',
      'WkrTst',
      'image/png',
      'outputs/worker-happy.png',
      1200,
      1800,
    );

    const finalizedAt = new Date('2099-09-05T12:00:00.000Z');
    await worker.processQueuedPublications(finalizedAt);

    expect(cloudinaryV2.uploader.upload).toHaveBeenCalledWith(
      'outputs/worker-happy.png',
      expect.objectContaining({ resource_type: 'image' }),
    );
    expect(mocks.supabaseUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        public_id: 'WkrTst',
        cloudinary_public_id: 'photobooth/WkrTst',
        status: 'uploaded',
        cloud_finalized_at: expect.any(String),
      }),
      { onConflict: 'public_id' },
    );
    const pubs = await repo.dbRepository.listPublications();
    const pub = pubs.find((p: { publicId: string }) => p.publicId === 'WkrTst');
    expect(pub.status).toBe('uploaded');
    expect(pub.cloudinaryUrl).toBe(
      'https://res.cloudinary.com/test/image/upload/v1/photobooth/WkrTst',
    );
    expect(pub.cloudinaryPublicId).toBe('photobooth/WkrTst');
    expect(pub.cloudFinalizedAt).not.toBeNull();
    expect(pub.expiresAt).not.toBeNull();
  });

  it('requeues a failed upload and dead-letters after five attempts', async () => {
    cloudinaryV2.uploader.upload.mockRejectedValue(new Error('network down'));
    await repo.dbRepository.saveGeneratedOutput(
      'worker-fail-session',
      'WkrFl1',
      'image/png',
      'outputs/worker-fail.png',
      1200,
      1800,
    );

    const firstAttempt = new Date('2099-09-05T13:00:00.000Z');
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await worker.processQueuedPublications(
        new Date(firstAttempt.getTime() + (attempt - 1) * 60 * 60 * 1000),
      );
      const pubs = await repo.dbRepository.listPublications();
      const pub = pubs.find((p: { publicId: string }) => p.publicId === 'WkrFl1');
      expect(pub.status).toBe('queued');
      expect(pub.retryCount).toBe(attempt);
      expect(pub.lastError).toBe('network down');
      expect(pub.nextAttemptAt).not.toBeNull();
    }

    await worker.processQueuedPublications(new Date(firstAttempt.getTime() + 4 * 60 * 60 * 1000));
    const pubs = await repo.dbRepository.listPublications();
    const pub = pubs.find((p: { publicId: string }) => p.publicId === 'WkrFl1');
    expect(pub.status).toBe('failed');
    expect(pub.retryCount).toBe(5);
    expect(pub.nextAttemptAt).toBeNull();
  });

  it('retries when Cloudinary succeeds but Supabase registration fails', async () => {
    cloudinaryV2.uploader.upload.mockResolvedValue({
      secure_url: 'https://res.cloudinary.com/test/image/upload/v1/photobooth/WkrSb1',
      public_id: 'photobooth/WkrSb1',
    });
    mocks.supabaseUpsert.mockResolvedValue({ error: { message: 'database unavailable' } });
    await repo.dbRepository.saveGeneratedOutput(
      'worker-supabase-session',
      'WkrSb1',
      'image/png',
      'outputs/worker-supabase.png',
      1200,
      1800,
    );

    await worker.processQueuedPublications(new Date('2099-09-05T14:00:00.000Z'));

    const pub = (await repo.dbRepository.listPublications()).find(
      (item: { publicId: string }) => item.publicId === 'WkrSb1',
    );
    expect(pub.status).toBe('queued');
    expect(pub.retryCount).toBe(1);
    expect(pub.lastError).toContain('Supabase publication record failed: database unavailable');
  });

  it('cleans up a Cloudinary asset when the final Supabase attempt is definitely absent', async () => {
    cloudinaryV2.uploader.upload.mockResolvedValue({
      secure_url: 'https://res.cloudinary.com/test/image/upload/v1/photobooth/WkrOr1',
      public_id: 'photobooth/WkrOr1',
    });
    cloudinaryV2.uploader.destroy.mockResolvedValue({ result: 'ok' });
    mocks.supabaseUpsert.mockResolvedValue({ error: { message: 'database unavailable' } });
    mocks.supabaseMaybeSingle.mockResolvedValue({ data: null, error: null });
    await repo.dbRepository.saveGeneratedOutput(
      'worker-orphan-session',
      'WkrOr1',
      'image/png',
      'outputs/worker-orphan.png',
      1200,
      1800,
    );
    const publication = (await repo.dbRepository.listPublications()).find(
      (item: { publicId: string }) => item.publicId === 'WkrOr1',
    );
    for (let retry = 1; retry <= 4; retry += 1) {
      await repo.dbRepository.markPublicationFailed(
        publication.id,
        'prior failure',
        new Date('2000-01-01T00:00:00.000Z'),
      );
    }

    await worker.processQueuedPublications(new Date('2099-09-05T14:30:00.000Z'));

    expect(cloudinaryV2.uploader.destroy).toHaveBeenCalledWith('photobooth/WkrOr1', {
      resource_type: 'image',
      invalidate: true,
    });
    const updated = (await repo.dbRepository.listPublications()).find(
      (item: { publicId: string }) => item.publicId === 'WkrOr1',
    );
    expect(updated.status).toBe('failed');
    expect(updated.retryCount).toBe(5);
  });

  it('requeues a stalled in-progress job when the worker restarts', async () => {
    await repo.dbRepository.saveGeneratedOutput(
      'worker-stalled-session',
      'WkrSt1',
      'image/png',
      'outputs/worker-stalled.png',
      1200,
      1800,
    );
    const claimedAt = new Date('2099-09-05T15:00:00.000Z');
    await repo.dbRepository.claimQueuedPublications(2, claimedAt);

    await repo.dbRepository.recoverStalledPublications(
      new Date(claimedAt.getTime() + 6 * 60 * 1000),
      5,
    );

    const pub = (await repo.dbRepository.listPublications()).find(
      (item: { publicId: string }) => item.publicId === 'WkrSt1',
    );
    expect(pub.status).toBe('queued');
    expect(pub.retryCount).toBe(1);
    expect(pub.lastError).toBe('Upload worker interrupted; job requeued.');
  });

  it('uses equal jitter within each exponential backoff window', () => {
    expect(worker.retryDelayMs(1, () => 0)).toBe(2500);
    expect(worker.retryDelayMs(1, () => 1)).toBe(5000);
    expect(worker.retryDelayMs(5, () => 0)).toBe(40000);
    expect(worker.retryDelayMs(5, () => 1)).toBe(80000);
  });
});
