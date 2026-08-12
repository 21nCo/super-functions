import type { AuthFnClient, AuthFnErrorEnvelope, AuthFnSession } from '@authfn/client';
import { derived, writable, type Readable } from 'svelte/store';

export interface AuthFnSessionState {
  loading: boolean;
  session: AuthFnSession | null;
  authenticated: boolean;
  regionId?: string;
  error: AuthFnErrorEnvelope['error'] | null;
}

export interface AuthFnSessionStore extends Readable<AuthFnSessionState> {
  refresh(): Promise<AuthFnSession | null>;
  clear(): void;
  session: Readable<AuthFnSession | null>;
  authenticated: Readable<boolean>;
  regionId: Readable<string | undefined>;
  error: Readable<AuthFnErrorEnvelope['error'] | null>;
}

export function createAuthFnSessionStore(client: AuthFnClient): AuthFnSessionStore {
  const store = writable<AuthFnSessionState>({
    loading: true,
    session: null,
    authenticated: false,
    error: null
  });
  let currentState: AuthFnSessionState = {
    loading: true,
    session: null,
    authenticated: false,
    error: null
  };
  let refreshVersion = 0;

  const setState = (state: AuthFnSessionState): void => {
    currentState = state;
    store.set(state);
  };

  const refresh = async (): Promise<AuthFnSession | null> => {
    const currentVersion = ++refreshVersion;
    setState({
      ...currentState,
      loading: true,
      error: null
    });

    try {
      const result = await client.getSession();
      if (currentVersion !== refreshVersion) {
        return currentState.session;
      }

      if (!result.ok) {
        setState(createState(null, false, result.error));
        return null;
      }

      const session = result.data.session;
      setState(createState(session, false, null));
      return session;
    } catch (error) {
      if (currentVersion === refreshVersion) {
        setState(createState(null, false, {
          code: 'AUTHFN_NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'AuthFn session refresh failed',
          retryable: true
        }));
        return null;
      }
      return currentState.session;
    }
  };

  void refresh();

  return {
    subscribe: store.subscribe,
    session: derived(store, ($state) => $state.session),
    authenticated: derived(store, ($state) => $state.authenticated),
    regionId: derived(store, ($state) => $state.regionId),
    error: derived(store, ($state) => $state.error),
    refresh,
    clear() {
      refreshVersion += 1;
      setState(createState(null, false, null));
    }
  };
}

function createState(
  session: AuthFnSession | null,
  loading: boolean,
  error: AuthFnErrorEnvelope['error'] | null
): AuthFnSessionState {
  return {
    loading,
    session,
    authenticated: Boolean(session),
    regionId: session?.regionId ?? session?.subject?.regionId,
    error
  };
}
