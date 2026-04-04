import { describe, expect, it } from 'vitest';
import {
  clearSessionCookies,
  issueSessionCookies,
  readCookieValues,
  resolveCookiePolicy
} from '../index.js';

describe('@authfn/core cookie policy', () => {
  it('derives deterministic default cookie names and attributes', () => {
    const request = new Request('https://account.example.com/auth/session');
    const policy = resolveCookiePolicy({}, request);

    expect(policy.sessionCookieName).toBe('__Secure-authfn.session');
    expect(policy.csrfCookieName).toBe('authfn.csrf');
    expect(policy.secure).toBe(true);
    expect(policy.sameSite).toBe('lax');
    expect(policy.sessionMaxAgeSeconds).toBe(60 * 60 * 24 * 7);
    expect(policy.csrfMaxAgeSeconds).toBe(60 * 60 * 24 * 7);
  });

  it('issues readable csrf cookies and http-only session cookies', () => {
    const request = new Request('https://eu.example.com/auth/session');
    const policy = resolveCookiePolicy({
      cookie: {
        prefix: 'tenant-auth',
        domain: () => '.example.com',
        sameSite: 'strict'
      }
    }, request);

    const issued = issueSessionCookies(policy, 'st_123', 'csrf_123');
    const cleared = clearSessionCookies(policy);

    expect(issued.sessionCookie).toContain('__Secure-tenant-auth.session=st_123');
    expect(issued.sessionCookie).toContain('HttpOnly');
    expect(issued.sessionCookie).toContain('SameSite=Strict');
    expect(issued.sessionCookie).toContain('Domain=.example.com');

    expect(issued.csrfCookie).toContain('tenant-auth.csrf=csrf_123');
    expect(issued.csrfCookie).not.toContain('HttpOnly');
    expect(cleared.sessionCookie).toContain('Max-Age=0');
    expect(cleared.csrfCookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  });

  it('reads issued cookie values back from the request header', () => {
    const request = new Request('https://account.example.com/auth/sign-out', {
      headers: {
        cookie: '__Secure-authfn.session=st_abc; authfn.csrf=csrf_abc'
      }
    });
    const policy = resolveCookiePolicy({}, request);

    expect(readCookieValues(request, policy)).toEqual({
      sessionToken: 'st_abc',
      csrfToken: 'csrf_abc'
    });
  });
});
