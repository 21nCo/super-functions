import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifySlackRequest } from '../src/index.js';

const secret = 'slack-signing-secret';
const body = 'command=%2Fhello&text=world';
const now = 1_800_000_000;

function request(timestamp: string, signatureBody = body) {
  const signature = 'v0=' + createHmac('sha256', secret)
    .update(`v0:${timestamp}:${signatureBody}`).digest('hex');
  return new Request('http://slack.test/command', {
    method: 'POST', body,
    headers: { 'x-slack-request-timestamp': timestamp, 'x-slack-signature': signature },
  });
}

beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(now * 1000); });
afterEach(() => { vi.restoreAllMocks(); });

describe('Slack request verification with real HMAC signatures', () => {
  it('accepts authentic requests and leaves their bodies readable', async () => {
    const req = request(String(now));
    expect(await verifySlackRequest(req, secret)).toBe(true);
    expect(await req.text()).toBe(body);
  });

  it('rejects altered bodies, wrong secrets and missing headers', async () => {
    expect(await verifySlackRequest(request(String(now), 'altered'), secret)).toBe(false);
    expect(await verifySlackRequest(request(String(now)), 'wrong-secret')).toBe(false);
    expect(await verifySlackRequest(new Request('http://slack.test'), secret)).toBe(false);
  });

  it.each([-300, 300])('accepts the replay-window boundary at %i seconds', async offset => {
    expect(await verifySlackRequest(request(String(now + offset)), secret)).toBe(true);
  });

  it.each([-301, 301])('rejects replay-window overflow at %i seconds', async offset => {
    expect(await verifySlackRequest(request(String(now + offset)), secret)).toBe(false);
  });
});
