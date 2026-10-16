import { afterEach, describe, expect, it, vi } from 'vitest';

// The legacy engine is exercised only through mocks; no test may reach PostgreSQL.
const pg = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
  health: vi.fn(),
  end: vi.fn(),
}));
vi.mock('../src/db/pool.js', () => ({
  pool: { query: pg.query, connect: pg.connect },
  checkDatabaseHealth: pg.health,
  closePool: pg.end,
}));

import type { DatabaseProvider } from '../src/db/contracts.js';
import {
  checkDatabaseHealth,
  closeDatabaseProvider,
  createDatabaseProvider,
  dbRepository,
  setDatabaseProvider,
  templateRepository,
} from '../src/db/provider.js';
import { containsPattern, DatabaseRepository } from '../src/db/repository.js';
import { SqliteDatabaseRepository } from '../src/db/sqlite/repository.js';
import { TemplateRepository } from '../src/templates/repository.js';
import { SqliteTemplateRepository } from '../src/templates/sqlite-repository.js';

const CORE_METHODS = [
  'listEvents', 'getEventById', 'createEvent', 'deleteEvent', 'getOrCreateEvent',
  'createSession', 'getSessionById', 'updateSessionState', 'cancelSession',
  'listActiveFrames', 'getFrameById', 'createFrame', 'setSessionFrame',
  'saveCoverCapture', 'savePhotoCapture', 'saveVideoCapture', 'getFlipbookCaptures',
  'recordFlipbookSelection', 'resetFlipbookToCoverCapture', 'getPhotoCaptures',
  'saveGeneratedOutput', 'getApprovedOutputByPublicId', 'getLatestOutputForSession',
  'getOutputByPublicId', 'listPublications', 'getPublicationOutput', 'retryPublication',
  'deleteLocalPublication', 'removeCloudPublication', 'claimQueuedPublications',
  'markPublicationUploaded', 'markPublicationFailed', 'recoverStalledPublications',
  'createPrintJob', 'getPrintJob', 'getPrintJobArtifact', 'listPrintJobs', 'claimQueuedPrintJobs',
  'listActivePrintAttempts', 'listSupersededPrintAttempts', 'createPrintAttempt',
  'updatePrintAttempt', 'updatePrintJobStatus', 'getCurrentCupsJobId', 'cancelPrintJob',
  'retryPrintJob', 'reprintPrintJob', 'completePrintJob', 'recordPrintStatus',
  'listActiveTemplates', 'getTemplateById', 'createTemplate', 'updateTemplateLayout',
  'selectTemplate', 'getAnalyticsData',
];
const TEMPLATE_METHODS = [
  'list', 'get', 'create', 'update', 'setActive', 'setBackgroundPath', 'setCoverPath',
  'reorder', 'addOverlayPath', 'delete',
];
const SESSION_ID = '11111111-1111-4111-8111-111111111111';

afterEach(() => {
  vi.clearAllMocks();
  setDatabaseProvider(undefined);
});

describe('database engine selection', () => {
  it('defaults to PostgreSQL when LOCAL_DATABASE_ENGINE is unset', async () => {
    const previous = process.env.LOCAL_DATABASE_ENGINE;
    // Empty (not deleted) so a developer's .env cannot repopulate it through dotenv.
    process.env.LOCAL_DATABASE_ENGINE = '';
    try {
      vi.resetModules();
      const { config } = await import('../src/config.js');
      expect(config.localDatabaseEngine).toBe('postgres');
    } finally {
      process.env.LOCAL_DATABASE_ENGINE = previous;
      vi.resetModules();
    }
  });

  it('builds exactly one engine per provider and never dual-writes', () => {
    const postgres = createDatabaseProvider('postgres');
    expect(postgres.engine).toBe('postgres');
    expect(postgres.repository).toBeInstanceOf(DatabaseRepository);
    expect(postgres.templates).toBeInstanceOf(TemplateRepository);
    expect(pg.query).not.toHaveBeenCalled();
    expect(pg.connect).not.toHaveBeenCalled();
  });

  it('implements every contract method on both engines', () => {
    for (const method of CORE_METHODS) {
      expect(typeof DatabaseRepository.prototype[method as keyof DatabaseRepository], method).toBe('function');
      expect(typeof SqliteDatabaseRepository.prototype[method as keyof SqliteDatabaseRepository], method).toBe('function');
    }
    for (const method of TEMPLATE_METHODS) {
      expect(typeof TemplateRepository.prototype[method as keyof TemplateRepository], method).toBe('function');
      expect(typeof SqliteTemplateRepository.prototype[method as keyof SqliteTemplateRepository], method).toBe('function');
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

  it('reports a failing engine as unhealthy instead of throwing', async () => {
    setDatabaseProvider({
      checkHealth: vi.fn().mockRejectedValue(new Error('disk gone')),
    } as unknown as DatabaseProvider);
    await expect(checkDatabaseHealth()).resolves.toEqual({ ok: false, error: 'disk gone' });
  });

  it('closes the PostgreSQL pool once through the provider', async () => {
    setDatabaseProvider(createDatabaseProvider('postgres'));
    await closeDatabaseProvider();
    await closeDatabaseProvider();
    expect(pg.end).toHaveBeenCalledTimes(1);
  });
});

describe('legacy PostgreSQL repository failure semantics', () => {
  const repository = new DatabaseRepository();

  it('propagates query failures instead of serving an in-memory copy', async () => {
    pg.query.mockRejectedValue(new Error('connection refused'));
    await expect(repository.getSessionById(SESSION_ID)).rejects.toThrow('connection refused');
    await expect(repository.listPublications()).rejects.toThrow('connection refused');
    await expect(repository.claimQueuedPublications(2)).rejects.toThrow('connection refused');
    await expect(repository.listActiveFrames()).rejects.toThrow('connection refused');
    await expect(repository.getAnalyticsData()).rejects.toThrow('connection refused');
  });

  it('propagates transaction failures and releases the client after rollback', async () => {
    const client = { query: vi.fn(), release: vi.fn() };
    client.query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO generated_outputs')) throw new Error('disk full');
      return { rows: [], rowCount: 0 };
    });
    pg.connect.mockResolvedValue(client);

    await expect(
      repository.saveGeneratedOutput(SESSION_ID, 'Abc1234', 'image/png', 'x.png', 1, 1),
    ).rejects.toThrow('disk full');
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('returns not-found for malformed identifiers without querying', async () => {
    await expect(repository.getSessionById('not-a-uuid')).resolves.toBeNull();
    await expect(repository.getPrintJob('not-a-uuid')).resolves.toBeNull();
    await expect(repository.deleteEvent('not-a-uuid')).resolves.toBe(false);
    expect(pg.query).not.toHaveBeenCalled();
  });
});

describe('legacy PostgreSQL name lookup', () => {
  it('matches %, _, and backslash literally, like the SQLite instr() lookup', () => {
    expect(containsPattern('Party')).toBe('%Party%');
    expect(containsPattern('100%_off\\x')).toBe('%100\\%\\_off\\\\x%');
  });

  it('escapes the term and orders deterministically for non-UUID frame and template ids', async () => {
    pg.query.mockResolvedValue({ rows: [] });
    const repository = new DatabaseRepository();

    await repository.getFrameById('50%_frame');
    const [frameSql, frameParams] = pg.query.mock.calls[0];
    expect(frameSql).toMatch(/ORDER BY created_at ASC, id ASC\s+LIMIT 1/);
    expect(frameParams).toEqual(['%50\\%\\_frame%']);

    await repository.getTemplateById('a_b');
    const [templateSql, templateParams] = pg.query.mock.calls[1];
    expect(templateSql).toMatch(/ORDER BY t\.created_at ASC, t\.id ASC LIMIT 1/);
    expect(templateParams).toEqual(['%a\\_b%']);
  });
});
