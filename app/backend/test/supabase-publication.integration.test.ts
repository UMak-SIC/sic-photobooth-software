import { createHash, randomBytes } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_INTEGRATION_URL;
const serviceRoleKey = process.env.SUPABASE_INTEGRATION_SERVICE_ROLE_KEY;
const publishableKey = process.env.SUPABASE_INTEGRATION_PUBLISHABLE_KEY;
const describeIntegration = url && serviceRoleKey && publishableKey ? describe : describe.skip;
const publicId = `I${randomBytes(3).toString('hex')}`;
const clientAddress = `integration-${randomBytes(6).toString('hex')}`;

describeIntegration('Supabase public output integration', () => {
  const service = createClient(url!, serviceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const publicClient = createClient(url!, publishableKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  afterAll(async () => {
    await service.from('public_outputs').delete().eq('public_id', publicId);
    await service
      .from('public_output_lookup_limits')
      .delete()
      .eq('client_hash', createHash('sha256').update(clientAddress).digest('hex'));
  });

  it('upserts a published output, exposes it through RLS, and limits lookups', async () => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { error: upsertError } = await service.from('public_outputs').upsert(
      {
        public_id: publicId,
        cloudinary_url: `https://res.cloudinary.com/test/image/upload/photobooth/${publicId}`,
        cloudinary_public_id: `photobooth/${publicId}`,
        media_type: 'image/png',
        event_name: 'Integration Test',
        event_date: '2026-09-05',
        status: 'uploaded',
        cloud_finalized_at: new Date().toISOString(),
        expires_at: expiresAt,
      },
      { onConflict: 'public_id' },
    );
    expect(upsertError).toBeNull();

    const { data: publicOutput, error: publicReadError } = await publicClient
      .from('public_outputs')
      .select('public_id, cloudinary_url')
      .eq('public_id', publicId)
      .maybeSingle();
    expect(publicReadError).toBeNull();
    expect(publicOutput?.public_id).toBe(publicId);

    for (let request = 1; request <= 30; request += 1) {
      const { data, error } = await service.rpc('consume_public_output_lookup', {
        client_address: clientAddress,
      });
      expect(error).toBeNull();
      expect(data).toBe(true);
    }
    const { data, error } = await service.rpc('consume_public_output_lookup', {
      client_address: clientAddress,
    });
    expect(error).toBeNull();
    expect(data).toBe(false);
  });
});
