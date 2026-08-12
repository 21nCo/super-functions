export {
  createAuthFnSessionStore,
  type AuthFnSessionStore
} from './session-store.js';

import type { AuthFnClient, AuthFnRegionalClient } from '@authfn/client';
import { getContext, setContext } from 'svelte';

const AUTHFN_CLIENT_CONTEXT = Symbol('authfn-client');
const AUTHFN_REGIONAL_CLIENT_CONTEXT = Symbol('authfn-regional-client');

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

export function createAuthFnRegionalClientContext(
  client: AuthFnRegionalClient
): { client: AuthFnRegionalClient } {
  const value = { client };
  setContext(AUTHFN_REGIONAL_CLIENT_CONTEXT, value);
  setContext(AUTHFN_CLIENT_CONTEXT, value);
  return value;
}

export function getAuthFnRegionalClientContext(): { client: AuthFnRegionalClient } {
  const value = getContext<{ client: AuthFnRegionalClient } | undefined>(AUTHFN_REGIONAL_CLIENT_CONTEXT);
  if (!value) {
    throw new Error(
      '@authfn/svelte: AuthFn regional client context is not set. Call createAuthFnRegionalClientContext() in a parent component first.'
    );
  }
  return value;
}
