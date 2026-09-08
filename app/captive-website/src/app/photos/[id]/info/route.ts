import { NextResponse } from 'next/server';

const BACKEND_INTERNAL_URL =
  process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3000';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const res = await fetch(`${BACKEND_INTERNAL_URL}/photos/${id}/info`, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('Failed to proxy photo info:', err);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'GATEWAY_ERROR',
          message: 'Failed to connect to local photobooth backend.',
        },
      },
      { status: 502 },
    );
  }
}
