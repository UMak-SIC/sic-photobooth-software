import { isValidPublicId } from '@photobooth/public-output';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

type PublicOutput = {
  cloudinary_url: string;
  media_type: 'image/png' | 'image/gif';
  event_name: string;
  event_date: string;
};

async function consumeLookupToken(): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return false;

  const requestHeaders = await headers();
  const clientAddress =
    requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    requestHeaders.get('x-real-ip') ||
    'unknown';
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/consume_public_output_lookup`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ client_address: clientAddress }),
    cache: 'no-store',
  });
  return response.ok && (await response.json()) === true;
}

async function getPublicOutput(publicId: string): Promise<PublicOutput | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) return null;

  const response = await fetch(
    `${supabaseUrl}/rest/v1/public_outputs?select=cloudinary_url,media_type,event_name,event_date&public_id=eq.${encodeURIComponent(publicId)}&limit=1`,
    {
      headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` },
      cache: 'no-store',
    },
  );
  if (!response.ok) return null;
  const outputs = (await response.json()) as PublicOutput[];
  return outputs[0] || null;
}

export default async function PublicOutputPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidPublicId(id)) notFound();
  if (!(await consumeLookupToken())) notFound();
  const output = await getPublicOutput(id);
  if (!output) notFound();

  const label = output.media_type === 'image/gif' ? 'Flipbook' : 'Photo strip';
  return (
    <main className="public-output-page">
      <section className="public-output-card" aria-labelledby="output-title">
        <p className="public-output-kicker">SIC PHOTOBOOTH</p>
        <h1 id="output-title">Your {label.toLowerCase()}</h1>
        <p className="public-output-meta">
          {output.event_name} · {output.event_date}
        </p>
        <img
          className="public-output-media"
          src={output.cloudinary_url}
          alt={`${label} from ${output.event_name}`}
        />
        <a className="public-output-download" href={output.cloudinary_url} download>
          Download original
        </a>
      </section>
    </main>
  );
}
