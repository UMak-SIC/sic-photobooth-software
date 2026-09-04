import { randomBytes } from 'node:crypto';

/**
 * Standard base-62 characters: digits, uppercase letters, lowercase letters.
 */
export const BASE62_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Fixed length for public random IDs across the photobooth platform.
 */
export const PUBLIC_ID_LENGTH = 7;

/**
 * Regular expression validating a 7-character base-62 string.
 */
export const PUBLIC_ID_REGEX = /^[0-9A-Za-z]{7}$/;

/**
 * Generates a cryptographically random, uniform 7-character base-62 public identifier.
 * Uses rejection sampling (byte < 248 = 62 * 4) to eliminate modulo bias.
 */
export function generatePublicId(): string {
  let result = '';
  while (result.length < PUBLIC_ID_LENGTH) {
    const bytes = randomBytes(PUBLIC_ID_LENGTH * 2);
    for (let i = 0; i < bytes.length && result.length < PUBLIC_ID_LENGTH; i++) {
      const byte = bytes[i];
      // 62 * 4 = 248. Values >= 248 are discarded to guarantee uniform probability.
      if (byte < 248) {
        result += BASE62_CHARSET[byte % 62];
      }
    }
  }
  return result;
}

/**
 * Validates whether the given value is a valid 7-character base-62 public ID.
 */
export function isValidPublicId(id: unknown): id is string {
  return typeof id === 'string' && PUBLIC_ID_REGEX.test(id);
}
