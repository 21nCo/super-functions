import { describe, it, expect } from 'vitest';
import { DefaultOAuthTokenHttpClient } from '../src/index.js';
const provider = { id: 'slack', authorizationUrl: 'https://slack.com/oauth/v2/authorize', tokenUrl: 'https://slack.com/api/oauth.v2.access', revocationUrl: 'https://slack.com/api/auth.revoke', revocationResponse: 'json-ok' as const, defaultScopes: ['search:read'], supportsPkce: false, supportsRefreshToken: true, authorizationCodeTokenPath: ['authed_user'] };
const request = { provider, grantType: 'authorization_code' as const, clientId: 'client', clientSecret: 'secret', code: 'code', redirectUri: 'https://example.com/callback' };
function client(body: unknown) {
  return new DefaultOAuthTokenHttpClient({ fetcher: async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => JSON.stringify(body) }) });
}
describe('nested user token grants', () => {
  it('selects user credentials, never the bot token, and refreshes at the root', async () => {
    const token = await client({ access_token: 'bot', authed_user: { access_token: 'user', refresh_token: 'renew', expires_in: 3600, scope: 'search:read' } }).exchangeToken(request);
    expect(token.accessToken).toBe('user'); expect(token.refreshToken).toBe('renew'); expect(token.raw).not.toHaveProperty('authed_user');
    const refreshed = await client({ access_token: 'new-user', refresh_token: 'rotated' }).exchangeToken({ ...request, grantType: 'refresh_token', refreshToken: 'renew' });
    expect(refreshed.accessToken).toBe('new-user'); expect(refreshed.refreshToken).toBe('rotated');
  });
  it('fails closed when only a bot token is returned', async () => {
    await expect(client({ access_token: 'bot' }).exchangeToken(request)).rejects.toThrow('user token is missing');
    await expect(client({ authed_user: { id: 'user' } }).exchangeToken(request)).rejects.toThrow('missing access_token');
  });
  it('does not report an HTTP 200 revocation error as successful', async () => {
    const revoke = { provider, clientId: 'client', clientSecret: 'secret', token: 'user' };
    await expect(client({ ok: false, error: 'invalid_auth' }).revokeToken(revoke)).rejects.toThrow('not confirmed');
    await expect(client({ ok: true }).revokeToken(revoke)).resolves.toBeUndefined();
  });
});
it('encodes provider JSON exchanges with Basic credentials outside the body', async () => {
  let captured: any;
  const transport = new DefaultOAuthTokenHttpClient({ fetcher: async (_url, init) => {
    captured = init; return { ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => '{"access_token":"user"}' };
  } });
  await transport.exchangeToken({ ...request, provider: { ...provider, authorizationCodeTokenPath: undefined, tokenBodyEncoding: 'json', tokenAuthMethod: 'client_secret_basic', tokenHeaders: { 'Notion-Version': '2025-09-03' } } });
  expect(captured.headers['content-type']).toBe('application/json');
  expect(captured.headers.authorization).toMatch(/^Basic /);
  expect(captured.headers['Notion-Version']).toBe('2025-09-03');
  expect(JSON.parse(captured.body)).toEqual({ grant_type: 'authorization_code', code: 'code', redirect_uri: 'https://example.com/callback' });
});
