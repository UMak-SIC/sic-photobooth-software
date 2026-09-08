import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

const REQUEST_TIMEOUT_MS = 30 * 1000;

export interface PublicOutputPublication {
  publicId: string;
  cloudinaryUrl: string;
  cloudinaryPublicId: string;
  mediaType: string;
  eventName: string;
  eventDate: string;
  cloudFinalizedAt: Date;
  expiresAt: Date;
}

const configured = Boolean(config.supabase.url) && Boolean(config.supabase.serviceRoleKey);
const supabase = configured
  ? createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
      },
    })
  : null;

export function isSupabaseConfigured(): boolean {
  return configured;
}

/**
 * Registers the cloud asset only after Cloudinary has accepted the finalized local output.
 */
export async function registerPublicOutput(output: PublicOutputPublication): Promise<void> {
  if (!supabase) throw new Error('Supabase publishing is not configured.');
  const { error } = await supabase.from('public_outputs').upsert(
    {
      public_id: output.publicId,
      cloudinary_url: output.cloudinaryUrl,
      cloudinary_public_id: output.cloudinaryPublicId,
      media_type: output.mediaType,
      event_name: output.eventName,
      event_date: output.eventDate,
      status: 'uploaded',
      cloud_finalized_at: output.cloudFinalizedAt.toISOString(),
      expires_at: output.expiresAt.toISOString(),
    },
    { onConflict: 'public_id' },
  );
  if (error) throw new Error(`Supabase publication record failed: ${error.message}`);
}

/** Reconciles a timed-out upsert before deleting a Cloudinary asset from a dead-letter job. */
export async function publicOutputExists(publicId: string): Promise<boolean> {
  if (!supabase) throw new Error('Supabase publishing is not configured.');
  const { data, error } = await supabase
    .from('public_outputs')
    .select('public_id')
    .eq('public_id', publicId)
    .maybeSingle();
  if (error) throw new Error(`Supabase publication lookup failed: ${error.message}`);
  return data !== null;
}

export async function removePublicOutput(publicId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase publishing is not configured.');
  const { error } = await supabase.from('public_outputs').delete().eq('public_id', publicId);
  if (error) throw new Error(`Supabase publication deletion failed: ${error.message}`);
}
