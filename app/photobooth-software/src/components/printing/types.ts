export type PrintJobStatus = 'queued' | 'submitting' | 'pending' | 'processing' | 'stopped' | 'completed' | 'failed' | 'canceled' | 'needs_attention';

export interface PrintJob {
  id: string;
  publicId: string;
  copiesRequested: number;
  copiesCompleted: number;
  copiesWaiting: number;
  status: PrintJobStatus;
  lastError: string | null;
  printerName: string;
  createdAt: string;
}
