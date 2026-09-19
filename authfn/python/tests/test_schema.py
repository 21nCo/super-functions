"""Schema composition tests for authfn Python contracts."""

from __future__ import annotations

import os
import sys

TESTS_DIR = os.path.dirname(__file__)
AUTHFN_PYTHON_ROOT = os.path.abspath(os.path.join(TESTS_DIR, ".."))
PYTHON_CORE_ROOT = os.path.abspath(
    os.path.join(TESTS_DIR, "..", "..", "..", "packages", "python-core")
)

for path in (AUTHFN_PYTHON_ROOT, PYTHON_CORE_ROOT):
    if path not in sys.path:
        sys.path.insert(0, path)

from authfn import (
    AuthFnConfig,
    AuthFnPlugin,
    AuthFnSchemaConflictError,
    authfn_api_key_plugin,
    authfn_email_otp_plugin,
    authfn_multi_region_plugin,
    authfn_password_plugin,
    authfn_social_oauth_plugin,
    authfn_two_factor_plugin,
    get_schema,
)


def _config() -> AuthFnConfig:
    return AuthFnConfig(
        database=object(),
        namespace="authfn",
        plugins=[
            authfn_password_plugin(),
            authfn_email_otp_plugin(),
            authfn_social_oauth_plugin(),
            authfn_api_key_plugin(),
            authfn_two_factor_plugin(),
            authfn_multi_region_plugin(),
        ],
    )


def test_schema_composition_is_deterministic() -> None:
    first = get_schema(_config())
    second = get_schema(_config())

    assert first["version"] == 2
    assert [table["modelName"] for table in first["schemas"]] == [
        "users",
        "sessions",
        "password_credentials",
        "otp_challenges",
        "oauth_states",
        "oauth_tokens",
        "oauth_accounts",
        "api_keys",
        "two_factor_enrollments",
        "two_factor_recovery_codes",
        "two_factor_challenges",
        "region_profiles",
    ]
    assert first == second

    bounded_keys = {
        "users": ["primaryEmail"],
        "sessions": ["id", "tokenHash"],
        "password_credentials": ["id"],
        "otp_challenges": ["id", "purpose", "email"],
        "oauth_states": ["state_id", "expires_at"],
        "oauth_tokens": ["token_id"],
        "oauth_accounts": ["id", "provider", "providerAccountId"],
        "api_keys": ["id", "secretHash"],
        "two_factor_enrollments": ["id"],
        "two_factor_recovery_codes": ["id", "enrollmentId", "codeHash"],
        "two_factor_challenges": ["id"],
        "region_profiles": ["id", "regionId"],
    }
    tables = {table["modelName"]: table for table in first["schemas"]}
    for table_name, fields in bounded_keys.items():
        for field_name in fields:
            assert tables[table_name]["fields"][field_name]["maxLength"] == 255
    for table_name in (
        "users",
        "sessions",
        "password_credentials",
        "oauth_accounts",
        "api_keys",
        "two_factor_enrollments",
        "two_factor_challenges",
        "region_profiles",
    ):
        field_name = "id" if table_name == "users" else "userId"
        assert tables[table_name]["fields"][field_name]["maxLength"] == 767
    assert tables["oauth_tokens"]["fields"]["connection_id"]["maxLength"] == 768
    assert "maxLength" not in tables["oauth_accounts"]["fields"]["connectionId"]

    # These are payload columns, not indexed database keys. Keep them as unbounded
    # text so existing tenant/user/subject identifiers are not narrowed by migration.
    for table_name, field_name in (
        ("oauth_states", "subject_key"),
        ("oauth_tokens", "tenant_id"),
        ("oauth_tokens", "user_id"),
    ):
        assert "maxLength" not in tables[table_name]["fields"][field_name]


def test_schema_conflict_on_duplicate_table_name() -> None:
    duplicate_plugin = AuthFnPlugin(
        name="duplicate",
        schema_factory=lambda _config: [
            {
                "modelName": "users",
                "fields": {
                    "id": {"type": "string", "required": True, "fieldName": "id"}
                },
                "indexes": [],
            }
        ],
    )

    config = _config()
    config.plugins = [duplicate_plugin]

    try:
        get_schema(config)
    except AuthFnSchemaConflictError as error:
        assert getattr(error, "code", None) == "AUTHFN_CONFLICT"
    else:
        raise AssertionError("expected AuthFnSchemaConflictError")


def test_schema_conflict_on_duplicate_column_mapping() -> None:
    conflict_plugin = AuthFnPlugin(
        name="conflict",
        schema_factory=lambda _config: [
            {
                "modelName": "conflicting_table",
                "fields": {
                    "firstField": {
                        "type": "string",
                        "required": True,
                        "fieldName": "shared",
                    },
                    "secondField": {
                        "type": "string",
                        "required": True,
                        "fieldName": "shared",
                    },
                },
                "indexes": [],
            }
        ],
    )

    config = _config()
    config.plugins = [conflict_plugin]

    try:
        get_schema(config)
    except AuthFnSchemaConflictError as error:
        assert getattr(error, "code", None) == "AUTHFN_CONFLICT"
    else:
        raise AssertionError("expected AuthFnSchemaConflictError")
