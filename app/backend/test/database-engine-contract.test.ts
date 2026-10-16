import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseProvider } from '../src/db/contracts.js';
import {
  checkDatabaseHealth,
  closeDatabaseProvider,
  createSqliteProvider,
  dbRepository,
  setDatabaseProvider,
  templateRepository,
} from '../src/db/provider.js';
import { SqliteDatabaseRepository } from '../src/db/sqlite/repository.js';
import { SqliteTemplateRepository } from '../src/templates/sqlite-repository.js';

const CORE_METHODS = [
  'listEvents',
  'getEventById',
  'createEvent',
  'deleteEvent',
  'getOrCreateEvent',
  'createSession',
  'getSessionById',
  'updateSessionState',
  'cancelSession',
  'listActiveFrames',
  'getFrameById',
  'createFrame',
  'setSessionFrame',
  'saveCoverCapture',
  'savePhotoCapture',
  'saveVideoCapture',
  'getFlipbookCaptures',
  'recordFlipbookSelection',
  'resetFlipbookToCoverCapture',
  'getPhotoCaptures',
  'saveGeneratedOutput',
  'getApprovedOutputByPublicId',
  'getLatestOutputForSession',
  'getOutputByPublicId',
  'listPublications',
  'getPublicationOutput',
  'retryPublication',
  'deleteLocalPublication',
  'removeCloudPublication',
  'claimQueuedPublications',
  'markPublicationUploaded',
  'markPublicationFailed',
  'recoverStalledPublications',
  'createPrintJob',
  'getPrintJob',
  'getPrintJobArtifact',
  'listPrintJobs',
  'claimQueuedPrintJobs',
  'listActivePrintAttempts',
  'listSupersededPrintAttempts',
  'createPrintAttempt',
  'updatePrintAttempt',
  'updatePrintJobStatus',
  'getCurrentCupsJobId',
  'cancelPrintJob',
  'retryPrintJob',
  'reprintPrintJob',
  'completePrintJob',
  'recordPrintStatus',
  'listActiveTemplates',
  'getTemplateById',
  'createTemplate',
  'updateTemplateLayout',
  'selectTemplate',
  'getAnalyticsData',
];
const TEMPLATE_METHODS = [
  'list',
  'get',
  'create',
  'update',
  'setActive',
  'setBackgroundPath',
  'setCoverPath',
  'reorder',
  'addOverlayPath',
  'delete',
];
const SESSION_ID = '11111111-1111-4111-8111-111111111111';

afterEach(() => {
  vi.clearAllMocks();
  setDatabaseProvider(undefined);
});

describe('database provider', () => {
  it('implements every contract method', () => {
    for (const method of CORE_METHODS) {
      expect(
        typeof SqliteDatabaseRepository.prototype[method as keyof SqliteDatabaseRepository],
        method,
      ).toBe('function');
    }
    for (const method of TEMPLATE_METHODS) {
      expect(
        typeof SqliteTemplateRepository.prototype[method as keyof SqliteTemplateRepository],
        method,
      ).toBe('function');
    }
  });

  it('routes application calls to the active provider at call time', async () => {
    const getSessionById = vi.fn().mockResolvedValue({ id: SESSION_ID });
    const list = vi.fn().mockResolvedValue([]);
    setDatabaseProvider({
      engine: 'sqlite',
      repository: { getSessionById },
      templates: { list },
    } as unknown as DatabaseProvider);

    await expect(dbRepository.getSessionById(SESSION_ID)).resolves.toEqual({ id: SESSION_ID });
    await expect(templateRepository.list('flipbook')).resolves.toEqual([]);
    expect(getSessionById).toHaveBeenCalledWith(SESSION_ID);
    expect(list).toHaveBeenCalledWith('flipbook');
  });

  it('reports a failing database as unhealthy instead of throwing', async () => {
    setDatabaseProvider({
      checkHealth: vi.fn().mockRejectedValue(new Error('disk gone')),
    } as unknown as DatabaseProvider);
    await expect(checkDatabaseHealth()).resolves.toEqual({ ok: false, error: 'disk gone' });
  });

  it('closes the SQLite connection once through the provider', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'photobooth-provider-'));
    try {
      const provider = createSqliteProvider(path.join(directory, 'photobooth.sqlite'));
      const close = vi.spyOn(provider, 'close');
      setDatabaseProvider(provider);
      await closeDatabaseProvider();
      await closeDatabaseProvider();
      expect(close).toHaveBeenCalledTimes(1);
      await expect(provider.checkHealth()).resolves.toMatchObject({ ok: false });
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
