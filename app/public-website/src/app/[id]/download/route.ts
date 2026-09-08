import { isValidPublicId } from '@photobooth/public-output';
import { consumePublicOutputLookup, getPublishedPublicOutput } from '../../../lib/public-output';

function getClientAddress(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidPublicId(id)) {
    return new Response('Photo not found.', { status: 404 });
  }

  if (!(await consumePublicOutputLookup(getClientAddress(request)))) {
    return new Response('Too many requests. Please try again shortly.', { status: 429 });
  }

  const output = await getPublishedPublicOutput(id);
  if (!output) {
    return new Response('Photo not found.', { status: 404 });
  }

  try {
    const mediaResponse = await fetch(output.mediaUrl, { cache: 'no-store' });
    if (!mediaResponse.ok || !mediaResponse.body) {
      return new Response('Photo is temporarily unavailable.', { status: 502 });
    }

    const extension = output.mediaType === 'image/gif' ? 'gif' : 'png';
    return new Response(mediaResponse.body, {
      headers: {
        'Content-Type': output.mediaType,
        'Content-Disposition': `attachment; filename="umak-sic-photobooth-${output.publicId}.${extension}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return new Response('Photo is temporarily unavailable.', { status: 502 });
  }
}
