export type PublicationStatus = 'queued' | 'in_progress' | 'uploaded' | 'failed';

export type Publication = {
  id: string;
  publicId: string;
  status: PublicationStatus;
  retryCount: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  cloudFinalizedAt: string | null;
  createdAt: string;
  mediaType: string;
  eventName: string;
  eventDate: string;
};
