# PlugFn Architecture

This document describes the architecture and design decisions behind PlugFn.

## Overview

PlugFn is a self-hosted integration platform designed to be:
- **Multi-language**: TypeScript and Python SDKs with consistent APIs
- **Type-safe**: Full type safety in both languages
- **Extensible**: Easy to add custom providers
- **Self-hosted**: No vendor lock-in
- **Framework-agnostic**: Works with any HTTP framework

## Directory Structure

```
plugfn/
├── core/                # TypeScript runtime package
│   ├── src/
│   │   ├── core/       # Core managers
│   │   ├── auth/       # Authentication
│   │   ├── providers/  # Provider implementations
│   │   ├── storage/    # Storage layer
│   │   ├── middleware/ # Middleware (retry, cache, etc.)
│   │   ├── webhooks/   # Webhook handling
│   │   ├── router/     # HTTP routing
│   │   ├── testing/    # Testing utilities
│   │   └── types/      # TypeScript types
│   ├── tests/
│   └── examples/
│
├── python/              # Python SDK
│   ├── plugfn/
│   │   ├── core/       # Core managers
│   │   ├── auth/       # Authentication
│   │   ├── providers/  # Provider implementations
│   │   ├── storage/    # Storage layer
│   │   ├── middleware/ # Middleware
│   │   ├── webhooks/   # Webhook handling
│   │   ├── adapters/   # Framework adapters
│   │   ├── testing/    # Testing utilities
│   │   └── types.py    # Python types
│   ├── tests/
│   └── examples/
│
├── cli/                 # CLI tool (TypeScript)
├── docs/                # Shared documentation
├── providers/           # Provider specifications (JSON/YAML)
└── SPEC.md             # Full specification
```

## Core Components

### 1. PlugFn Core

Main entry point that orchestrates all components.

**Responsibilities:**
- Initialize and coordinate managers
- Provide unified API
- Handle configuration

### 2. Connection Manager

Manages user connections to providers.

**Responsibilities:**
- OAuth flow handling
- Token storage and encryption
- Token refresh
- Connection CRUD operations

**Flow:**
```
User → Get Auth URL → Provider OAuth → Callback → Store Token (encrypted)
```

### 3. Action Executor

Executes provider actions with middleware.

**Responsibilities:**
- Action validation
- Credential injection
- Middleware execution (retry, cache, rate limit)
- Result formatting

**Flow:**
```
Action Request → Validate → Get Connection → Apply Middleware → Execute → Return Result
```

### 4. Workflow Engine

Orchestrates multi-step workflows.

**Responsibilities:**
- Workflow definition storage
- Execution management
- Context passing
- Error handling

**Flow:**
```
Trigger Event → Filter → Execute Steps → Handle Errors → Complete
```

### 5. Webhook Handler

Receives and routes webhook events.

**Responsibilities:**
- Signature verification
- Event routing
- Handler registration
- Error handling

**Flow:**
```
Webhook → Verify Signature → Parse Event → Route to Handlers → Emit
```

### 6. Provider Registry

Manages available providers.

**Responsibilities:**
- Provider registration
- Provider lookup
- Metadata management

### 7. Storage Layer

Abstracts data persistence.

**Responsibilities:**
- Connection storage
- OAuth state storage
- OAuth token storage
- Workflow storage
- Webhook configuration storage
- Action logs

**Canonical model names:**
- `plugfn_connections`
- `plugfn_oauth_states`
- `plugfn_oauth_tokens`
- `plugfn_workflows`
- `plugfn_workflow_executions`
- `plugfn_webhooks`
- `plugfn_action_logs`
- `plugfn_provider_installations`
- `plugfn_connection_grants`
- `plugfn_webhook_receipts`
- `plugfn_webhook_deliveries`
- `plugfn_sync_jobs`
- `plugfn_sync_checkpoints`
- `plugfn_provider_events`
- `plugfn_secret_refs`

**TypeScript ownership after Phase 01:**
- `src/storage/adapters/database.ts` owns the PlugFn model mapping and shared-db adapter layer.
- `src/storage/oauth-state-store.ts` owns first-class OAuth state persistence backed by `@superfunctions/oauth-storage`.
- `src/storage/oauth-token-vault.ts` owns first-class OAuth token persistence backed by `@superfunctions/oauth-storage`.

**Adapters:**
- Memory (for testing, via `@superfunctions/db` memory adapter)
- Shared database adapter contract from `@superfunctions/db`

## Data Flow

### OAuth Connection Flow

```
┌─────────┐         ┌──────────┐         ┌──────────┐         ┌──────────┐
│  User   │────────▶│ PlugFn   │────────▶│ Provider │────────▶│ Database │
└─────────┘         └──────────┘         └──────────┘         └──────────┘
                          │                     │                    │
     1. Get Auth URL      │                     │                    │
                          │  2. Redirect        │                    │
                          │◀────────────────────│                    │
                          │                     │                    │
     3. User authorizes   │                     │                    │
                          │  4. Callback        │                    │
                          │────────────────────▶│                    │
                          │  5. Exchange token  │                    │
                          │◀────────────────────│                    │
                          │                     │  6. Store (encrypted)
                          │─────────────────────────────────────────▶│
```

### Action Execution Flow

```
┌──────────┐    ┌──────────┐    ┌────────────┐    ┌──────────┐
│ App Code │───▶│ PlugFn   │───▶│ Middleware │───▶│ Provider │
└──────────┘    └──────────┘    └────────────┘    └──────────┘
                      │                │                  │
                      │  1. Execute    │                  │
                      │───────────────▶│  2. Retry/Cache  │
                      │                │─────────────────▶│
                      │                │  3. API Call     │
                      │                │◀─────────────────│
                      │  4. Result     │                  │
                      │◀───────────────│                  │
```

### Webhook Flow

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Provider │───▶│ HTTP     │───▶│ Webhook  │───▶│ Handlers │
└──────────┘    │ Router   │    │ Handler  │    └──────────┘
                └──────────┘    └──────────┘
                      │                │
     1. POST /webhook │                │
                      │  2. Verify     │
                      │───────────────▶│
                      │  3. Route      │
                      │                │───────▶ Handler 1
                      │                │───────▶ Handler 2
                      │                │───────▶ Handler 3
```

## Security

### Token Encryption

All tokens are encrypted at rest using AES-256-GCM:

```
Token → Encrypt (AES-256-GCM) → Store in Database
Database → Decrypt → Use for API Call
```

### Webhook Verification

Webhooks are verified using HMAC signatures:

```
Payload + Secret → HMAC-SHA256 → Compare with Header Signature
```

### OAuth Security

- State parameter for CSRF protection
- Redirect URI validation
- Token rotation
- Scope validation

## Extensibility

### Adding a Provider

1. Create provider definition
2. Implement actions
3. Implement triggers (optional)
4. Add type definitions
5. Write tests
6. Add documentation

### Custom Storage Adapter

Implement the adapter interface:

```typescript
interface Adapter {
  createConnection(connection: Connection): Promise<void>;
  getConnection(id: string): Promise<Connection | null>;
  // ... other methods
}
```

### Custom Middleware

Add to the middleware pipeline:

```typescript
async function customMiddleware(action, next) {
  // Before
  const result = await next();
  // After
  return result;
}
```

## Performance Considerations

### Caching

- Action results cached by default (5 minutes)
- Configurable per-action
- Cache key based on action + params + user

### Rate Limiting

- Token bucket algorithm
- Per-provider limits
- Respects provider rate limits
- Automatic retry with backoff

### Connection Pooling

- HTTP client reuses connections
- Keep-alive enabled
- Configurable timeouts

## Multi-Language Support

### TypeScript

- Full async/await support
- Type inference
- Zod validation
- Works with Node.js, Deno, Bun

### Python

- Full async/await support
- Type hints
- Pydantic validation
- Works with Python 3.10+

### Shared

- Common provider specifications
- Consistent API design
- Shared documentation

## Testing Strategy

### Unit Tests

- Mock providers
- Mock storage
- Test individual components

### Integration Tests

- Real provider APIs (with test accounts)
- Database integration
- HTTP integration

### E2E Tests

- Full OAuth flow
- Webhook delivery
- Workflow execution

## Deployment

### Self-Hosted

Run on your own infrastructure:
- Docker containers
- Kubernetes
- VMs
- Serverless (with limitations)

### Database

Supported databases:
- PostgreSQL
- MySQL
- SQLite
- MongoDB (via adapters)

### Environment Variables

```bash
BASE_URL=https://myapp.com
ENCRYPTION_KEY=<32-byte-hex-key-or-strong-passphrase>
DATABASE_URL=postgresql://...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

## Monitoring

### Metrics

- Request count
- Success rate
- Response time
- Rate limit hits

### Logging

- Action execution
- Connection events
- Webhook events
- Errors

### Alerts

- Connection expiry
- Rate limit exceeded
- Action failures
- Webhook failures

## Future Enhancements

- Real-time workflow execution
- Visual workflow builder
- AI-powered action suggestions
- Community provider marketplace
- Enterprise features (SSO, audit logs)
