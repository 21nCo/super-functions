"""Schema helpers for the Python billfn SDK."""

from __future__ import annotations

from typing import Any, Dict, List

from superfunctions.db import TableSchema

BILLFN_SCHEMA_VERSION = 1


def get_schema() -> Dict[str, Any]:
    billing_accounts: TableSchema = {
        "modelName": "billingAccounts",
        "fields": {
            "id": {"type": "string", "required": True},
            "ownerType": {"type": "string", "required": True},
            "ownerId": {"type": "string", "required": True},
            "currency": {"type": "string", "required": False},
            "region": {"type": "string", "required": False},
            "metadata": {"type": "json", "required": False},
            "createdAt": {"type": "string", "required": True},
            "updatedAt": {"type": "string", "required": True},
        },
    }

    subscriptions: TableSchema = {
        "modelName": "subscriptions",
        "fields": {
            "id": {"type": "string", "required": True},
            "billingAccountId": {"type": "string", "required": True},
            "planKey": {"type": "string", "required": True},
            "priceId": {"type": "string", "required": True},
            "provider": {"type": "string", "required": True},
            "providerSubscriptionId": {"type": "string", "required": False},
            "providerCheckoutId": {"type": "string", "required": False},
            "providerChargeId": {"type": "string", "required": False},
            "status": {"type": "string", "required": True},
            "currentPeriodStart": {"type": "string", "required": False},
            "currentPeriodEnd": {"type": "string", "required": False},
            "cancelAt": {"type": "string", "required": False},
            "canceledAt": {"type": "string", "required": False},
            "trialEnd": {"type": "string", "required": False},
            "autoRenew": {"type": "boolean", "required": True},
            "metadata": {"type": "json", "required": False},
            "createdAt": {"type": "string", "required": True},
            "updatedAt": {"type": "string", "required": True},
        },
        "indexes": [
            {"name": "subscriptions_billing_account_updated_idx", "fields": ["billingAccountId", "updatedAt"]},
            {"name": "subscriptions_provider_subscription_idx", "fields": ["provider", "providerSubscriptionId"]},
            {"name": "subscriptions_provider_charge_idx", "fields": ["provider", "providerChargeId"]},
        ],
    }

    checkout_sessions: TableSchema = {
        "modelName": "checkoutSessions",
        "fields": {
            "checkoutSessionId": {"type": "string", "required": True},
            "billingAccountId": {"type": "string", "required": True},
            "planKey": {"type": "string", "required": True},
            "priceId": {"type": "string", "required": True},
            "provider": {"type": "string", "required": True},
            "providerCheckoutId": {"type": "string", "required": False},
            "providerSubscriptionId": {"type": "string", "required": False},
            "providerChargeId": {"type": "string", "required": False},
            "status": {"type": "string", "required": True},
            "checkoutUrl": {"type": "string", "required": False},
            "clientAction": {"type": "json", "required": False},
            "metadata": {"type": "json", "required": False},
            "createdAt": {"type": "string", "required": True},
            "updatedAt": {"type": "string", "required": True},
        },
        "indexes": [
            {"name": "checkout_sessions_billing_account_idx", "fields": ["billingAccountId", "updatedAt"]},
            {"name": "checkout_sessions_provider_checkout_idx", "fields": ["provider", "providerCheckoutId"]},
            {"name": "checkout_sessions_provider_subscription_idx", "fields": ["provider", "providerSubscriptionId"]},
            {"name": "checkout_sessions_provider_charge_idx", "fields": ["provider", "providerChargeId"]},
        ],
    }

    entitlement_snapshots: TableSchema = {
        "modelName": "entitlementSnapshots",
        "fields": {
            "id": {"type": "string", "required": True},
            "billingAccountId": {"type": "string", "required": True},
            "planKey": {"type": "string", "required": True},
            "status": {"type": "string", "required": True},
            "features": {"type": "json", "required": True},
            "limits": {"type": "json", "required": True},
            "effectiveAt": {"type": "string", "required": True},
            "expiresAt": {"type": "string", "required": False},
            "sourceEventId": {"type": "string", "required": False},
            "createdAt": {"type": "string", "required": True},
            "updatedAt": {"type": "string", "required": True},
        },
        "indexes": [
            {"name": "entitlements_billing_account_idx", "fields": ["billingAccountId"], "unique": True},
        ],
    }

    usage_meters: TableSchema = {
        "modelName": "usageMeters",
        "fields": {
            "id": {"type": "string", "required": True},
            "billingAccountId": {"type": "string", "required": True},
            "resource": {"type": "string", "required": True},
            "current": {"type": "number", "required": True},
            "updatedAt": {"type": "string", "required": True},
        },
        "indexes": [
            {"name": "usage_meters_billing_account_resource_idx", "fields": ["billingAccountId", "resource"], "unique": True},
        ],
    }

    usage_ledger: TableSchema = {
        "modelName": "usageLedger",
        "fields": {
            "id": {"type": "string", "required": True},
            "billingAccountId": {"type": "string", "required": True},
            "resource": {"type": "string", "required": True},
            "amount": {"type": "number", "required": True},
            "createdAt": {"type": "string", "required": True},
        },
    }

    webhook_receipts: TableSchema = {
        "modelName": "webhookReceipts",
        "fields": {
            "id": {"type": "string", "required": True},
            "provider": {"type": "string", "required": True},
            "providerEventId": {"type": "string", "required": True},
            "eventType": {"type": "string", "required": True},
            "signatureVerified": {"type": "boolean", "required": True},
            "rawPayload": {"type": "json", "required": True},
            "createdAt": {"type": "string", "required": True},
            "processedAt": {"type": "string", "required": False},
        },
        "indexes": [
            {"name": "webhook_receipts_provider_event_idx", "fields": ["provider", "providerEventId"], "unique": True},
        ],
    }

    billing_events: TableSchema = {
        "modelName": "billingEvents",
        "fields": {
            "id": {"type": "string", "required": True},
            "billingAccountId": {"type": "string", "required": True},
            "type": {"type": "string", "required": True},
            "payload": {"type": "json", "required": True},
            "createdAt": {"type": "string", "required": True},
        },
    }

    schemas: List[TableSchema] = [
        billing_accounts,
        subscriptions,
        checkout_sessions,
        entitlement_snapshots,
        usage_meters,
        usage_ledger,
        webhook_receipts,
        billing_events,
    ]

    return {"version": BILLFN_SCHEMA_VERSION, "schemas": schemas}
