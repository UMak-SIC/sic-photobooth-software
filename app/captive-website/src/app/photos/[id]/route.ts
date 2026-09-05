const BACKEND_INTERNAL_URL =
  process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3000';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const res = await fetch(`${BACKEND_INTERNAL_URL}/photos/${id}`, {
      cache: 'no-store',
    });

    if (!res.ok) {
      return new Response('Photo not found', { status: res.status });
    }

    const contentType = res.headers.get('content-type') || 'image/gif';
    const body = await res.arrayBuffer();

    const isDownload =
      request.url.includes('download=true') || request.url.includes('dl=1');
    const ext = contentType.includes('png') ? 'png' : 'gif';

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    };

    if (isDownload) {
      headers['Content-Disposition'] = `attachment; filename="photobooth_${id}.${ext}"`;
    }

    return new Response(body, {
      status: 200,
      headers,
    });
  } catch (err) {
    console.error('Failed to proxy photo media:', err);
    return new Response('Failed to load photo media from local booth', { status: 502 });
  }
}
