/**
 * Core type definitions for the authentication abstraction layer
 */

type UnknownRecord = Record<string, unknown>;

export type AuthActorType = 'user' | 'api-key' | 'service';

/**
 * Actor information associated with an authenticated session.
 */
export interface AuthSubject {
  /** Unique identifier for the authenticated actor */
  actorId: string;

  /** Actor category (user, API key, service, etc.) */
  actorType: AuthActorType;

  /** Optional tenant/workspace identifier */
  tenantId?: string;

  /** Optional region identifier */
  regionId?: string;

  /** Optional canonical email for user actors */
  email?: string;

  /** Optional opaque subject attributes */
  attributes?: UnknownRecord;
}

// ============================================================================
// Authentication Session
// ============================================================================

/**
 * Authenticated session data returned by auth providers
 */
export interface AuthSession<TMetadata = any> {
  /** Unique identifier for the authenticated entity (user, API key, etc.) */
  id: string;

  /** Type of authentication (e.g., 'api-key', 'session', 'jwt', 'oauth') */
  type: string;

  /** Actor/subject represented by the session */
  subject: AuthSubject;

  /** Resource IDs this session has access to (e.g., project IDs, organization IDs) */
  resourceIds?: string[];

  /** Optional: Scopes or permissions */
  scopes?: string[];

  /** Optional: Satisfied auth methods */
  methods?: string[];

  /** Optional: Expiration timestamp */
  expiresAt?: Date;

  /** Optional: Additional metadata */
  metadata?: TMetadata;
}

// ============================================================================
// Auth Provider Interface
// ============================================================================

/**
 * Core authentication provider interface
 * All auth implementations must conform to this interface
 */
export interface AuthProvider<TSession extends AuthSession = AuthSession> {
  /**
   * Authenticate a request and return session data
   * Returns null if authentication fails
   */
  authenticate(request: Request): Promise<TSession | null>;

  /**
   * Optional: Validate if a session has access to a specific resource
   */
  authorize?(session: TSession, resourceId: string): Promise<boolean>;

  /**
   * Optional: Revoke/invalidate a session
   */
  revoke?(sessionId: string): Promise<void>;
}

// ============================================================================
// Auth Configuration
// ============================================================================

/**
 * Common configuration options for auth providers
 */
export interface AuthProviderConfig {
  /** Optional: Custom header names for authentication */
  headers?: {
    authorization?: string;
    resourceId?: string;
  };

  /** Optional: Skip authentication for specific paths */
  skipPaths?: string[];
}

// ============================================================================
// Auth Context Provider (Client-Side)
// ============================================================================

/**
 * Authentication context containing user/tenant identifiers.
 * Used by client libraries to isolate data per user/tenant.
 */
export interface AuthContext {
  /** Unique identifier for the authenticated user */
  userId: string;
  /** Optional tenant identifier for multi-tenant applications */
  tenantId?: string;
  /** Optional region identifier for multi-region applications */
  regionId?: string;
  /** Optional additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Provider for extracting authentication context on the client side.
 * Used by client libraries like datafn to isolate data per user/tenant.
 *
 * @example
 * ```typescript
 * const authProvider: AuthContextProvider = {
 *   getContext: () => ({
 *     userId: getCurrentUserId(),
 *     tenantId: getCurrentTenantId(),
 *   }),
 * };
 * ```
 */
export interface AuthContextProvider<TContext extends AuthContext = AuthContext> {
  /**
   * Get current authentication context (user ID, tenant ID, etc.)
   * This context is used to construct isolated storage identifiers.
   *
   * @returns The authentication context synchronously or as a promise
   */
  getContext(): TContext | Promise<TContext>;
}

// ============================================================================
// Auth Errors
// ============================================================================

export class AuthError extends Error {
  constructor(message: string, public code: string, public statusCode: number = 401) {
    super(message);
    this.name = 'AuthError';
  }
}

export class AuthValidationError extends AuthError {
  constructor(message: string = 'Invalid auth payload') {
    super(message, 'AUTH_VALIDATION_ERROR', 400);
    this.name = 'AuthValidationError';
  }
}

export class AuthenticationError extends AuthError {
  constructor(message: string = 'Authentication failed') {
    super(message, 'AUTHENTICATION_FAILED', 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AuthError {
  constructor(message: string = 'Access denied') {
    super(message, 'AUTHORIZATION_FAILED', 403);
    this.name = 'AuthorizationError';
  }
}

export class InvalidCredentialsError extends AuthError {
  constructor(message: string = 'Invalid credentials') {
    super(message, 'INVALID_CREDENTIALS', 401);
    this.name = 'InvalidCredentialsError';
  }
}

export class ExpiredCredentialsError extends AuthError {
  constructor(message: string = 'Credentials expired') {
    super(message, 'EXPIRED_CREDENTIALS', 401);
    this.name = 'ExpiredCredentialsError';
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Runtime predicate for auth subjects.
 */
export function isAuthSubject(value: unknown): value is AuthSubject {
  if (!isRecord(value)) {
    return false;
  }

  if (typeof value.actorId !== 'string' || value.actorId.length === 0) {
    return false;
  }

  if (!['user', 'api-key', 'service'].includes(String(value.actorType))) {
    return false;
  }

  if (value.tenantId !== undefined && typeof value.tenantId !== 'string') {
    return false;
  }

  if (value.regionId !== undefined && typeof value.regionId !== 'string') {
    return false;
  }

  if (value.email !== undefined && typeof value.email !== 'string') {
    return false;
  }

  if (value.attributes !== undefined && !isRecord(value.attributes)) {
    return false;
  }

  return true;
}

/**
 * Runtime assertion for auth subjects.
 */
export function assertValidAuthSubject(value: unknown): asserts value is AuthSubject {
  if (!isAuthSubject(value)) {
    throw new AuthValidationError('Invalid auth subject');
  }
}

/**
 * Runtime predicate for auth sessions.
 */
export function isAuthSession<TMetadata = unknown>(value: unknown): value is AuthSession<TMetadata> {
  if (!isRecord(value)) {
    return false;
  }

  if (typeof value.id !== 'string' || value.id.length === 0) {
    return false;
  }

  if (typeof value.type !== 'string' || value.type.length === 0) {
    return false;
  }

  if (!isAuthSubject(value.subject)) {
    return false;
  }

  if (value.resourceIds !== undefined && !isStringArray(value.resourceIds)) {
    return false;
  }

  if (value.scopes !== undefined && !isStringArray(value.scopes)) {
    return false;
  }

  if (value.methods !== undefined && !isStringArray(value.methods)) {
    return false;
  }

  if (value.expiresAt !== undefined && !(value.expiresAt instanceof Date)) {
    return false;
  }

  return true;
}

/**
 * Runtime assertion for auth sessions.
 */
export function assertValidAuthSession<TMetadata = unknown>(
  value: unknown
): asserts value is AuthSession<TMetadata> {
  if (!isAuthSession<TMetadata>(value)) {
    throw new AuthValidationError('Invalid auth session');
  }
}
