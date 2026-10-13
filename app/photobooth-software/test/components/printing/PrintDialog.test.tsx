// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrintDialog } from '../../../src/components/printing/PrintDialog';
import { createSessionPrintJob } from '../../../src/components/printing/api';

vi.mock('../../../src/components/printing/api', () => ({
  createSessionPrintJob: vi.fn(),
  getSessionPrintJob: vi.fn(),
}));

describe('PrintDialog', () => {
  afterEach(() => vi.clearAllMocks());

  it('acknowledges a submitted print job and marks its session printed', async () => {
    vi.mocked(createSessionPrintJob).mockResolvedValue({
      id: 'job-1', publicId: 'M7P4XAV', copiesRequested: 2, copiesCompleted: 0,
      copiesWaiting: 2, status: 'pending', lastError: null, printerName: 'SIC Printer', createdAt: '',
    });
    const onCompleted = vi.fn();

    render(<PrintDialog sessionId="session-1" onClose={vi.fn()} onCompleted={onCompleted} />);
    fireEvent.click(screen.getByRole('button', { name: 'Queue print' }));

    await waitFor(() => expect(onCompleted).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' })));
    expect(screen.getByRole('button', { name: 'Okay' })).toBeDefined();
  });
});
