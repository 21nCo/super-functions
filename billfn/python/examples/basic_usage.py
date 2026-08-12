"""Minimal remote-usage example for the Python billfn SDK."""

from __future__ import annotations

import os

import httpx
from mock_api import create_mock_handler

from billfn import BillableSubject, BillFnCheckoutCreateRequest, BillFnClient

_handler = create_mock_handler(
    checkout_session_id="chk_basic_123",
    checkout_url="https://checkout.example.test/basic",
)


def run(client: BillFnClient, mode: str) -> None:
    print("mode:", mode)
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


def main() -> None:
    base_url = os.environ.get("BILLFN_BASE_URL")
    if base_url:
        with BillFnClient(base_url=base_url) as client:
            run(client, "live")
        return

    with httpx.Client(transport=httpx.MockTransport(_handler)) as http_client:
        with BillFnClient(
            base_url="https://billfn.example.test/billfn",
            client=http_client,
        ) as client:
            run(client, "mock")


if __name__ == "__main__":
    main()
