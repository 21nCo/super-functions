import type { RequestHandler } from 'express';
import {
  ExampleEventBuffer,
  createFakeOAuthProvider,
  createEventEmitter,
  createExampleServer
} from '@authfn/examples-shared';
import { createSocialOAuthAuth } from './auth.js';
import { createSocialOAuthDatabase } from './db/client.js';
import {
  oauth_accounts,
  oauth_consents,
  oauth_revocation_failures,
  oauth_states,
  oauth_tokens,
  sessions,
  users
} from './db/generated/authfn-schema.js';

const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number(process.env.PORT ?? '4312');
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://127.0.0.1:4012';
const SERVER_BASE_URL = process.env.SERVER_BASE_URL ?? `http://${HOST}:${PORT}`;

export async function createSocialOAuthServer() {
  const database = createSocialOAuthDatabase();
  const eventBuffer = new ExampleEventBuffer();
  const fakeOAuthProvider = createFakeOAuthProvider(SERVER_BASE_URL);
  const auth = createSocialOAuthAuth({
    database: database.adapter,
    clientOrigin: CLIENT_ORIGIN,
    fakeOAuthProvider,
    onEvent: createEventEmitter(eventBuffer)
  });

  const instance = createExampleServer({
    authRouter: auth.router,
    baseUrl: SERVER_BASE_URL,
    eventBuffer,
    fakeOAuthProvider,
    middleware: [createCorsMiddleware(CLIENT_ORIGIN)],
    scenarios: {
      baseline: async ({ fakeOAuthProvider }) => {
        await database.db.delete(oauth_accounts);
        await database.db.delete(oauth_revocation_failures);
        await database.db.delete(oauth_consents);
        await database.db.delete(oauth_tokens);
        await database.db.delete(oauth_states);
        await database.db.delete(sessions);
        await database.db.delete(users);

        fakeOAuthProvider.setProfile('google', {
          email: 'google.user@example.test',
          name: 'Google demo user'
        });
        fakeOAuthProvider.setProfile('github', {
          email: 'github.user@example.test',
          name: 'GitHub demo user'
        });
        fakeOAuthProvider.setProfile('apple', {
          email: 'apple.user@example.test',
          name: 'Apple demo user'
        });
      }
    }
  });

  return {
    ...instance,
    database,
    async close() {
      await database.close();
    }
  };
}

async function main(): Promise<void> {
  const server = await createSocialOAuthServer();
  await server.resetScenario('baseline');

  const started = await server.listen(PORT, HOST);
  console.log(`social-oauth server listening at ${started.baseUrl}`);
  console.log(`client origin allowed: ${CLIENT_ORIGIN}`);

  const shutdown = async () => {
    await started.close();
    await server.close();
    process.exit(0);
  };

  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

function createCorsMiddleware(allowedOrigin: string): RequestHandler {
  return (request, response, next) => {
    const origin = request.headers.origin;
    if (origin === allowedOrigin) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Access-Control-Allow-Credentials', 'true');
      response.setHeader('Access-Control-Allow-Headers', 'content-type, x-authfn-csrf, x-request-id');
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      response.setHeader('Vary', 'Origin');
    }

    if (request.method === 'OPTIONS') {
      response.status(204).end();
      return;
    }

    next();
  };
}
