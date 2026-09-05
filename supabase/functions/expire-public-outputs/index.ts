import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

type ExpiredOutput = {
  public_id: string;
  cloudinary_public_id: string;
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME') || '';
const cloudinaryApiKey = Deno.env.get('CLOUDINARY_API_KEY') || '';
const cloudinaryApiSecret = Deno.env.get('CLOUDINARY_API_SECRET') || '';
const cronSecret = Deno.env.get('PUBLIC_OUTPUT_CRON_SECRET') || '';

function configured(): boolean {
  return Boolean(
    supabaseUrl &&
      serviceRoleKey &&
      cloudName &&
      cloudinaryApiKey &&
      cloudinaryApiSecret &&
      cronSecret,
  );
}

function supabaseHeaders(): HeadersInit {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };
}

async function sha1(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function destroyCloudinaryAsset(publicId: string): Promise<void> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await sha1(`public_id=${publicId}&timestamp=${timestamp}${cloudinaryApiSecret}`);
  const body = new URLSearchParams({
    public_id: publicId,
    timestamp,
    api_key: cloudinaryApiKey,
    signature,
  });
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
    method: 'POST',
    body,
  });
  const result = (await response.json()) as { result?: string; error?: { message?: string } };
  if (!response.ok || (result.result !== 'ok' && result.result !== 'not found')) {
    throw new Error(result.error?.message || 'Cloudinary asset deletion failed.');
  }
}

serve(async (request) => {
  if (!configured()) {
    return new Response('Retention function is not configured.', { status: 503 });
  }
  if (request.headers.get('x-cron-secret') !== cronSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const outputsResponse = await fetch(
    `${supabaseUrl}/rest/v1/public_outputs?select=public_id,cloudinary_public_id&status=eq.uploaded&expires_at=lte.${encodeURIComponent(new Date().toISOString())}&limit=100`,
    { headers: supabaseHeaders() },
  );
  if (!outputsResponse.ok) return new Response(await outputsResponse.text(), { status: 500 });
  const outputs = (await outputsResponse.json()) as ExpiredOutput[];

  let deleted = 0;
  const failures: string[] = [];
  for (const output of (outputs || []) as ExpiredOutput[]) {
    try {
      await destroyCloudinaryAsset(output.cloudinary_public_id);
      const deleteResponse = await fetch(
        `${supabaseUrl}/rest/v1/public_outputs?public_id=eq.${encodeURIComponent(output.public_id)}`,
        { method: 'DELETE', headers: { ...supabaseHeaders(), Prefer: 'return=minimal' } },
      );
      if (!deleteResponse.ok) throw new Error(await deleteResponse.text());
      deleted += 1;
    } catch (cause) {
      failures.push(`${output.public_id}: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }

  return Response.json({ deleted, failures }, { status: failures.length > 0 ? 500 : 200 });
});
