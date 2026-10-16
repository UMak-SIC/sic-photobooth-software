import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claimQueuedPrintJobs: vi.fn(),
  createPrintAttempt: vi.fn(),
  getPrintJobArtifact: vi.fn(),
  updatePrintAttempt: vi.fn(),
  updatePrintJobStatus: vi.fn(),
  listActivePrintAttempts: vi.fn(),
  listSupersededPrintAttempts: vi.fn(),
  printImage: vi.fn(),
}));

vi.mock('../src/db/provider.js', () => ({
  // Lifecycle stubs used by test/setup/isolated-database.ts.
  getDatabaseProvider: () => ({ engine: 'mock' }),
  runDatabaseMigrations: vi.fn(),
  closeDatabaseProvider: vi.fn(async () => {}),
  dbRepository: {
    claimQueuedPrintJobs: mocks.claimQueuedPrintJobs,
    createPrintAttempt: mocks.createPrintAttempt,
    getPrintJobArtifact: mocks.getPrintJobArtifact,
    updatePrintAttempt: mocks.updatePrintAttempt,
    updatePrintJobStatus: mocks.updatePrintJobStatus,
    listActivePrintAttempts: mocks.listActivePrintAttempts,
    listSupersededPrintAttempts: mocks.listSupersededPrintAttempts,
  },
}));

vi.mock('../src/services/printer.js', () => ({
  printerService: { printImage: mocks.printImage, getJobState: vi.fn(), cancelJob: vi.fn() },
}));

const { startPrintWorker, stopPrintWorker, PRINT_SUBMISSION_FAILED_MESSAGE } =
  await import('../src/services/print-worker.js');

describe('print worker', () => {
  afterEach(() => {
    stopPrintWorker();
    vi.restoreAllMocks();
  });

  it('stores an authored message and logs the raw CUPS error when submission fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.claimQueuedPrintJobs.mockResolvedValue([{ id: 'job-1', copiesRequested: 1 }]);
    mocks.createPrintAttempt.mockResolvedValue({ id: 'attempt-1', title: 'SIC job-1' });
    mocks.getPrintJobArtifact.mockResolvedValue('/tmp/artifact.png');
    mocks.printImage.mockResolvedValue({
      success: false,
      error: 'lp: Error - The printer or class does not exist.',
    });
    mocks.listActivePrintAttempts.mockResolvedValue([]);
    mocks.listSupersededPrintAttempts.mockResolvedValue([]);

    startPrintWorker();

    await vi.waitFor(() =>
      expect(mocks.updatePrintJobStatus).toHaveBeenCalledWith(
        'job-1',
        'failed',
        PRINT_SUBMISSION_FAILED_MESSAGE,
        'submitting',
      ),
    );
    expect(mocks.updatePrintAttempt).toHaveBeenCalledWith(
      'attempt-1',
      'failed',
      undefined,
      PRINT_SUBMISSION_FAILED_MESSAGE,
    );
    expect(JSON.stringify(mocks.updatePrintJobStatus.mock.calls)).not.toContain('lp: Error');
    expect(consoleError).toHaveBeenCalledWith('Print submission failed:', {
      jobId: 'job-1',
      error: 'lp: Error - The printer or class does not exist.',
    });
  });
});
