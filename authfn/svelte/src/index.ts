export {
  createAuthFnSessionStore,
  type AuthFnSessionStore
} from './session-store.js';

import type { AuthFnClient } from '@authfn/client';
import { getContext, setContext } from 'svelte';

const AUTHFN_CLIENT_CONTEXT = Symbol('authfn-client');

export function createAuthFnClientContext(client: AuthFnClient): { client: AuthFnClient } {
  const value = { client };
  setContext(AUTHFN_CLIENT_CONTEXT, value);
  return value;
}

export function getAuthFnClientContext(): { client: AuthFnClient } {
  const value = getContext<{ client: AuthFnClient } | undefined>(AUTHFN_CLIENT_CONTEXT);
  if (!value) {
    throw new Error(
      '@authfn/svelte: AuthFn client context is not set. Call createAuthFnClientContext() in a parent component first.'
    );
  }
  return value;
}
