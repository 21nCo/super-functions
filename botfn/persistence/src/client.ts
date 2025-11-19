import { createTRPCProxyClient, httpLink } from '@trpc/client';
import type { AppRouter } from './core';

export function createPersistenceClient(apiUrl: string) {
  return createTRPCProxyClient<AppRouter>({
    links: [
      httpLink({
        url: `${apiUrl}/trpc`,
      }),
    ],
  });
}

export type PersistenceClient = ReturnType<typeof createPersistenceClient>;
