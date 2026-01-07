# @superfunctions/auth

Framework-agnostic authentication abstraction layer for Superfunctions libraries.

## Overview

`@superfunctions/auth` provides a standardized interface for authentication that works across any HTTP framework. Libraries can accept any auth provider conforming to this abstraction, and auth library authors can build implementations that work everywhere.

## Installation

```bash
npm install @superfunctions/auth
```

## Core Concepts

### AuthProvider Interface

All auth implementations must implement the `AuthProvider` interface:

```typescript
interface AuthProvider<TSession extends AuthSession = AuthSession> {
  authenticate(request: Request): Promise<TSession | null>;
  authorize?(session: TSession, resourceId: string): Promise<boolean>;
  revoke?(sessionId: string): Promise<void>;
}
```

### AuthSession

Authentication results return an `AuthSession`:

```typescript
interface AuthSession {
  id: string;              // Unique identifier
  type: string;            // Auth type: 'api-key', 'jwt', 'oauth', etc.
  resourceIds: string[];   // Resources this session can access
  scopes?: string[];       // Optional permissions
  expiresAt?: Date;        // Optional expiration
  metadata?: any;          // Optional additional data
}
```

## Usage

### For Library Authors

Accept auth providers in your library:

```typescript
import { createRouter } from '@superfunctions/http';
import { createAuthMiddleware, type AuthProvider } from '@superfunctions/auth';

export function createMyLibrary(config: {
  auth?: AuthProvider;
  // ... other config
}) {
  const middleware = config.auth 
    ? [createAuthMiddleware(config.auth)]
    : [];

  return createRouter({
    middleware,
    routes: [...]
  });
}
```

### For Auth Library Authors

Implement the `AuthProvider` interface:

```typescript
import type { AuthProvider, AuthSession } from '@superfunctions/auth';

export function createMyAuth(config: MyAuthConfig): AuthProvider {
  return {
    async authenticate(request: Request): Promise<AuthSession | null> {
      const token = request.headers.get('authorization');
      // Validate token and return session
      return {
        id: 'user_123',
        type: 'jwt',
        resourceIds: ['project_abc'],
      };
    },
    
    async authorize(session: AuthSession, resourceId: string): Promise<boolean> {
      return session.resourceIds.includes(resourceId);
    },
  };
}
```

### For Application Developers

Use any conforming auth library:

```typescript
import { createMyLibrary } from 'some-library';
import { createAuthFn } from 'authfn'; // or any other auth library

const auth = createAuthFn({
  database: adapter,
  // ... auth config
});

const library = createMyLibrary({
  auth: auth.provider,
  // ... other config
});
```

## Middleware Helpers

### createAuthMiddleware

Creates middleware for `@superfunctions/http` routers:

```typescript
import { createAuthMiddleware } from '@superfunctions/auth';

const authMiddleware = createAuthMiddleware(authProvider, {
  skipPaths: ['/health', '/public'],
  contextKey: 'auth', // default
});
```

### createResourceAuthMiddleware

Creates middleware for resource-level authorization:

```typescript
import { createResourceAuthMiddleware } from '@superfunctions/auth';

const resourceAuth = createResourceAuthMiddleware(authProvider, {
  resourceHeader: 'x-project-id',
  contextKey: 'auth',
});
```

## Error Types

- `AuthError` - Base error class
- `AuthenticationError` - Authentication failed (401)
- `AuthorizationError` - Access denied (403)
- `InvalidCredentialsError` - Invalid credentials (401)
- `ExpiredCredentialsError` - Credentials expired (401)

## Examples

See the [authfn](../../authfn) library for a complete reference implementation.

## License

MIT
