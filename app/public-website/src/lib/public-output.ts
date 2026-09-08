'use server';

import 'server-only';

import type { PublicOutputMetadata } from '@photobooth/public-output';
import { toPublicOutputMetadata } from './public-output-mapper';

const REQUEST_TIMEOUT_MS = 10_000;

function getSupabaseConfig(): { url: string; serviceRoleKey: string } | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    console.error('[public-output-lookup] missing server environment', {
      supabaseUrlConfigured: Boolean(url),
      serviceRoleKeyConfigured: Boolean(serviceRoleKey),
    });
    return null;
  }
  return { url: url.replace(/\/$/, ''), serviceRoleKey };
}

async function requestSupabase(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), cache: 'no-store' });
}

export async function consumePublicOutputLookup(clientAddress: string): Promise<boolean> {
  const config = getSupabaseConfig();
  if (!config) return false;

  try {
    const response = await requestSupabase(`${config.url}/rest/v1/rpc/consume_public_output_lookup`, {
      method: 'POST',
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ client_address: clientAddress }),
    });

    if (!response.ok) {
      console.error('[public-output-lookup] limiter request failed', { status: response.status });
      return false;
    }

    return (await response.json()) === true;
  } catch {
    console.error('[public-output-lookup] limiter request threw');
    return false;
  }
}

export async function getPublishedPublicOutput(
  publicId: string,
): Promise<PublicOutputMetadata | null> {
  const config = getSupabaseConfig();
  if (!config) return null;

  try {
    const query = new URLSearchParams({
      select:
        'public_id,cloudinary_url,media_type,event_name,event_date,status,created_at,expires_at',
      public_id: `eq.${publicId}`,
      limit: '1',
    });
    const response = await requestSupabase(`${config.url}/rest/v1/public_outputs?${query}`, {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
      },
    });
    if (!response.ok) {
      console.error('[public-output-lookup] output lookup request failed', { status: response.status });
      return null;
    }

    const rows = (await response.json()) as unknown;
    if (!Array.isArray(rows) || rows.length !== 1) {
      console.warn('[public-output-lookup] output lookup returned no unique row');
      return null;
    }

    const output = toPublicOutputMetadata(rows[0]);
    if (!output) console.warn('[public-output-lookup] output row is not eligible for delivery');
    return output;
  } catch {
    console.error('[public-output-lookup] output lookup request threw');
    return null;
  }
}
