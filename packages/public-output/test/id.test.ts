import { describe, it, expect } from 'vitest';
import {
  generatePublicId,
  isValidPublicId,
  BASE62_CHARSET,
  PUBLIC_ID_LENGTH,
  PUBLIC_ID_REGEX,
} from '../src/id.js';

describe('generatePublicId', () => {
  it('should generate a 7-character string matching the base-62 regex', () => {
    const id = generatePublicId();
    expect(id).toHaveLength(PUBLIC_ID_LENGTH);
    expect(id).toMatch(PUBLIC_ID_REGEX);
  });

  it('should only contain characters from BASE62_CHARSET', () => {
    const charsetSet = new Set(BASE62_CHARSET.split(''));
    for (let i = 0; i < 100; i++) {
      const id = generatePublicId();
      for (const char of id) {
        expect(charsetSet.has(char)).toBe(true);
      }
    }
  });

  it('should generate unique IDs with zero collisions across 5,000 samples', () => {
    const generated = new Set<string>();
    const count = 5000;
    for (let i = 0; i < count; i++) {
      const id = generatePublicId();
      expect(generated.has(id)).toBe(false);
      generated.add(id);
    }
    expect(generated.size).toBe(count);
  });
});

describe('isValidPublicId', () => {
  it('should return true for valid 7-character base-62 strings', () => {
    expect(isValidPublicId('7fK92pQ')).toBe(true);
    expect(isValidPublicId('0000000')).toBe(true);
    expect(isValidPublicId('ZZZZZZZ')).toBe(true);
    expect(isValidPublicId('zzzzzzz')).toBe(true);
    expect(isValidPublicId('aB1cD2e')).toBe(true);
  });

  it('should return false for strings with invalid length', () => {
    expect(isValidPublicId('')).toBe(false);
    expect(isValidPublicId('123456')).toBe(false);
    expect(isValidPublicId('12345678')).toBe(false);
  });

  it('should return false for strings containing non-base62 characters', () => {
    expect(isValidPublicId('7fK9-pQ')).toBe(false);
    expect(isValidPublicId('7fK9_pQ')).toBe(false);
    expect(isValidPublicId('7fK9.pQ')).toBe(false);
    expect(isValidPublicId('7fK9 2p')).toBe(false);
    expect(isValidPublicId('7fK9/pQ')).toBe(false);
    expect(isValidPublicId('7fK9#pQ')).toBe(false);
  });

  it('should return false for non-string inputs', () => {
    expect(isValidPublicId(null)).toBe(false);
    expect(isValidPublicId(undefined)).toBe(false);
    expect(isValidPublicId(1234567)).toBe(false);
    expect(isValidPublicId({})).toBe(false);
    expect(isValidPublicId([])).toBe(false);
  });
});
