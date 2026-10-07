# PlugFn Python Runtime

The Python PlugFn package is currently labeled **experimental baseline**.

That means:

- the package imports cleanly and has a passing Python test baseline
- the runtime now exports the declared core provider set
- the package is not production-ready and not parity-complete

## Install

```bash
pip install plugfn
```

## Current scope

Today the Python package should be treated as early runtime scaffolding for:

- provider registration
- OAuth connection flow scaffolding
- workflow and webhook scaffolding
- core provider exports for `github`, `linear`, `clickup`, and `gmail`
- adjacent experimental provider exports such as `slack`

For adoption or release decisions, use [../docs/provider-readiness-matrix.md](../docs/provider-readiness-matrix.md) as the source of truth rather than source-tree presence alone.

## Current usage shape

```python
from plugfn import PlugFn
from plugfn.providers import github_provider

plug = PlugFn(
    database=adapter,
    auth=auth_provider,
    base_url="https://app.example.com",
    encryption_key="replace-me",
    integrations={
        "github": {
            "client_id": "replace-me",
            "client_secret": "replace-me",
        }
    },
)

plug.providers.register(github_provider)
```

## What is still incomplete

- production claims stay matrix-bounded even when `npm run gate:plugfn-release` is green
- adjacent or vertical providers outside the core set remain experimental, vertical-only, or unsupported according to the matrix

## Core provider set

The declared core Python provider set is now:

- `github`
- `linear`
- `clickup`
- `gmail`

Providers left outside the default production-ready claim include:

- `slack` as adjacent experimental scope
- TypeScript-only adjacent providers such as `discord` and `stripe`
- TypeScript-only inbound mail connectors such as `outlook`, `yahoo`, `icloud`, and `imap-smtp`

Programmable inboxes and forwarding ingress belong to MailFn. Outbound email delivery belongs to SendFn.

## Development

```bash
pip install -e ".[dev]"
python3 -m pytest -q plugfn/python/tests
```
