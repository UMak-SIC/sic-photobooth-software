import {
  isValidPublicId,
  type PublicOutputMetadata,
  type PublicOutputResponse,
} from '@photobooth/public-output';

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return '';
  }
  return (
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://127.0.0.1:3000'
  );
}

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function fetchOutputInfo(
  publicId: string,
): Promise<{ output: PublicOutputMetadata | null; error: string | null }> {
  if (!isValidPublicId(publicId)) {
    return {
      output: null,
      error: 'Photo not found. Check the QR code or enter the full link/code again.',
    };
  }

  const baseUrl = getApiBaseUrl();

  try {
    const res = await fetch(`${baseUrl}/photos/${publicId}/info`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (res.status === 404 || res.status === 400) {
      return {
        output: null,
        error: 'Photo not found. Check the QR code or enter the full link/code again.',
      };
    }

    if (res.status === 429) {
      return {
        output: null,
        error: 'Too many lookup requests. Please wait a moment before trying again.',
      };
    }

    if (!res.ok) {
      return {
        output: null,
        error: 'Something went wrong. Please check your connection and try again.',
      };
    }

    const data: PublicOutputResponse = await res.json();
    if (!data.success || !data.data) {
      return {
        output: null,
        error:
          data.error?.message ||
          'Photo not found. Check the QR code or enter the full link/code again.',
      };
    }

    const mediaUrl = `/photos/${data.data.publicId}`;
    return {
      output: {
        ...data.data,
        mediaUrl,
      },
      error: null,
    };
  } catch (err: unknown) {
    console.error('Failed to fetch output info:', err);
    return {
      output: null,
      error: 'Something went wrong. Please check your connection and try again.',
    };
  }
}
