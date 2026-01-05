/**
 * Core type definitions for the authentication abstraction layer
 */

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

  /** Resource IDs this session has access to (e.g., project IDs, organization IDs) */
  resourceIds: string[];

  /** Optional: Scopes or permissions */
  scopes?: string[];

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
// Auth Errors
// ============================================================================

export class AuthError extends Error {
  constructor(message: string, public code: string, public statusCode: number = 401) {
    super(message);
    this.name = 'AuthError';
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
