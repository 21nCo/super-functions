# billfn

`billfn` is a self-hostable billing and entitlement infrastructure layer for product builders.

It currently ships:

- TypeScript core packages:
  - `@billfn/core`
  - `@billfn/client`
  - `@billfn/svelte`
- `@billfn/provider-dodo`
- `@billfn/provider-apple`
- `@billfn/swift-bridge`
- Swift package:
  - `billfn/swift`
- Python SDK:
  - `billfn/python`

The core design is entitlement-first:

- providers are the source of truth for money movement
- `billfn` is the internal source of truth for entitlement state
- downstream consumers should read entitlements and quotas, not provider payloads

## Package Layout

```text
billfn/
  core/
  client/
  svelte/
  provider-dodo/
  provider-apple/
  swift-bridge/
  swift/
  python/
  docs/
```

## Docs

- [Overview](./docs/content/docs/index.mdx)
- [Getting Started](./docs/content/docs/getting-started.mdx)
- [Architecture](./docs/content/docs/architecture.mdx)
- [Production Readiness](./docs/content/docs/production-readiness.mdx)
- [TypeScript Client](./docs/content/docs/clients/typescript.mdx)
- [Swift Client](./docs/content/docs/clients/swift.mdx)
- [Python SDK](./docs/content/docs/clients/python.mdx)
- [Troubleshooting](./docs/content/docs/troubleshooting.mdx)

## Python Quick Start

```bash
cd billfn/python
python3.10 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -e ../../packages/python-core
pip install -e ".[dev]"
python examples/mock_transport.py
```

The Python SDK is intentionally focused on typed remote/local consumption of the `billfn` HTTP surface:

- sync and async HTTP clients
- canonical envelopes and typed errors
- schema helpers mirroring the TS package
- typed request and response models
