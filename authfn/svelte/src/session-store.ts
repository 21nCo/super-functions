import type { AuthFnClient, AuthFnSession } from '@authfn/client';
import { writable, type Readable } from 'svelte/store';

export interface AuthFnSessionStore extends Readable<AuthFnSession | null> {
  refresh(): Promise<AuthFnSession | null>;
  clear(): void;
}

export function createAuthFnSessionStore(client: AuthFnClient): AuthFnSessionStore {
  const store = writable<AuthFnSession | null>(null);
  let currentSession: AuthFnSession | null = null;
  let refreshVersion = 0;

  const setSession = (session: AuthFnSession | null): void => {
    currentSession = session;
    store.set(session);
  };

  const refresh = async (): Promise<AuthFnSession | null> => {
    const currentVersion = ++refreshVersion;
    try {
      const result = await client.getSession();
      const session = result.ok ? result.data.session : null;
      if (currentVersion === refreshVersion) {
        setSession(session);
        return session;
      }
      return currentSession;
    } catch {
      if (currentVersion === refreshVersion) {
        setSession(null);
        return null;
      }
      return currentSession;
    }
  };

  void refresh();

  return {
    subscribe: store.subscribe,
    refresh,
    clear() {
      refreshVersion += 1;
      setSession(null);
    }
  };
}
