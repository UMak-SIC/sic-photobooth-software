import { describe, expect, it } from 'vitest';
import { toPublicOutputMetadata } from './public-output-mapper';

const futureExpiry = new Date(Date.now() + 60_000).toISOString();

describe('toPublicOutputMetadata', () => {
  it('maps a finalized flipbook delivery record to public-safe metadata', () => {
    expect(
      toPublicOutputMetadata({
        public_id: '7fK92pQ',
        cloudinary_url: 'https://res.cloudinary.com/sic/image/upload/flipbook.gif',
        media_type: 'image/gif',
        event_name: 'SIC Gala',
        event_date: '2026-09-08',
        status: 'uploaded',
        created_at: '2026-09-08T10:00:00.000Z',
        expires_at: futureExpiry,
        cloudinary_public_id: 'internal-value-that-must-not-be-returned',
      }),
    ).toEqual({
      publicId: '7fK92pQ',
      sessionType: 'flipbook',
      mediaType: 'image/gif',
      mediaUrl: 'https://res.cloudinary.com/sic/image/upload/flipbook.gif',
      eventName: 'SIC Gala',
      eventDate: '2026-09-08',
      createdAt: '2026-09-08T10:00:00.000Z',
      expiresAt: futureExpiry,
      status: 'uploaded',
    });
  });

  it('rejects expired, unpublished, and unsafe delivery records', () => {
    const baseRecord = {
      public_id: '7fK92pQ',
      cloudinary_url: 'https://res.cloudinary.com/sic/image/upload/photo.png',
      media_type: 'image/png',
      event_name: 'SIC Gala',
      event_date: '2026-09-08',
      status: 'uploaded',
      created_at: '2026-09-08T10:00:00.000Z',
      expires_at: futureExpiry,
    };

    expect(
      toPublicOutputMetadata({ ...baseRecord, expires_at: '2020-01-01T00:00:00.000Z' }),
    ).toBeNull();
    expect(toPublicOutputMetadata({ ...baseRecord, status: 'queued' })).toBeNull();
    expect(toPublicOutputMetadata({ ...baseRecord, cloudinary_url: 'http://example.com/photo.png' })).toBeNull();
  });
});
