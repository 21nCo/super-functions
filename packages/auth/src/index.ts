/**
 * @superfunctions/auth - Framework-agnostic authentication abstraction layer
 */

// Core types
export type {
  AuthActorType,
  AuthSubject,
  AuthSession,
  AuthProvider,
  AuthProviderConfig,
  AuthContext,
  AuthContextProvider,
} from './types.js';

// Errors
export {
  AuthError,
  AuthValidationError,
  AuthenticationError,
  AuthorizationError,
  InvalidCredentialsError,
  ExpiredCredentialsError,
  isAuthSubject,
  assertValidAuthSubject,
  isAuthSession,
  assertValidAuthSession,
} from './types.js';

// Middleware utilities
export {
  createAuthMiddleware,
  createResourceAuthMiddleware,
  createBearerAuthMiddleware,
  extractBearerToken,
  extractBearerTokenFromHeader,
} from './middleware.js';
