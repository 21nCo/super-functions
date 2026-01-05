/**
 * @superfunctions/auth - Framework-agnostic authentication abstraction layer
 */

// Core types
export type {
  AuthSession,
  AuthProvider,
  AuthProviderConfig,
} from './types.js';

// Errors
export {
  AuthError,
  AuthenticationError,
  AuthorizationError,
  InvalidCredentialsError,
  ExpiredCredentialsError,
} from './types.js';

// Middleware utilities
export {
  createAuthMiddleware,
  createResourceAuthMiddleware,
} from './middleware.js';
