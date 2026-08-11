"""Runnable local example using httpx.MockTransport instead of a live server."""

from __future__ import annotations

import httpx
from mock_api import create_mock_handler

from billfn import BillableSubject, BillFnCheckoutCreateRequest, BillFnClient

handler = create_mock_handler(
    checkout_session_id="chk_mock_123",
    checkout_url="https://checkout.example.test/mock",
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
