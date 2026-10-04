import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createBotApp, type BotEnv } from '../src/core.js';

const keys = generateKeyPairSync('ed25519');
const publicKey = keys.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
const env: BotEnv = {
  DISCORD_PUBLIC_KEY: publicKey,
  DISCORD_CLIENT_ID: 'client',
  DISCORD_TOKEN: 'token',
  GITHUB_APP_ID: 'app',
  GITHUB_INSTALLATION_ID: 'installation',
  GITHUB_PRIVATE_KEY: '',
  LINEAR_API_KEY: '',
  PERSISTENCE_SERVICE_URL: 'http://persistence.test',
};

function signedRequest(body: string, signedBody = body) {
  const timestamp = '1800000000';
  const signature = sign(null, Buffer.from(timestamp + signedBody), keys.privateKey).toString('hex');
  return new Request('http://bot.test/interactions', {
    method: 'POST', body,
    headers: {
      'content-type': 'application/json',
      'x-signature-timestamp': timestamp,
      'x-signature-ed25519': signature,
    },
  });
}

describe('Discord bot HTTP interactions using the dependency foundation', () => {
  it('answers a genuinely signed Discord ping', async () => {
    const response = await createBotApp().fetch(signedRequest(JSON.stringify({ type: 1 })), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ type: 1 });
  });

  it('rejects missing signatures and signed bodies altered in transit', async () => {
    const app = createBotApp();
    const unsigned = await app.fetch(new Request('http://bot.test/interactions', {
      method: 'POST', body: JSON.stringify({ type: 1 }),
    }), env);
    expect(unsigned.status).toBe(401);
    const altered = await app.fetch(signedRequest('{"type":99}', '{"type":1}'), env);
    expect(altered.status).toBe(401);
  });

  it('rejects a signed invalid body and reports unsupported interaction types', async () => {
    const app = createBotApp();
    expect((await app.fetch(signedRequest('not-json'), env)).status).toBe(401);
    const unknown = await app.fetch(signedRequest('{"type":99}'), env);
    expect(unknown.status).toBe(400);
  });

  it('returns an empty autocomplete result for an unsupported command without external calls', async () => {
    const response = await createBotApp().fetch(signedRequest(JSON.stringify({
      type: 4, data: { name: 'unsupported', options: [] },
    })), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ type: 8, data: { choices: [] } });
  });
});
