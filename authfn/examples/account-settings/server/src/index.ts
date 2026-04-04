import type { RequestHandler, Request as ExpressRequest, Response as ExpressResponse } from 'express';
import {
  AuthFnUnauthenticatedError,
  type AuthFnInstance,
  jsonError,
  jsonSuccess
} from '@authfn/core';
import {
  ExampleEventBuffer,
  createEventEmitter,
  createExampleServer
} from '@authfn/examples-shared';
import {
  createAccountSettingsAuth
} from './auth.js';
import {
  createAccountSettingsDatabase
} from './db/client.js';
import {
  api_keys,
  password_credentials,
  sessions,
  two_factor_challenges,
  two_factor_enrollments,
  two_factor_recovery_codes,
  users
} from './db/generated/authfn-schema.js';

const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number(process.env.PORT ?? '4313');
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://127.0.0.1:4013';
const SERVER_BASE_URL = process.env.SERVER_BASE_URL ?? `http://${HOST}:${PORT}`;

export async function createAccountSettingsServer() {
  const database = createAccountSettingsDatabase();
  const eventBuffer = new ExampleEventBuffer();
  const auth = createAccountSettingsAuth({
    database: database.adapter,
    onEvent: createEventEmitter(eventBuffer)
  });

  const instance = createExampleServer({
    authRouter: auth.router,
    eventBuffer,
    middleware: [
      createCorsMiddleware(CLIENT_ORIGIN),
      createApiKeyProtectedMiddleware(auth, SERVER_BASE_URL)
    ],
    scenarios: {
      baseline: async () => {
        await database.db.delete(api_keys);
        await database.db.delete(two_factor_recovery_codes);
        await database.db.delete(two_factor_challenges);
        await database.db.delete(two_factor_enrollments);
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
  const server = await createAccountSettingsServer();
  await server.resetScenario('baseline');

  const started = await server.listen(PORT, HOST);
  console.log(`account-settings server listening at ${started.baseUrl}`);
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
      response.setHeader('Access-Control-Allow-Headers', 'content-type, authorization, x-authfn-csrf, x-request-id');
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      response.setHeader('Vary', 'Origin');
    }

    if (request.method === 'OPTIONS') {
      response.status(204).end();
      return;
    }

    next();
  };
}

function createApiKeyProtectedMiddleware(auth: AuthFnInstance, serverBaseUrl: string): RequestHandler {
  return async (request, response, next) => {
    if (request.method !== 'GET' || request.path !== '/demo/api-key/protected') {
      next();
      return;
    }

    const headers = createRequestHeaders(request);
    if (headers.has('authorization')) {
      headers.delete('cookie');
    }

    const webRequest = new Request(`${serverBaseUrl}${request.originalUrl}`, {
      method: request.method,
      headers
    });

    try {
      const session = await auth.provider.authenticate(webRequest);
      if (!session) {
        throw new AuthFnUnauthenticatedError('Authentication required');
      }

      await sendWebResponse(
        response,
        jsonSuccess(webRequest, {
          authenticated: true,
          actorId: session.actorId,
          actorType: session.actorType,
          methods: session.methods
        })
      );
    } catch (error) {
      await sendWebResponse(response, jsonError(webRequest, error));
    }
  };
}

function createRequestHeaders(request: ExpressRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        headers.append(key, entry);
      }
      continue;
    }

    if (typeof value === 'string') {
      headers.set(key, value);
    }
  }
  return headers;
}

async function sendWebResponse(response: ExpressResponse, webResponse: Response): Promise<void> {
  response.status(webResponse.status);
  webResponse.headers.forEach((value, key) => {
    response.setHeader(key, value);
  });
  response.send(await webResponse.text());
}
