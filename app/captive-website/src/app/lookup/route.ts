import { NextRequest, NextResponse } from 'next/server';
import { parsePublicId } from '@photobooth/public-output';

export function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const rawCode = searchParams.get('code') || searchParams.get('id') || '';
  const publicId = parsePublicId(rawCode);

  const host =
    request.headers.get('x-forwarded-host') ||
    request.headers.get('host') ||
    'localhost:5174';
  const proto =
    request.headers.get('x-forwarded-proto') ||
    (request.url.startsWith('https') ? 'https' : 'http');

  if (publicId) {
    return NextResponse.redirect(`${proto}://${host}/${publicId}`);
  }

  return NextResponse.redirect(`${proto}://${host}/?error=invalid_code`);
}
