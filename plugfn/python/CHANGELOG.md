# Changelog

All notable changes to the PlugFn Python SDK will be documented in this file.

## [0.1.0] - 2026-01-12

### Added

#### Core Features
- **PlugFn Core** (`plugfn.core.plug_fn`)
  - Main `PlugFn` class with initialization
  - `PlugFnConfig` for configuration management
  - Dynamic provider access via proxy pattern
  - `ConnectionsAPI`, `WorkflowsAPI`, `WebhooksAPI`, `ProvidersAPI`

- **Connection Management** (`plugfn.core.connection_manager`)
  - OAuth 2.0 authorization flow
  - Connection storage and lifecycle management
  - Token refresh support
  - Secure credential encryption/decryption

- **Provider Registry** (`plugfn.core.provider_registry`)
  - Provider registration and lookup
  - Provider status tracking (available/configured)
  - Provider metadata management

- **Action Executor** (`plugfn.core.action_executor`)
  - Action execution with retry logic
  - Exponential backoff for retries
  - Action logging and metrics
  - Batch action execution
  - Rate limiting support (configurable)
  - Caching support (configurable)

- **Workflow Engine** (`plugfn.core.workflow_engine`)
  - Workflow creation and management
  - Workflow execution tracking
  - Workflow statistics and metrics
  - Enable/disable workflow support

#### Authentication
- **OAuth Flow Handler** (`plugfn.auth.oauth_flow`)
  - OAuth 2.0 authorization URL generation
  - Authorization code exchange
  - Token refresh
  - Custom provider parameter support

- **Token Store** (`plugfn.auth.token_store`)
  - In-memory token store for OAuth state
  - TTL-based expiration
  - Abstract interface for custom implementations

#### Storage
- **Connection Storage** (`plugfn.storage.connection_storage`)
  - Database adapter wrapper for connections
  - CRUD operations for connections

- **Workflow Storage** (`plugfn.storage.workflow_storage`)
  - Database adapter wrapper for workflows
  - Workflow execution tracking

- **Secure Token Storage** (`plugfn.storage.token_storage`)
  - Fernet-based symmetric encryption
  - Secure credential storage

#### HTTP Client
- **HTTP Client** (`plugfn.http.http_client`)
  - Async HTTP client using httpx
  - OAuth 2.0 authentication
  - API Key authentication
  - Basic authentication
  - JWT authentication support
  - Methods: GET, POST, PUT, PATCH, DELETE

#### Webhooks
- **Webhook Handler** (`plugfn.webhooks.webhook_handler`)
  - Webhook event registration
  - Signature verification (GitHub, Slack)
  - Event handler execution
  - Error handling

#### Providers
- **GitHub Provider** (`plugfn.providers.github`)
  - Actions: `issues.create`, `repos.get`, `pulls.create`
  - Triggers: `issues.opened`, `pull_request.opened`, `push`
  - OAuth 2.0 authentication
  - Rate limiting: 5000 requests/hour

- **Slack Provider** (`plugfn.providers.slack`)
  - Actions: `chat.postMessage`, `conversations.create`, `users.info`
  - Triggers: `message`, `app_mention`
  - OAuth 2.0 authentication
  - Rate limiting: 100 requests/minute

#### Framework Adapters
- **FastAPI Adapter** (`plugfn.adapters.fastapi`)
  - OAuth endpoints
  - Connection management endpoints
  - Webhook endpoints
  - Provider listing

- **Flask Adapter** (`plugfn.adapters.flask`)
  - Same endpoints as FastAPI adapter
  - Sync wrapper for async operations

#### Utilities
- **Logger** (`plugfn.utils.logger`)
  - Console logger implementation
  - Structured logging with metadata
  - Log levels: debug, info, warn, error

#### Type System
- **Types** (`plugfn.types`)
  - Pydantic models for all data structures
  - `Connection`, `Workflow`, `Provider`
  - `AuthType`, `ConnectionStatus`, `WorkflowStatus` enums
  - `DatabaseAdapter`, `AuthProvider` protocols

#### Documentation
- Complete README with examples
- Implementation guide (`IMPLEMENTATION.md`)
- Provider creation guide (`docs/CREATING_PROVIDERS.md`)
- Quick start guide (`docs/QUICKSTART.md`)
- This changelog

#### Examples
- Basic usage example (`examples/basic_usage.py`)
  - In-memory adapter implementation
  - Provider registration
  - OAuth flow demonstration
  - Webhook handling
  - Metrics retrieval

- FastAPI example (`examples/fastapi_example.py`)
  - Full FastAPI integration
  - OAuth flow endpoints
  - Custom action endpoints
  - Webhook handling

#### Tests
- Basic test suite (`tests/test_basic.py`)
  - Mock adapters
  - Provider registration tests
  - OAuth URL generation tests
  - Connection management tests
  - Webhook handler tests
  - Metrics tests

#### Development Tools
- `pyproject.toml` with all dependencies
- `setup.py` for package distribution
- pytest configuration
- mypy type checking configuration
- ruff linting configuration
- black formatting configuration

### Features in Detail

#### OAuth 2.0 Flow
1. Generate authorization URL with state management
2. Handle callback with code exchange
3. Store encrypted credentials
4. Automatic token refresh
5. Connection lifecycle management

#### Action Execution
1. Get or select user connection
2. Decrypt credentials
3. Create authenticated HTTP client
4. Execute action with retry logic
5. Log execution for metrics
6. Return structured result

#### Webhook Processing
1. Register event handlers
2. Verify webhook signatures
3. Execute registered handlers
4. Return handler results
5. Error handling and logging

#### Provider Model
- Metadata (name, description, version)
- Authentication configuration
- Action definitions with Pydantic validation
- Trigger/webhook definitions
- Rate limiting configuration
- Base URL and headers

### API Compatibility

The Python SDK maintains API parity with the TypeScript SDK:

- ✅ Same initialization pattern
- ✅ Same method signatures (adapted for Python)
- ✅ Same OAuth flow
- ✅ Same webhook handling
- ✅ Same provider model
- ✅ Same framework adapter patterns

### Dependencies

**Core:**
- httpx >= 0.25.0 (async HTTP)
- pydantic >= 2.5.0 (data validation)
- cryptography >= 41.0.0 (encryption)
- python-jose >= 3.3.0 (JWT support)

**Optional:**
- fastapi >= 0.104.0 (FastAPI adapter)
- uvicorn >= 0.24.0 (ASGI server)
- flask >= 3.0.0 (Flask adapter)

**Development:**
- pytest >= 7.4.0
- pytest-asyncio >= 0.21.0
- pytest-cov >= 4.1.0
- mypy >= 1.7.0
- ruff >= 0.1.6
- black >= 23.11.0

### Known Limitations

1. **Caching**: Currently in-memory only, Redis support planned
2. **Rate Limiting**: Basic implementation, per-provider limits planned
3. **Workflow Engine**: Basic implementation, advanced features planned
4. **Provider Count**: 2 providers (GitHub, Slack), more planned
5. **Database Adapters**: No built-in adapters, user must implement

### Migration from TypeScript

If you're familiar with the TypeScript SDK:

```typescript
// TypeScript
const plug = plugFn({
  database: adapter,
  // ...
});

const issue = await plug.github['issues.create']({
  userId: 'user-123',
  params: { /* ... */ }
});
```

```python
# Python
plug = PlugFn(
    database=adapter,
    # ...
)

issue = await plug.github.issues.create(
    user_id='user-123',
    params={ /* ... */ }
)
```

### Future Plans

- **v0.2.0**: More providers (Linear, Discord, Stripe)
- **v0.3.0**: Redis caching, advanced rate limiting
- **v0.4.0**: Workflow builder, visual editor
- **v0.5.0**: CLI tool, provider generator
- **v1.0.0**: Production claim considered only after the release gate and provider matrix both pass

### Contributing

See CONTRIBUTING.md for guidelines on:
- Adding new providers
- Implementing database adapters
- Submitting bug fixes
- Requesting features

### License

Apache-2.0

### Authors

SuperFunctions Team

### Acknowledgments

- Inspired by Zapier, Integromat, and n8n
- TypeScript SDK as reference implementation
- Python async/await ecosystem
- FastAPI and Flask communities
