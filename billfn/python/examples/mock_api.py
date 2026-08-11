"""Shared mock BillFn HTTP API used by the runnable examples and client tests."""

from __future__ import annotations

import json
from collections.abc import Callable

import httpx


def create_mock_handler(
    *,
    checkout_session_id: str = "chk_123",
    checkout_url: str = "https://checkout.example.test",
) -> Callable[[httpx.Request], httpx.Response]:
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
                            "checkoutSessionId": checkout_session_id,
                            "billingAccountId": "ba_user_user_123",
                            "planKey": body["planKey"],
                            "priceId": "price_pro_dodo_month",
                            "provider": body["provider"],
                            "status": "requires_action",
                            "checkoutUrl": checkout_url,
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

    return handler
