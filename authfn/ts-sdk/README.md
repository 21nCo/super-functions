# authfn

API key authentication library using Superfunctions abstractions.

## Overview

`authfn` is a reference implementation of the `@superfunctions/auth` abstraction that provides API key-based authentication. It includes:

- **Auth Provider**: Conforms to `@superfunctions/auth` interface
- **Database Storage**: Uses `@superfunctions/db` adapters for storing API keys
- **Management API**: Optional HTTP API for managing keys (uses `@superfunctions/http`)
- **Key Generation**: Secure API key generation and validation

## Installation

```bash
npm install authfn @superfunctions/db @superfunctions/http
```

## Quick Start

### 1. Generate Schema

First, generate the database schema for your ORM:

```bash
npx @superfunctions/cli generate-schema \
  --config ./node_modules/authfn \
  --adapter drizzle \
  --output ./src/db
```

### 2. Setup Database

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as authSchema from './db/authfn-schema';

const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client, { schema: authSchema });
```

### 3. Create authfn Instance

```typescript
import { createAuthFn } from 'authfn';
import { drizzleAdapter } from '@superfunctions/db/adapters';

const adapter = drizzleAdapter({ db, dialect: 'postgres' });

const auth = createAuthFn({
  database: adapter,
  namespace: 'authfn',
  enableApi: true,
  apiConfig: {
    adminKey: process.env.ADMIN_KEY, // Optional: protect management API
  },
});
```

### 4. Use with Libraries

Use the auth provider with any library accepting `@superfunctions/auth`:

```typescript
import { createConductBackend } from 'conduct-backend';

const conduct = createConductBackend({
  database: adapter,
  auth: auth.provider,
});
```

### 5. Mount API

Mount both the auth management API and your library's API:

```typescript
import express from 'express';
import { toExpress } from '@superfunctions/http-express';

const app = express();

// Mount auth management API
app.use('/api/auth', toExpress(auth.router));

// Mount your library's API
app.use('/api/conduct', toExpress(conduct.router));

app.listen(3000);
```

## API Reference

### createAuthFn(config)

Creates an authfn instance.

**Config Options:**

```typescript
{
  database: Adapter;           // Database adapter
  namespace?: string;          // Table prefix (default: 'authfn')
  enableApi?: boolean;         // Enable management API (default: false)
  apiConfig?: {
    basePath?: string;         // API base path (default: '/auth')
    adminKey?: string;         // Admin key for managing keys
  };
}
```

**Returns:**

```typescript
{
  provider: AuthProvider;      // Auth provider for use with libraries
  router?: Router;             // Management API router (if enabled)
  createKey: Function;         // Create API key programmatically
  revokeKey: Function;         // Revoke API key
  getKey: Function;            // Get API key by ID
  listKeys: Function;          // List API keys
}
```

### Management API Endpoints

When `enableApi` is true, the following endpoints are available:

#### POST /keys

Create a new API key.

**Request:**
```json
{
  "name": "My API Key",
  "resourceIds": ["project_abc", "project_def"],
  "scopes": ["read", "write"],
  "metadata": { "team": "engineering" },
  "expiresAt": "2025-12-31T23:59:59Z"
}
```

**Response:**
```json
{
  "id": "key_abc123",
  "key": "ak_64characterhexstring..."
}
```

**Note:** The actual key value is only returned once during creation. Store it securely.

#### GET /keys

List all API keys (without key values).

**Query Parameters:**
- `resourceId` - Filter by resource ID

**Response:**
```json
{
  "keys": [
    {
      "id": "key_abc123",
      "name": "My API Key",
      "resourceIds": ["project_abc"],
      "scopes": ["read", "write"],
      "metadata": { "team": "engineering" },
      "expiresAt": "2025-12-31T23:59:59Z",
      "lastUsedAt": "2025-01-15T10:30:00Z",
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

#### GET /keys/:id

Get a specific API key by ID (without key value).

#### DELETE /keys/:id

Revoke an API key.

**Response:**
```json
{
  "success": true
}
```

### Programmatic Usage

You can also create and manage keys programmatically:

```typescript
// Create a key
const { id, key } = await auth.createKey({
  name: 'My API Key',
  resourceIds: ['project_abc'],
  scopes: ['read', 'write'],
  expiresAt: new Date('2025-12-31'),
});

// List keys
const keys = await auth.listKeys();

// Get a key
const apiKey = await auth.getKey('key_abc123');

// Revoke a key
await auth.revokeKey('key_abc123');
```

## Database Schema

authfn creates a single table:

### `{namespace}_api_keys`

- `id` - Unique identifier
- `key` - API key value (unique, indexed)
- `name` - Descriptive name
- `resource_ids` - JSON array of resource IDs
- `scopes` - JSON array of scopes/permissions
- `metadata` - JSON object for additional data
- `expires_at` - Expiration timestamp
- `last_used_at` - Last usage timestamp
- `revoked_at` - Revocation timestamp
- `created_at` - Creation timestamp

## Security

- API keys are 64-character hex strings with a prefix
- Keys are validated against database on each request
- Expired and revoked keys are rejected
- Management API requires admin key authentication
- Key values are never returned in list/get operations

## Integration Examples

### With Conduct Backend

```typescript
const auth = createAuthFn({
  database: adapter,
  enableApi: true,
});

const conduct = createConductBackend({
  database: adapter,
  auth: {
    ...auth.provider,
    // Map resourceIds to projectIds
    authenticate: async (request) => {
      const session = await auth.provider.authenticate(request);
      if (!session) return null;
      return {
        ...session,
        projectIds: session.resourceIds,
      };
    },
  },
});
```

### Custom Implementation

Implement your own auth provider using the same abstraction:

```typescript
import type { AuthProvider, AuthSession } from '@superfunctions/auth';

const customAuth: AuthProvider = {
  async authenticate(request: Request): Promise<AuthSession | null> {
    // Your custom auth logic
    return {
      id: 'user_123',
      type: 'custom',
      resourceIds: ['resource_1'],
    };
  },
};
```

## License

MIT
