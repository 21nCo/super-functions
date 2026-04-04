import type { Server as HttpServer } from 'node:http';
import express, { type Express, type RequestHandler } from 'express';
import type { Router } from '@superfunctions/http';
import { toExpress } from '@superfunctions/http-express';
import {
  AuthFnExampleError,
  createDemoRouter,
  type ExampleResetResult
} from './demo-routes.js';
import { ExampleEventBuffer } from './event-buffer.js';
import { ExampleOtpInbox } from './otp-inbox.js';
import { FakeOAuthProvider, createFakeOAuthProvider } from './fake-oauth-provider.js';

export interface ExampleSeedContext {
  app: Express;
  eventBuffer: ExampleEventBuffer;
  otpInbox: ExampleOtpInbox;
  fakeOAuthProvider: FakeOAuthProvider;
}

export interface CreateExampleServerOptions {
  authRouter?: Router;
  scenarios?: Record<string, (context: ExampleSeedContext) => Promise<void> | void>;
  eventBuffer?: ExampleEventBuffer;
  otpInbox?: ExampleOtpInbox;
  fakeOAuthProvider?: FakeOAuthProvider;
  baseUrl?: string;
  middleware?: RequestHandler[];
}

export interface ExampleServerInstance {
  app: Express;
  eventBuffer: ExampleEventBuffer;
  otpInbox: ExampleOtpInbox;
  fakeOAuthProvider: FakeOAuthProvider;
  resetScenario(scenario: string): Promise<ExampleResetResult>;
  listen(port?: number, host?: string): Promise<{
    baseUrl: string;
    close(): Promise<void>;
    server: HttpServer;
  }>;
}

export function createExampleServer(options: CreateExampleServerOptions = {}): ExampleServerInstance {
  const app = express();
  const eventBuffer = options.eventBuffer ?? new ExampleEventBuffer();
  const otpInbox = options.otpInbox ?? new ExampleOtpInbox();
  const fakeOAuthProvider = options.fakeOAuthProvider ?? createFakeOAuthProvider(
    options.baseUrl ?? 'http://127.0.0.1:4400'
  );
  const scenarios = options.scenarios ?? {
    baseline: () => undefined
  };

  const seedContext: ExampleSeedContext = {
    app,
    eventBuffer,
    otpInbox,
    fakeOAuthProvider
  };

  app.use(express.json());
  for (const middleware of options.middleware ?? []) {
    app.use(middleware);
  }

  app.get('/health', (_request, response) => {
    response.json({
      ok: true,
      data: {
        healthy: true
      }
    });
  });

  const fakeOAuthMiddleware = toExpress(fakeOAuthProvider.router);
  app.use('/demo', (request, response, next) => {
    if (!request.path.startsWith('/fake-oauth/')) {
      next();
      return;
    }

    fakeOAuthMiddleware(request, response, next);
  });

  app.use(
    '/demo',
    toExpress(
      createDemoRouter({
        resetScenario: async ({ scenario }) => resetScenarioInternal(scenario),
        listEvents: () => eventBuffer.list(),
        latestOtp: (input) => otpInbox.latest(input)
      })
    )
  );

  if (options.authRouter) {
    app.use(toExpress(options.authRouter));
  }

  async function resetScenarioInternal(scenario: string): Promise<ExampleResetResult> {
    const reset = scenarios[scenario];
    if (!reset) {
      throw new AuthFnExampleError(
        'AUTHFN_EXAMPLE_SCENARIO_UNKNOWN',
        'Unknown example seed scenario',
        {
          status: 400,
          details: {
            scenario
          }
        }
      );
    }

    eventBuffer.reset();
    otpInbox.reset();
    fakeOAuthProvider.reset();
    await Promise.resolve(reset(seedContext));

    return {
      scenario,
      seeded: true
    };
  }

  return {
    app,
    eventBuffer,
    otpInbox,
    fakeOAuthProvider,
    resetScenario: resetScenarioInternal,
    async listen(port: number = 0, host: string = '127.0.0.1') {
      const server = await new Promise<HttpServer>((resolve) => {
        const started = app.listen(port, host, () => {
          resolve(started);
        });
      });
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Example server failed to resolve a TCP address');
      }

      return {
        server,
        baseUrl: `http://${host}:${address.port}`,
        close: async () =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => {
              if (error) {
                reject(error);
                return;
              }
              resolve();
            });
          })
      };
    }
  };
}
