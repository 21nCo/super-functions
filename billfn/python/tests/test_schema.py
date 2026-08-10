from billfn import BILLFN_SCHEMA_VERSION, get_schema


def test_schema_exposes_expected_version_and_tables() -> None:
    schema = get_schema()

    assert schema["version"] == BILLFN_SCHEMA_VERSION
    model_names = [table["modelName"] for table in schema["schemas"]]
    assert model_names == [
        "billingAccounts",
        "subscriptions",
        "checkoutSessions",
        "entitlementSnapshots",
        "usageMeters",
        "usageLedger",
        "webhookReceipts",
        "billingEvents",
        "refunds",
        "subscriptionChangeRequests",
        "reconciliationJobs",
        "reconciliationCursors",
    ]


def test_schema_includes_webhook_and_usage_uniqueness_indexes() -> None:
    schema = get_schema()
    tables = {table["modelName"]: table for table in schema["schemas"]}

    usage_indexes = tables["usageMeters"]["indexes"]
    webhook_indexes = tables["webhookReceipts"]["indexes"]

    assert any(index["unique"] and index["fields"] == ["billingAccountId", "resource"] for index in usage_indexes)
    assert any(index["unique"] and index["fields"] == ["provider", "providerEventId"] for index in webhook_indexes)


def test_schema_includes_lifecycle_and_reconciliation_indexes() -> None:
    schema = get_schema()
    tables = {table["modelName"]: table for table in schema["schemas"]}

    assert any(
        index.get("unique") and index["fields"] == ["provider", "providerRefundId"]
        for index in tables["refunds"]["indexes"]
    )
    assert any(
        index.get("unique") and index["fields"] == ["provider", "cursorKey"]
        for index in tables["reconciliationCursors"]["indexes"]
    )
    assert any(
        index["fields"] == ["kind", "status", "updatedAt"]
        for index in tables["reconciliationJobs"]["indexes"]
    )
