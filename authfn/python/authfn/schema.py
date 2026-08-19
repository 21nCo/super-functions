"""Schema definition for authfn database tables."""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional

from .types import AuthFnConfig, AuthFnPlugin, AuthFnSchemaConflictError, TableSchema

SchemaDefinition = Dict[str, Any]

AUTHFN_SCHEMA_VERSION = 1


def get_schema(config: Optional[AuthFnConfig | Dict[str, Any]] = None) -> SchemaDefinition:
    """Compose core and plugin schemas deterministically."""

    resolved = _coerce_config(config)
    tables = [*_core_tables(), *_plugin_tables(resolved.plugins, resolved)]
    normalized = [_normalize_table(table) for table in tables]
    _assert_no_conflicts(normalized)

    return {"version": AUTHFN_SCHEMA_VERSION, "schemas": normalized}


def _coerce_config(config: Optional[AuthFnConfig | Dict[str, Any]]) -> AuthFnConfig:
    if isinstance(config, AuthFnConfig):
        return config
    return AuthFnConfig.model_validate(config or {"database": object(), "plugins": []})


def _core_tables() -> List[TableSchema]:
    return [
        {
            "modelName": "users",
            "fields": {
                "id": {"type": "string", "required": True, "fieldName": "id"},
                "primaryEmail": {
                    "type": "string",
                    "required": False,
                    "fieldName": "primary_email",
                },
                "emailVerifiedAt": {
                    "type": "date",
                    "required": False,
                    "fieldName": "email_verified_at",
                },
                "metadata": {
                    "type": "json",
                    "required": False,
                    "fieldName": "metadata",
                },
                "createdAt": {"type": "date", "required": True, "fieldName": "created_at"},
                "updatedAt": {"type": "date", "required": True, "fieldName": "updated_at"},
            },
            "indexes": [
                {
                    "name": "idx_authfn_users_primary_email",
                    "fields": ["primaryEmail"],
                    "unique": True,
                }
            ],
        },
        {
            "modelName": "sessions",
            "fields": {
                "id": {"type": "string", "required": True, "fieldName": "id"},
                "userId": {"type": "string", "required": True, "fieldName": "user_id"},
                "tokenHash": {
                    "type": "string",
                    "required": True,
                    "fieldName": "token_hash",
                },
                "csrfHash": {
                    "type": "string",
                    "required": False,
                    "fieldName": "csrf_hash",
                },
                "methods": {
                    "type": "json",
                    "required": True,
                    "fieldName": "methods",
                },
                "metadata": {
                    "type": "json",
                    "required": False,
                    "fieldName": "metadata",
                },
                "expiresAt": {
                    "type": "date",
                    "required": True,
                    "fieldName": "expires_at",
                },
                "revokedAt": {
                    "type": "date",
                    "required": False,
                    "fieldName": "revoked_at",
                },
                "createdAt": {"type": "date", "required": True, "fieldName": "created_at"},
                "updatedAt": {"type": "date", "required": True, "fieldName": "updated_at"},
                "lastAuthenticatedAt": {
                    "type": "date",
                    "required": False,
                    "fieldName": "last_authenticated_at",
                },
            },
            "indexes": [
                {
                    "name": "idx_authfn_sessions_expires_at",
                    "fields": ["expiresAt"],
                },
                {
                    "name": "idx_authfn_sessions_token_hash",
                    "fields": ["tokenHash"],
                    "unique": True,
                },
                {
                    "name": "idx_authfn_sessions_user_id_created_at",
                    "fields": ["userId", "createdAt"],
                },
            ],
        },
    ]


def _plugin_tables(plugins: Iterable[AuthFnPlugin], config: AuthFnConfig) -> List[TableSchema]:
    tables: List[TableSchema] = []
    for plugin in plugins:
        tables.extend(plugin.schema(config))
    return tables


def _normalize_table(table: TableSchema) -> TableSchema:
    return {
        **table,
        "fields": dict(sorted(table["fields"].items(), key=lambda item: item[0])),
        "indexes": sorted(table.get("indexes", []), key=lambda index: index["name"]),
    }


def _assert_no_conflicts(tables: List[TableSchema]) -> None:
    seen_tables: set[str] = set()
    for table in tables:
        model_name = table["modelName"]
        if model_name in seen_tables:
            raise AuthFnSchemaConflictError(f"duplicate authfn table schema: {model_name}")
        seen_tables.add(model_name)

        seen_columns: set[str] = set()
        for field_name, field in table["fields"].items():
            column_name = field.get("fieldName", field_name)
            if column_name in seen_columns:
                raise AuthFnSchemaConflictError(
                    f"duplicate authfn column mapping: {model_name}.{column_name}"
                )
            seen_columns.add(column_name)
