import crypto from 'node:crypto';
import fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { isUniqueViolation, type TemplateItem } from '../src/db/contracts.js';
import { closeSqliteConnection, createSqliteConnection } from '../src/db/sqlite/connection.js';
import { nextPublicId, seedConfirmedOutput, temporaryDatabases } from './helpers/sqlite.js';

const CANONICAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const databases = temporaryDatabases();
afterEach(() => databases.cleanup());

const placement = (captureIndex: number) => ({
  captureIndex,
  x: 10,
  y: 20 * captureIndex,
  width: 300,
  height: 200,
  rotation: 0,
  borderRadius: 0,
  zIndex: 1,
});

describe('SQLite core repository', () => {
  it('stores canonical UTC timestamps, 0/1 booleans, and normalized JSON', async () => {
    const filename = databases.path();
    const provider = await databases.open(filename);
    const { sessionId } = await seedConfirmedOutput(provider.repository);
    const template = (await provider.repository.listActiveTemplates())[0];
    await provider.repository.selectTemplate(sessionId, template);

    const db = createSqliteConnection(filename);
    try {
      const row = db
        .prepare('SELECT created_at, last_activity_at, is_printed, template_snapshot FROM sessions WHERE id = ?')
        .get(sessionId) as Record<string, unknown>;
      expect(row.created_at).toMatch(CANONICAL);
      expect(row.last_activity_at).toMatch(CANONICAL);
      expect(row.is_printed).toBe(0);
      expect(row.template_snapshot).toBe(JSON.stringify(JSON.parse(row.template_snapshot as string)));
    } finally {
      closeSqliteConnection(db);
    }

    const session = await provider.repository.getSessionById(sessionId);
    expect(session?.createdAt).toBeInstanceOf(Date);
    expect(session?.isPrinted).toBe(false);
    expect(session?.cancelledAt).toBeNull();
    expect(session?.templateSnapshot).toMatchObject({ id: 'grid-landscape', placements: template.placements });
  });

  it('rolls back every statement of a failed multi-step write', async () => {
    const provider = await databases.open();
    const { sessionId, output } = await seedConfirmedOutput(provider.repository);
    const event = await provider.repository.getOrCreateEvent('Rollback', '2026-10-16', 'Op');
    const other = await provider.repository.createSession(event.id, 'photo_strip', 'rollback-token');

    // Duplicate public ID: the output insert fails after nothing else may persist.
    await expect(
      provider.repository.saveGeneratedOutput(other.id, output.publicId, 'image/png', 'x.png', 1, 1),
    ).rejects.toThrow(/UNIQUE/);
    expect((await provider.repository.getSessionById(other.id))?.state).toBe('created');
    expect(await provider.repository.getLatestOutputForSession(other.id)).toBeNull();

    // Retake ceiling: the failed fifth retake leaves the counter and capture untouched.
    await provider.repository.savePhotoCapture(sessionId, 1, 'captures/a.jpg');
    for (let retake = 1; retake <= 4; retake++) {
      await provider.repository.savePhotoCapture(sessionId, 1, `captures/r${retake}.jpg`, true);
    }
    await expect(
      provider.repository.savePhotoCapture(sessionId, 1, 'captures/r5.jpg', true),
    ).rejects.toThrow('Maximum retake limit of 4 reached for this session');
    expect((await provider.repository.getSessionById(sessionId))?.retakeCount).toBe(4);
    const captures = await provider.repository.getPhotoCaptures(sessionId);
    expect(captures).toHaveLength(1);
    expect(captures[0].filePath).toMatch(/captures\/r4\.jpg$/);
  });

  it('enforces foreign keys, checks, and reports unique violations engine-neutrally', async () => {
    const provider = await databases.open();
    await expect(
      provider.repository.createSession(crypto.randomUUID(), 'photo_strip', 'orphan'),
    ).rejects.toThrow(/FOREIGN KEY/);

    await provider.repository.createEvent('Unique', '2026-10-16', 'Op');
    const duplicate = await provider.repository
      .createEvent('Unique', '2026-10-16', 'Op')
      .catch((error: unknown) => error);
    expect(isUniqueViolation(duplicate)).toBe(true);

    const { sessionId } = await seedConfirmedOutput(provider.repository);
    await expect(
      provider.repository.saveGeneratedOutput(sessionId, 'short', 'image/png', 'x.png', 1, 1),
    ).rejects.toThrow(/CHECK constraint/);
  });

  it('persists across a restart and checkpoints the WAL on close', async () => {
    const filename = databases.path();
    const first = await databases.open(filename);
    expect(fs.existsSync(`${filename}-wal`)).toBe(true);
    const { output } = await seedConfirmedOutput(first.repository);
    await first.close();
    expect(fs.existsSync(`${filename}-wal`) ? fs.statSync(`${filename}-wal`).size : 0).toBe(0);

    const second = await databases.open(filename);
    expect((await second.migrate()).applied).toEqual([]);
    expect((await second.repository.getOutputByPublicId(output.publicId))?.id).toBe(output.id);
    expect(await second.checkHealth()).toEqual({ ok: true });
  });

  it('orders by canonical timestamps and keeps insertion order for equal timestamps', async () => {
    const provider = await databases.open();
    const seeded = [];
    for (let index = 0; index < 5; index++) seeded.push(await seedConfirmedOutput(provider.repository));
    const listed = (await provider.repository.listPublications()).map((p) => p.publicId);
    expect(listed).toEqual(seeded.map((s) => s.output.publicId).reverse());

    const before = new Date(Date.now() + 60_000);
    const jobs = await provider.repository.listPrintJobs(10, before);
    expect(jobs).toEqual([]);
  });

  it('matches names case-insensitively (Unicode-aware) and treats LIKE wildcards literally', async () => {
    const provider = await databases.open();
    const eclair = await provider.repository.createFrame('Éclair Frame', 'frames/eclair.png');
    await provider.repository.createFrame('100% Fun_Frame', 'frames/fun.png');

    expect((await provider.repository.getFrameById('éCLAIR'))?.id).toBe(eclair.id);
    expect((await provider.repository.getFrameById('% fun_'))?.name).toBe('100% Fun_Frame');
    // A bare wildcard is a literal character, not "match anything".
    expect((await provider.repository.getFrameById('_'))?.name).toBe('100% Fun_Frame');
    // Unknown names fall back to the read-only built-in catalog, never to stored state.
    expect((await provider.repository.getFrameById('Pioneer'))?.id).toBe('3');
    expect((await provider.repository.listActiveFrames()).map((f) => f.name)).toEqual([
      'Éclair Frame',
      '100% Fun_Frame',
    ]);
  });

  it('snapshots the template so later edits never change an existing session', async () => {
    const provider = await databases.open();
    const { sessionId } = await seedConfirmedOutput(provider.repository);
    const created = await provider.repository.createTemplate(
      'Snapshot Strip',
      'portrait',
      1200,
      1800,
      'templates/bg.png',
      2,
      5,
      [placement(1), placement(2)],
    );
    const selected = await provider.repository.selectTemplate(sessionId, created as TemplateItem);
    expect(selected?.templateId).toBe(created.id);

    expect(await provider.repository.updateTemplateLayout(created.id, [placement(1)])).toBe(true);
    expect(await provider.repository.updateTemplateLayout(crypto.randomUUID(), [])).toBe(false);
    expect((await provider.repository.getTemplateById(created.id))?.placements).toHaveLength(1);
    const snapshot = (await provider.repository.getSessionById(sessionId))?.templateSnapshot as {
      placements: unknown[];
    };
    expect(snapshot.placements).toHaveLength(2);
  });

  it('runs the publication lifecycle: claim, fail, dead-letter, retry, upload, remove, recover', async () => {
    const provider = await databases.open();
    const repo = provider.repository;
    const { output } = await seedConfirmedOutput(repo);
    const [publication] = await repo.listPublications();
    expect(publication.nextAttemptAt).toBeInstanceOf(Date);

    const now = new Date(Date.now() + 1_000);
    const [claimed] = await repo.claimQueuedPublications(5, now);
    expect(claimed).toMatchObject({ id: publication.id, publicId: output.publicId, retryCount: 0 });
    expect(await repo.claimQueuedPublications(5, now)).toEqual([]);

    await repo.markPublicationFailed(publication.id, 'boom', null);
    let current = (await repo.listPublications())[0];
    expect(current).toMatchObject({ status: 'failed', retryCount: 1, lastError: 'boom', nextAttemptAt: null });

    expect((await repo.retryPublication(publication.id))?.status).toBe('queued');
    expect(await repo.retryPublication(publication.id)).toBeNull();

    const finalized = new Date('2026-10-16T00:00:00.000Z');
    const expires = new Date('2026-12-16T00:00:00.000Z');
    await repo.claimQueuedPublications(5, new Date(Date.now() + 1_000));
    expect(await repo.markPublicationUploaded(publication.id, 'https://x', 'pb/x', finalized, expires)).toBe(true);
    current = (await repo.listPublications())[0];
    expect(current).toMatchObject({ status: 'uploaded', cloudFinalizedAt: finalized, expiresAt: expires });

    expect((await repo.removeCloudPublication(publication.id))?.cloudinaryUrl).toBeNull();

    // Stale in-progress work is requeued and counts toward the dead-letter limit.
    await repo.retryPublication(publication.id);
    await repo.claimQueuedPublications(5, new Date(Date.now() + 1_000));
    await repo.recoverStalledPublications(new Date(Date.now() + 60_000), 1);
    current = (await repo.listPublications())[0];
    expect(current).toMatchObject({ status: 'failed', retryCount: 1, nextAttemptAt: null });

    const deleted = await repo.deleteLocalPublication(publication.id);
    expect(deleted?.publicId).toBe(output.publicId);
    expect(await repo.getOutputByPublicId(output.publicId)).toBeNull();
  });

  it('creates print jobs idempotently and counts completion exactly once', async () => {
    const provider = await databases.open();
    const repo = provider.repository;
    const { sessionId, output } = await seedConfirmedOutput(repo);
    const input = {
      output,
      requestKey: crypto.randomUUID(),
      artifactPath: output.filePath,
      artifactType: 'image/png' as const,
      printerName: 'Test',
      mediaSize: '4x6',
      copies: 2,
      mode: 'simulation' as const,
      rejectAfterInitialCompletion: true,
    };
    const job = await repo.createPrintJob(input);
    expect(await repo.createPrintJob(input)).toEqual(job);
    expect(job).toMatchObject({ status: 'queued', copiesRequested: 2, copiesWaiting: 2, outputType: 'photo_strip' });

    const [claimed] = await repo.claimQueuedPrintJobs(4);
    expect(claimed.status).toBe('submitting');
    const attempt = await repo.createPrintAttempt(job!.id);
    expect(attempt).toMatchObject({ attemptNumber: 1, isCurrent: true, title: `sic-print:${job!.id}:1` });
    await repo.updatePrintAttempt(attempt.id, 'pending', 'cups-1');
    expect(await repo.getCurrentCupsJobId(job!.id)).toBe('cups-1');
    expect(await repo.updatePrintJobStatus(job!.id, 'pending', undefined, 'queued')).toBeNull();
    expect((await repo.updatePrintJobStatus(job!.id, 'pending', undefined, 'submitting'))?.status).toBe('pending');
    expect(await repo.listActivePrintAttempts()).toMatchObject([{ id: job!.id, attemptId: attempt.id, cupsJobId: 'cups-1' }]);

    const completed = await repo.completePrintJob(job!.id, attempt.id);
    expect(completed).toMatchObject({ status: 'completed', copiesCompleted: 2, copiesWaiting: 0 });
    expect(await repo.completePrintJob(job!.id, attempt.id)).toBeNull();
    const session = await repo.getSessionById(sessionId);
    expect(session).toMatchObject({ state: 'printed', isPrinted: true, copiesPrinted: 2 });

    // After an initial completion, new initial jobs are rejected; reprints are allowed.
    expect(await repo.createPrintJob({ ...input, requestKey: crypto.randomUUID() })).toBeNull();
    const reprint = await repo.reprintPrintJob(job!.id, crypto.randomUUID());
    expect(reprint).toMatchObject({ status: 'queued', copiesRequested: 2 });

    // Retrying supersedes the current attempt so a late CUPS completion is surfaced, not counted.
    await repo.claimQueuedPrintJobs(4);
    const reprintAttempt = await repo.createPrintAttempt(reprint!.id);
    await repo.updatePrintAttempt(reprintAttempt.id, 'failed', 'cups-2', 'jam');
    await repo.updatePrintJobStatus(reprint!.id, 'failed', 'jam');
    expect((await repo.retryPrintJob(reprint!.id))?.status).toBe('queued');
    expect(await repo.listSupersededPrintAttempts()).toEqual([
      { jobId: reprint!.id, attemptId: reprintAttempt.id, cupsJobId: 'cups-2' },
    ]);
    expect((await repo.cancelPrintJob(reprint!.id))?.status).toBe('canceled');
  });

  it('aggregates analytics with canonical date filters', async () => {
    const provider = await databases.open();
    const repo = provider.repository;
    const { sessionId } = await seedConfirmedOutput(repo);
    await repo.recordPrintStatus(sessionId, 3);

    const all = await repo.getAnalyticsData();
    expect(all.summary).toMatchObject({ totalSessions: 1, totalPrints: 3, printedSessions: 1 });
    const future = await repo.getAnalyticsData({ startDate: new Date(Date.now() + 86_400_000).toISOString() });
    expect(future.summary.totalSessions).toBe(0);
    const otherEvent = await repo.getAnalyticsData({ eventId: crypto.randomUUID() });
    expect(otherEvent.summary.totalSessions).toBe(0);
  });

  it('cancels only active sessions and deletes events with cascade', async () => {
    const provider = await databases.open();
    const repo = provider.repository;
    const event = await repo.createEvent('Cancel', '2026-10-16', 'Op', 'desc');
    expect(event.description).toBe('desc');
    const session = await repo.createSession(event.id, 'flipbook', `t-${nextPublicId()}`);
    expect((await repo.cancelSession(session.id))?.cancelledAt).toBeInstanceOf(Date);
    expect(await repo.cancelSession(session.id)).toBeNull();
    expect(await repo.deleteEvent(event.id)).toBe(true);
    expect(await repo.getSessionById(session.id)).toBeNull();
    expect(await repo.deleteEvent('not-a-uuid')).toBe(false);
  });
});

describe('SQLite template store', () => {
  const draft = {
    name: 'Store Template',
    type: 'photo_strip' as const,
    orientation: 'portrait' as const,
    background: { x: 0, y: 0, width: 1200, height: 1800 },
    placements: [placement(1), placement(2)],
    overlays: [{ label: 'Badge', x: 1, y: 2, width: 300, height: 80, rotation: 0, zIndex: 3 }],
  };

  it('round-trips a template with overlay geometry and replaces children on update', async () => {
    const { templates } = await databases.open();
    const created = await templates.create(draft);
    expect(created).toMatchObject({ width: 1200, height: 1800, active: true, requiredCaptureCount: 2 });
    expect(created.overlays[0]).toMatchObject({ width: 300, height: 80, path: null });
    expect(created.createdAt).toBeInstanceOf(Date);

    const withAsset = await templates.addOverlayPath(created.id, created.overlays[0].id!, 'templates/badge.png');
    expect(withAsset?.overlays[0].path).toMatch(/templates\/badge\.png$/);

    const updated = await templates.update(created.id, {
      ...draft,
      placements: [placement(1)],
      overlays: [{ ...draft.overlays[0], id: created.overlays[0].id }],
    });
    expect(updated?.placements).toHaveLength(1);
    // Existing overlay assets survive a layout edit.
    expect(updated?.overlays[0].path).toMatch(/templates\/badge\.png$/);
    expect(await templates.update(crypto.randomUUID(), draft)).toBeNull();
    expect(await templates.get('not-a-uuid')).toBeNull();
  });

  it('orders by sort_order with NULLs last, then case-insensitive name', async () => {
    const { templates } = await databases.open();
    const b = await templates.create({ ...draft, name: 'banana' });
    const a = await templates.create({ ...draft, name: 'Apple' });
    const c = await templates.create({ ...draft, name: 'cherry', type: 'flipbook' });
    expect((await templates.list()).map((t) => t.name)).toEqual(['Apple', 'banana', 'cherry']);
    expect((await templates.list('flipbook')).map((t) => t.id)).toEqual([c.id]);

    expect((await templates.reorder([c.id, b.id])).map((t) => t.name)).toEqual(['cherry', 'banana', 'Apple']);
    expect((await templates.setActive(a.id, false))?.active).toBe(false);
    expect((await templates.setBackgroundPath(a.id, 'templates/a/bg.png'))?.backgroundPath).toMatch(/bg\.png$/);
    expect((await templates.setCoverPath(a.id, 'templates/a/cover.png'))?.coverPath).toMatch(/cover\.png$/);
    expect((await templates.delete(a.id))?.id).toBe(a.id);
    expect(await templates.delete(a.id)).toBeNull();
  });

  it('reports duplicate names as unique violations', async () => {
    const { templates } = await databases.open();
    await templates.create(draft);
    const error = await templates.create(draft).catch((caught: unknown) => caught);
    expect(isUniqueViolation(error)).toBe(true);
  });
});
