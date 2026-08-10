from __future__ import annotations

import httpx
import pytest

from billfn import (
    AsyncBillFnClient,
    BillableSubject,
    BillFnApiError,
    BillFnCheckoutCreateRequest,
    BillFnClient,
)


def _handler(request: httpx.Request) -> httpx.Response:
    if request.url.path.endswith("/catalog"):
        return httpx.Response(
            200,
            json={
                "ok": True,
                "data": {
                    "plans": [
                        {
                            "productKey": "nucleus",
                            "planKey": "pro",
                            "displayName": "Pro",
                            "features": {"sync": True},
                            "limits": {"storage": 1000},
                            "prices": [
                                {
                                    "priceId": "price_pro_dodo_month",
                                    "provider": "dodo",
                                    "providerProductId": "pdt_pro_month",
                                    "currency": "USD",
                                    "amount": 12,
                                    "kind": "subscription",
                                    "interval": "month",
                                }
                            ],
                        }
                    ]
                },
                "meta": {"timestamp": "2026-04-20T00:00:00.000Z"},
            },
        )

    if request.url.path.endswith("/entitlements"):
        assert request.url.params.get("principalId") == "user_123"
        return httpx.Response(
            200,
            json={
                "ok": True,
                "data": {
                    "billingAccount": {
                        "id": "ba_user_user_123",
                        "ownerType": "user",
                        "ownerId": "user_123",
                        "createdAt": "2026-04-20T00:00:00.000Z",
                        "updatedAt": "2026-04-20T00:00:00.000Z",
                    },
                    "entitlements": {
                        "id": "ent_ba_user_user_123",
                        "billingAccountId": "ba_user_user_123",
                        "planKey": "pro",
                        "status": "active",
                        "features": {"sync": True},
                        "limits": {"storage": 1000},
                        "effectiveAt": "2026-04-20T00:00:00.000Z",
                        "createdAt": "2026-04-20T00:00:00.000Z",
                        "updatedAt": "2026-04-20T00:00:00.000Z",
                    },
                    "subscription": None,
                },
                "meta": {"timestamp": "2026-04-20T00:00:00.000Z"},
            },
        )

    if request.url.path.endswith("/checkouts"):
        return httpx.Response(
            201,
            json={
                "ok": True,
                "data": {
                    "checkoutSession": {
                        "checkoutSessionId": "chk_123",
                        "billingAccountId": "ba_user_user_123",
                        "planKey": "pro",
                        "priceId": "price_pro_dodo_month",
                        "provider": "dodo",
                        "status": "requires_action",
                        "checkoutUrl": "https://checkout.example.test",
                        "createdAt": "2026-04-20T00:00:00.000Z",
                        "updatedAt": "2026-04-20T00:00:00.000Z",
                    },
                    "billingAccount": {
                        "id": "ba_user_user_123",
                        "ownerType": "user",
                        "ownerId": "user_123",
                        "createdAt": "2026-04-20T00:00:00.000Z",
                        "updatedAt": "2026-04-20T00:00:00.000Z",
                    },
                    "plan": {
                        "planKey": "pro",
                        "productKey": "nucleus",
                        "displayName": "Pro",
                    },
                },
                "meta": {"timestamp": "2026-04-20T00:00:00.000Z"},
            },
        )

    return httpx.Response(
        404,
        json={
            "ok": False,
            "error": {
                "code": "BILLFN_NOT_FOUND",
                "message": "not found",
                "status": 404,
                "retryable": False,
            },
            "meta": {"timestamp": "2026-04-20T00:00:00.000Z"},
        },
    )


def test_sync_client_parses_catalog_and_checkout() -> None:
    transport = httpx.MockTransport(_handler)
    http_client = httpx.Client(transport=transport)
    client = BillFnClient(base_url="https://billfn.example.test/billfn", client=http_client)

    catalog = client.get_catalog().unwrap()
    assert catalog.plans[0].plan_key == "pro"

    checkout = client.create_checkout(
        BillFnCheckoutCreateRequest(
            subject=BillableSubject(principal_id="user_123"),
            plan_key="pro",
            provider="dodo",
            interval="month",
        )
    ).unwrap()
    assert checkout.checkout_session.checkout_session_id == "chk_123"


def test_sync_client_default_base_url_is_absolute() -> None:
    seen_urls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen_urls.append(str(request.url))
        return _handler(request)

    http_client = httpx.Client(transport=httpx.MockTransport(handler))
    client = BillFnClient(client=http_client)

    client.get_catalog()

    assert seen_urls == ["http://localhost:3000/billfn/catalog"]


def test_sync_client_passes_subject_query_and_raises_api_errors() -> None:
    transport = httpx.MockTransport(_handler)
    http_client = httpx.Client(transport=transport)
    client = BillFnClient(base_url="https://billfn.example.test/billfn", client=http_client)

    entitlements = client.get_entitlements(BillableSubject(principal_id="user_123")).unwrap()
    assert entitlements.billing_account.id == "ba_user_user_123"

    with pytest.raises(BillFnApiError) as error:
        client.sync_subscription({"subject": {"principalId": "user_123"}}).unwrap()

    assert error.value.code == "BILLFN_NOT_FOUND"


@pytest.mark.asyncio
async def test_async_client_parses_catalog() -> None:
    transport = httpx.MockTransport(_handler)
    http_client = httpx.AsyncClient(transport=transport)
    client = AsyncBillFnClient(base_url="https://billfn.example.test/billfn", client=http_client)

    catalog = (await client.get_catalog()).unwrap()
    assert catalog.plans[0].plan_key == "pro"

    await client.aclose()


def test_sync_client_reports_invalid_success_envelope() -> None:
    transport = httpx.MockTransport(
        lambda _request: httpx.Response(
            200,
            json={
                "ok": True,
                "data": {
                    "plans": [
                        {
                            "productKey": "nucleus",
                            "planKey": 123,
                            "displayName": "Broken",
                            "features": {"sync": True},
                            "limits": {"storage": 1000},
                            "prices": [],
                        }
                    ]
                },
            },
        )
    )
    http_client = httpx.Client(transport=transport)
    client = BillFnClient(base_url="https://billfn.example.test/billfn", client=http_client)

    with pytest.raises(BillFnApiError) as error:
        client.get_catalog().unwrap()

    assert error.value.code == "BILLFN_INVALID_ENVELOPE"
