"""Runnable local example using httpx.MockTransport instead of a live server."""

from __future__ import annotations

import json

import httpx

from billfn import BillableSubject, BillFnCheckoutCreateRequest, BillFnClient


def handler(request: httpx.Request) -> httpx.Response:
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

    if request.url.path.endswith("/checkouts") and request.method == "POST":
        body = json.loads(request.content.decode("utf-8"))
        return httpx.Response(
            201,
            json={
                "ok": True,
                "data": {
                    "checkoutSession": {
                        "checkoutSessionId": "chk_mock_123",
                        "billingAccountId": "ba_user_user_123",
                        "planKey": body["planKey"],
                        "priceId": "price_pro_dodo_month",
                        "provider": body["provider"],
                        "status": "requires_action",
                        "checkoutUrl": "https://checkout.example.test/mock",
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
                        "planKey": body["planKey"],
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
                "message": "Mock route not found",
                "status": 404,
                "retryable": False,
            },
            "meta": {"timestamp": "2026-04-20T00:00:00.000Z"},
        },
    )


def main() -> None:
    transport = httpx.MockTransport(handler)
    http_client = httpx.Client(transport=transport)
    client = BillFnClient(base_url="https://billfn.example.test/billfn", client=http_client)

    catalog = client.get_catalog().unwrap()
    print("plans:", [plan.plan_key for plan in catalog.plans])

    checkout = client.create_checkout(
        BillFnCheckoutCreateRequest(
            subject=BillableSubject(principal_id="user_123"),
            plan_key="pro",
            provider="dodo",
            interval="month",
        )
    ).unwrap()

    print("checkout session:", checkout.checkout_session.checkout_session_id)
    print("checkout url:", checkout.checkout_session.checkout_url)


if __name__ == "__main__":
    main()
