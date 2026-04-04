import type { RequestHandler } from 'express';
import {
  ExampleEventBuffer,
  createEventEmitter,
  createExampleServer
} from '@authfn/examples-shared';
import {
  createPasswordSessionsAuth
} from './auth.js';
import {
  createPasswordSessionsDatabase
} from './db/client.js';
import {
  password_credentials,
  sessions,
  users
} from './db/generated/authfn-schema.js';

const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number(process.env.PORT ?? '4310');
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://127.0.0.1:4010';

export async function createPasswordSessionsServer() {
  const database = createPasswordSessionsDatabase();
  const eventBuffer = new ExampleEventBuffer();
  const auth = createPasswordSessionsAuth({
    database: database.adapter,
    onEvent: createEventEmitter(eventBuffer)
  });

  const instance = createExampleServer({
    authRouter: auth.router,
    eventBuffer,
    middleware: [createCorsMiddleware(CLIENT_ORIGIN)],
    scenarios: {
      baseline: async () => {
        await database.db.delete(sessions);
        await database.db.delete(password_credentials);
        await database.db.delete(users);
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
  const server = await createPasswordSessionsServer();
  await server.resetScenario('baseline');

  const started = await server.listen(PORT, HOST);
  console.log(`password-sessions server listening at ${started.baseUrl}`);
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
