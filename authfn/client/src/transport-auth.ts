import type {
  HttpTransportAuthOptions,
  HttpTransportAuthProvider,
} from '@superfunctions/http';
import { createAuthFnSessionTransportAuth } from './transport-auth-internal.js';

export type AuthFnTransportAuthOptions = Pick<
  HttpTransportAuthOptions,
  'headers' | 'plugins' | 'onUnauthorized'
>;

/**
 * Creates a generic HTTP transport auth provider backed by AuthFn session options.
 */
export function createAuthFnTransportAuth(
  options: AuthFnTransportAuthOptions = {},
): HttpTransportAuthProvider {
  return createAuthFnSessionTransportAuth(options);
}
