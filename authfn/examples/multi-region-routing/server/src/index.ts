import type { RequestHandler } from 'express';
import {
  ExampleEventBuffer,
  createEventEmitter,
  createExampleServer
} from '@authfn/examples-shared';
import {
  MULTI_REGION_EU_BASE_URL,
  MULTI_REGION_ROUTING_NAMESPACE,
  MULTI_REGION_USER_EMAIL,
  MULTI_REGION_USER_PASSWORD,
  MULTI_REGION_US_BASE_URL,
  createMultiRegionRoutingAuth
} from './auth.js';
import { createMultiRegionRoutingDatabase } from './db/client.js';
import {
  password_credentials,
  region_profiles,
  sessions,
  users
} from './db/generated/authfn-schema.js';

const HOST = '127.0.0.1';
const US_PORT = 4315;
const EU_PORT = 4316;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:4015';

export async function createMultiRegionRoutingServer() {
  const database = createMultiRegionRoutingDatabase();
  const eventBuffer = new ExampleEventBuffer();
  const auth = createMultiRegionRoutingAuth({
    database: database.adapter,
    onEvent: createEventEmitter(eventBuffer)
  });

  const instance = createExampleServer({
    authRouter: auth.router,
    eventBuffer,
    middleware: [createCorsMiddleware(CLIENT_ORIGIN)],
    scenarios: {
      baseline: async () => {
        await database.db.delete(region_profiles);
        await database.db.delete(sessions);
        await database.db.delete(password_credentials);
        await database.db.delete(users);

        await auth.router.handle(
          new Request(`${MULTI_REGION_EU_BASE_URL}/auth/sign-up/password`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json'
            },
            body: JSON.stringify({
              email: MULTI_REGION_USER_EMAIL,
              password: MULTI_REGION_USER_PASSWORD
            })
          })
        );
      }
    }
  });

  return {
    ...instance,
    database,
    auth,
    async close() {
      await database.close();
    }
  };
}

async function main(): Promise<void> {
  const server = await createMultiRegionRoutingServer();
  await server.resetScenario('baseline');

  const usAuthority = await server.listen(US_PORT, HOST);
  const euAuthority = await server.listen(EU_PORT, HOST);
  console.log(`multi-region-routing US authority listening at ${usAuthority.baseUrl}`);
  console.log(`multi-region-routing EU authority listening at ${euAuthority.baseUrl}`);
  console.log(`client origin allowed: ${CLIENT_ORIGIN}`);
  console.log(`namespace: ${MULTI_REGION_ROUTING_NAMESPACE}`);

  const shutdown = async () => {
    await euAuthority.close();
    await usAuthority.close();
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
