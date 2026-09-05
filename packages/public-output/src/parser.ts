import { isValidPublicId, PUBLIC_ID_REGEX } from './id.js';

/**
 * Canonical default public web base URL.
 */
export const DEFAULT_PUBLIC_BASE_URL = 'https://myphotobooth.com';

export interface ParsePublicIdOptions {
  /**
   * Expected base URL (origin) to match against. Defaults to 'https://myphotobooth.com'.
   */
  baseUrl?: string;
}

/**
 * Parses and extracts a valid 7-character base-62 public ID from:
 * 1. A raw 7-character ID string (with whitespace trimmed).
 * 2. A full public QR URL (e.g. 'https://myphotobooth.com/:id' or 'https://myphotobooth.com/:id/').
 * 3. A URL with query parameters or fragments.
 *
 * Returns the extracted 7-character public ID or null if the input is invalid.
 */
export function parsePublicId(input: unknown, options?: ParsePublicIdOptions): string | null {
  if (typeof input !== 'string') {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  // 1. Direct raw public ID match
  if (isValidPublicId(trimmed)) {
    return trimmed;
  }

  // 2. URL parsing
  try {
    const url = new URL(trimmed);
    const expectedBase = options?.baseUrl ?? DEFAULT_PUBLIC_BASE_URL;
    const expectedUrl = new URL(expectedBase);

    // Validate origin matches expected base URL
    if (url.origin !== expectedUrl.origin) {
      return null;
    }

    // Extract path segments, ignoring empty segments
    const pathSegments = url.pathname.split('/').filter(Boolean);
    if (pathSegments.length !== 1) {
      return null;
    }

    // Canonical path segment is the candidate public ID
    const candidateId = pathSegments[0];
    if (isValidPublicId(candidateId)) {
      return candidateId;
    }
  } catch {
    // Malformed URL or non-URL string that failed raw ID validation
  }

  return null;
}

/**
 * Constructs the canonical public URL for a given public ID.
 */
export function buildPublicUrl(id: string, baseUrl: string = DEFAULT_PUBLIC_BASE_URL): string {
  if (!isValidPublicId(id)) {
    throw new Error(`Invalid public ID: "${id}". Must match ${PUBLIC_ID_REGEX}`);
  }
  const cleanBase = baseUrl.replace(/\/+$/, '');
  return `${cleanBase}/${id}`;
}
