import type { RequestHandler } from 'express';
import {
  ExampleEventBuffer,
  ExampleOtpInbox,
  createEventEmitter,
  createExampleServer
} from '@authfn/examples-shared';
import {
  createOtpRecoveryAuth
} from './auth.js';
import {
  createOtpRecoveryDatabase
} from './db/client.js';
import {
  otp_challenges,
  password_credentials,
  sessions,
  users
} from './db/generated/authfn-schema.js';

const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number(process.env.PORT ?? '4311');
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://127.0.0.1:4011';

export async function createOtpRecoveryServer() {
  const database = createOtpRecoveryDatabase();
  const eventBuffer = new ExampleEventBuffer();
  const otpInbox = new ExampleOtpInbox();
  const auth = createOtpRecoveryAuth({
    database: database.adapter,
    otpInbox,
    onEvent: createEventEmitter(eventBuffer)
  });

  const instance = createExampleServer({
    authRouter: auth.router,
    eventBuffer,
    otpInbox,
    middleware: [createCorsMiddleware(CLIENT_ORIGIN)],
    scenarios: {
      baseline: async () => {
        await database.db.delete(sessions);
        await database.db.delete(otp_challenges);
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
  const server = await createOtpRecoveryServer();
  await server.resetScenario('baseline');

  const started = await server.listen(PORT, HOST);
  console.log(`otp-recovery server listening at ${started.baseUrl}`);
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
