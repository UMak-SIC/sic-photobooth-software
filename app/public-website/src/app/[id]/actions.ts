'use server';

import 'server-only';

import { isValidPublicId, type PublicOutputMetadata } from '@photobooth/public-output';
import { headers } from 'next/headers';
import { consumePublicOutputLookup, getPublishedPublicOutput } from '../../lib/public-output';

export async function lookupPublicOutput(publicId: string): Promise<PublicOutputMetadata | null> {
  if (!isValidPublicId(publicId)) {
    console.info('[public-output-lookup]', { publicId, outcome: 'invalid_id' });
    return null;
  }

  console.info('[public-output-lookup]', { publicId, outcome: 'requested' });

  const requestHeaders = await headers();
  const clientAddress =
    requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    requestHeaders.get('x-real-ip') ||
    'unknown';

  if (!(await consumePublicOutputLookup(clientAddress))) {
    console.warn('[public-output-lookup]', { publicId, outcome: 'rate_limited_or_unavailable' });
    return null;
  }

  const output = await getPublishedPublicOutput(publicId);
  console.info('[public-output-lookup]', {
    publicId,
    outcome: output ? 'delivered' : 'unavailable',
    mediaType: output?.mediaType,
  });
  return output;
}
