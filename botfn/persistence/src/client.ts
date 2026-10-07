import { createTRPCProxyClient, httpLink, type CreateTRPCProxyClient } from '@trpc/client';
import type { AppRouter } from './core.js';

export function createPersistenceClient(apiUrl: string) {
  return createTRPCProxyClient<AppRouter>({
    links: [
      httpLink({
        url: `${apiUrl}/trpc`,
      }),
    ],
  });
}

export type PersistenceClient = CreateTRPCProxyClient<AppRouter>;
