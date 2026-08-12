# billfn Python SDK

The Python `billfn` package is the typed HTTP client and schema helper surface for the `billfn` billing system.

It mirrors the stable route contracts from the TypeScript implementation and is intended for backend jobs, admin tooling, and service-to-service integrations.

Use Python `3.10+` for local development and packaging.

## Features

- sync and async HTTP clients
- typed billing request and response models
- canonical envelope parsing
- typed API and transport errors
- schema helper parity with the TypeScript package

## Installation

When you publish or consume the packaged SDK from an index:

```bash
pip install billfn
```

For local development in this monorepo:

```bash
cd billfn/python
python3.10 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -e ../../packages/python-core
pip install -e ".[dev]"
```

## Quick Start

```python
from billfn import BillFnClient, BillFnCheckoutCreateRequest, BillableSubject

client = BillFnClient(base_url="https://api.example.com/billfn")

response = client.create_checkout(
    BillFnCheckoutCreateRequest(
        subject=BillableSubject(principal_id="user_123"),
        plan_key="pro",
        provider="dodo",
        interval="month",
    )
)

checkout = response.unwrap()
print(checkout.checkout_session.checkout_url)

client.close()
```

## Main Exports

- `BillFnClient`
- `AsyncBillFnClient`
- `BillableSubject`
- `BillFnCheckoutCreateRequest`
- `BillFnCheckoutVerifyRequest`
- `BillFnCancelSubscriptionRequest`
- `BillFnSyncSubscriptionRequest`
- `BillFnRestorePurchasesRequest`
- `BillFnEnvelope`
- `BillFnApiError`
- `BillFnTransportError`
- `get_schema`

## Route Surface

- `get_catalog()`
- `get_entitlements()`
- `get_usage()`
- `create_checkout()`
- `verify_checkout()`
- `cancel_subscription()`
- `sync_subscription()`
- `restore_purchases()`

## Examples

- `python examples/basic_usage.py`
- `python examples/mock_transport.py`
