import assert from 'node:assert/strict';
import test from 'node:test';
import { parseContentSecurityPolicySources } from './uifn-catalog-csp.mjs';

test('catalog readiness parses directive terminators without substring matching', () => {
  const sources = parseContentSecurityPolicySources(
    "script-src 'self' https://static.cloudflareinsights.com; connect-src 'self' https://cloudflareinsights.com;",
  );
  assert.equal(sources.has('https://static.cloudflareinsights.com'), true);
  assert.equal(sources.has('https://cloudflareinsights.com'), true);
  assert.equal(sources.has('https://cloudflareinsights.com.evil.example'), false);
});
