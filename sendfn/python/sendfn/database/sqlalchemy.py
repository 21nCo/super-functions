"""SQLAlchemy schema provisioning for SendFn's Python database adapter."""

from __future__ import annotations

from typing import Any


def build_sqlalchemy_metadata(namespace_prefix: str = "") -> Any:
    """Build SQLAlchemy metadata for every table used by the Python SDK."""
    try:
        from sqlalchemy import (
            JSON,
            Boolean,
            Column,
            DateTime,
            Index,
            Integer,
            MetaData,
            String,
            Table,
            Text,
        )
    except ImportError as exc:  # pragma: no cover - optional database extra
        raise RuntimeError("Install sendfn[database] to provision the SQLAlchemy schema") from exc

    metadata = MetaData()

    def name(value: str) -> str:
        return f"{namespace_prefix}_{value}" if namespace_prefix else value

    email_transactions = Table(
        name("email_transactions"), metadata,
        Column("id", String(36), primary_key=True),
        Column("userId", String(255), nullable=False),
        Column("to", String(320), nullable=False),
        Column("from", String(320), nullable=False),
        Column("subject", Text, nullable=False),
        Column("templateId", String(255)),
        Column("templateData", JSON),
        Column("provider", String(100), nullable=False),
        Column("providerMessageId", String(255)),
        Column("status", String(32), nullable=False),
        Column("sentAt", DateTime(timezone=True)),
        Column("deliveredAt", DateTime(timezone=True)),
        Column("bouncedAt", DateTime(timezone=True)),
        Column("complainedAt", DateTime(timezone=True)),
        Column("metadata", JSON, nullable=False),
        Column("createdAt", DateTime(timezone=True), nullable=False),
        Column("updatedAt", DateTime(timezone=True), nullable=False),
    )
    Index(name("email_transactions_provider_message"), email_transactions.c.providerMessageId)

    Table(
        name("sms_transactions"), metadata,
        Column("id", String(36), primary_key=True),
        Column("userId", String(255), nullable=False),
        Column("to", String(64), nullable=False),
        Column("message", Text, nullable=False),
        Column("provider", String(100), nullable=False),
        Column("providerMessageId", String(255)),
        Column("status", String(32), nullable=False),
        Column("sentAt", DateTime(timezone=True)),
        Column("metadata", JSON, nullable=False),
        Column("createdAt", DateTime(timezone=True), nullable=False),
        Column("updatedAt", DateTime(timezone=True), nullable=False),
    )

    Table(
        name("push_notifications"), metadata,
        Column("id", String(36), primary_key=True),
        Column("userId", String(255), nullable=False),
        Column("title", Text, nullable=False),
        Column("body", Text, nullable=False),
        Column("data", JSON),
        Column("deviceTokens", JSON, nullable=False),
        Column("platform", String(16), nullable=False),
        Column("provider", String(100), nullable=False),
        Column("status", String(32), nullable=False),
        Column("sentCount", Integer, nullable=False),
        Column("failedCount", Integer, nullable=False),
        Column("sentAt", DateTime(timezone=True)),
        Column("metadata", JSON, nullable=False),
        Column("createdAt", DateTime(timezone=True), nullable=False),
        Column("updatedAt", DateTime(timezone=True), nullable=False),
    )

    device_tokens = Table(
        name("device_tokens"), metadata,
        Column("id", String(36), primary_key=True),
        Column("userId", String(255), nullable=False),
        Column("token", Text, nullable=False),
        Column("platform", String(16), nullable=False),
        Column("appVersion", String(100)),
        Column("deviceInfo", JSON),
        Column("isActive", Boolean, nullable=False),
        Column("lastUsedAt", DateTime(timezone=True), nullable=False),
        Column("createdAt", DateTime(timezone=True), nullable=False),
        Column("updatedAt", DateTime(timezone=True), nullable=False),
    )
    Index(name("device_tokens_user_platform"), device_tokens.c.userId, device_tokens.c.platform)

    Table(
        name("suppression_list"), metadata,
        Column("id", String(36), primary_key=True),
        Column("email", String(320), nullable=False, unique=True),
        Column("reason", String(32), nullable=False),
        Column("source", String(100), nullable=False),
        Column("bounceType", String(100)),
        Column("metadata", JSON, nullable=False),
        Column("suppressedAt", DateTime(timezone=True), nullable=False),
        Column("createdAt", DateTime(timezone=True), nullable=False),
    )

    communication_events = Table(
        name("communication_events"), metadata,
        Column("id", String(36), primary_key=True),
        Column("referenceId", String(255), nullable=False),
        Column("referenceType", String(32), nullable=False),
        Column("eventType", String(32), nullable=False),
        Column("provider", String(100), nullable=False),
        Column("providerEventId", String(255)),
        Column("recipientEmail", String(320)),
        Column("recipientPhone", String(64)),
        Column("deviceToken", Text),
        Column("metadata", JSON, nullable=False),
        Column("eventTimestamp", DateTime(timezone=True), nullable=False),
        Column("createdAt", DateTime(timezone=True), nullable=False),
    )
    Index(
        name("communication_events_reference"),
        communication_events.c.referenceType,
        communication_events.c.referenceId,
        communication_events.c.eventTimestamp,
    )
    return metadata


def create_sqlalchemy_schema(engine: Any, namespace_prefix: str = "") -> None:
    """Create the SendFn tables for a new SQLAlchemy-backed installation."""
    build_sqlalchemy_metadata(namespace_prefix).create_all(engine)


__all__ = ["build_sqlalchemy_metadata", "create_sqlalchemy_schema"]
