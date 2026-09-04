import { describe, it, expect } from 'vitest';
import { parsePublicId, buildPublicUrl } from '../src/parser.js';

describe('parsePublicId', () => {
  it('should parse a raw 7-character base-62 ID string', () => {
    expect(parsePublicId('7fK92pQ')).toBe('7fK92pQ');
  });

  it('should trim surrounding whitespace from raw ID', () => {
    expect(parsePublicId('  7fK92pQ  ')).toBe('7fK92pQ');
  });

  it('should parse standard full public QR URL', () => {
    expect(parsePublicId('https://myphotobooth.com/7fK92pQ')).toBe('7fK92pQ');
  });

  it('should parse full public URL with trailing slash', () => {
    expect(parsePublicId('https://myphotobooth.com/7fK92pQ/')).toBe('7fK92pQ');
  });

  it('should parse full public URL with query parameters and hash', () => {
    expect(parsePublicId('https://myphotobooth.com/7fK92pQ?src=qr#preview')).toBe('7fK92pQ');
  });

  it('should parse URL with custom baseUrl option when provided', () => {
    expect(
      parsePublicId('https://custom-domain.com/7fK92pQ', {
        baseUrl: 'https://custom-domain.com',
      }),
    ).toBe('7fK92pQ');
  });

  it('should reject URL from unapproved origin when baseUrl option is default', () => {
    expect(parsePublicId('https://malicious-domain.com/7fK92pQ')).toBeNull();
  });

  it('should reject malformed or non-base62 path values in URL', () => {
    expect(parsePublicId('https://myphotobooth.com/invalid-length-id')).toBeNull();
    expect(parsePublicId('https://myphotobooth.com/12345')).toBeNull();
    expect(parsePublicId('https://myphotobooth.com/12345678')).toBeNull();
    expect(parsePublicId('https://myphotobooth.com/7fK9-pQ')).toBeNull();
    expect(parsePublicId('https://myphotobooth.com/')).toBeNull();
  });

  it('should reject path traversal and malicious payloads', () => {
    expect(parsePublicId('https://myphotobooth.com/../../etc/passwd')).toBeNull();
    expect(parsePublicId('../../../secret')).toBeNull();
    expect(parsePublicId("' OR '1'='1")).toBeNull();
    expect(parsePublicId('<script>alert(1)</script>')).toBeNull();
  });

  it('should return null for non-string, empty, or whitespace-only inputs', () => {
    expect(parsePublicId(null)).toBeNull();
    expect(parsePublicId(undefined)).toBeNull();
    expect(parsePublicId('')).toBeNull();
    expect(parsePublicId('   ')).toBeNull();
    expect(parsePublicId(1234567)).toBeNull();
    expect(parsePublicId({})).toBeNull();
  });
});

describe('buildPublicUrl', () => {
  it('should construct the canonical public URL with default domain', () => {
    expect(buildPublicUrl('7fK92pQ')).toBe('https://myphotobooth.com/7fK92pQ');
  });

  it('should construct URL with custom baseUrl and remove trailing slashes from baseUrl', () => {
    expect(buildPublicUrl('7fK92pQ', 'https://custom.com/')).toBe('https://custom.com/7fK92pQ');
  });

  it('should throw error when given an invalid public ID', () => {
    expect(() => buildPublicUrl('invalid-length')).toThrowError(/Invalid public ID/);
    expect(() => buildPublicUrl('123456')).toThrowError(/Invalid public ID/);
    expect(() => buildPublicUrl('7fK9-pQ')).toThrowError(/Invalid public ID/);
    expect(() => buildPublicUrl('')).toThrowError(/Invalid public ID/);
  });
});
