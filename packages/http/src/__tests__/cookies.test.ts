import { describe, expect, it } from 'vitest';
import { assertValidRouteMeta, parseCookieHeader, parseCookies, serializeSetCookie } from '../cookies.js';

describe('cookie helpers', () => {
  it('serializes secure httpOnly cookies deterministically', () => {
    expect(
      serializeSetCookie({
        name: '__Secure-authfn.session',
        value: 'opaque_1',
      })
    ).toBe('__Secure-authfn.session=opaque_1; Path=/; Secure; HttpOnly; SameSite=Lax');
  });

  it('supports non-httpOnly cookies while preserving attribute order', () => {
    expect(
      serializeSetCookie({
        name: 'authfn.csrf',
        value: 'csrf_1',
        httpOnly: false,
      })
    ).toBe('authfn.csrf=csrf_1; Path=/; Secure; SameSite=Lax');
  });

  it('rejects invalid sameSite values with HTTP_META_INVALID', () => {
    expect(() =>
      serializeSetCookie({
        name: 'bad-cookie',
        value: 'x',
        sameSite: 'invalid' as never,
      })
    ).toThrowError(/Invalid SameSite value/);
  });

  it('rejects unsafe cookie names and attributes', () => {
    expect(() =>
      serializeSetCookie({
        name: 'bad;cookie',
        value: 'x',
      })
    ).toThrowError(/Invalid cookie name/);

    expect(() =>
      serializeSetCookie({
        name: 'safe-cookie',
        value: 'x',
        path: '/foo\r\nSet-Cookie: pwned=1',
      })
    ).toThrowError(/Invalid cookie path/);

    expect(() =>
      serializeSetCookie({
        name: 'safe-cookie',
        value: 'x',
        domain: 'example.com;evil.com',
      })
    ).toThrowError(/Invalid cookie domain/);
  });

  it('rejects SameSite=None cookies without Secure', () => {
    expect(() =>
      serializeSetCookie({
        name: 'authfn.session',
        value: 'opaque_1',
        sameSite: 'none',
        secure: false,
      })
    ).toThrowError(/SameSite=None cookies must be Secure/);
  });

  it('parses cookie headers and request cookies deterministically', () => {
    const header = '__Secure-authfn.session=opaque_1; authfn.csrf=csrf_1; encoded=hello%20world';
    const parsed = parseCookieHeader(header);
    expect(Object.getPrototypeOf(parsed)).toBeNull();
    expect({ ...parsed }).toEqual({
      '__Secure-authfn.session': 'opaque_1',
      'authfn.csrf': 'csrf_1',
      encoded: 'hello world',
    });

    const request = new Request('http://localhost', {
      headers: { cookie: header },
    });
    expect({ ...parseCookies(request) }).toEqual({
      '__Secure-authfn.session': 'opaque_1',
      'authfn.csrf': 'csrf_1',
      encoded: 'hello world',
    });
  });

  it('handles empty and malformed cookie headers safely', () => {
    expect(Object.getPrototypeOf(parseCookieHeader(''))).toBeNull();
    expect({ ...parseCookieHeader('bad-segment; =missing; valid=value; encoded=%E0%A4%A') }).toEqual({
      valid: 'value',
      encoded: '%E0%A4%A',
    });
  });

  it('does not use a prototype-bearing object for parsed cookies', () => {
    const parsed = parseCookieHeader('__proto__=value; constructor=ctor');
    expect(Object.getPrototypeOf(parsed)).toBeNull();
    expect(parsed.__proto__).toBe('value');
    expect(parsed.constructor).toBe('ctor');
  });

  it('validates typed route metadata for auth and openapi usage', () => {
    expect(() =>
      assertValidRouteMeta({
        auth: {
          mode: 'cookie-session',
          csrf: true,
        },
        openapi: {
          operationId: 'getSession',
          summary: 'Read the current session',
        },
      })
    ).not.toThrow();

    expect(() =>
      assertValidRouteMeta({
        auth: {
          mode: 'unsupported',
        },
      })
    ).toThrowError(/Invalid auth route metadata mode/);
  });

  it('rejects auth metadata without mode or with invalid csrf/scopes types', () => {
    expect(() =>
      assertValidRouteMeta({
        auth: {},
      })
    ).toThrowError(/Invalid auth route metadata mode/);

    expect(() =>
      assertValidRouteMeta({
        auth: {
          mode: 'bearer',
          csrf: 'yes',
        },
      })
    ).toThrowError(/Route auth metadata csrf must be a boolean/);

    expect(() =>
      assertValidRouteMeta({
        auth: {
          mode: 'hybrid',
          scopes: ['read', 42],
        },
      })
    ).toThrowError(/Route auth metadata scopes must be a string array/);
  });
});
