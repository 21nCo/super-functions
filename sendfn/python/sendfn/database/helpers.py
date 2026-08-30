"""Database helper functions for sendfn operations.

This module provides convenience functions that wrap superfunctions.db calls
with sendfn-specific logic.
"""

import json
from datetime import datetime
from typing import Any, Optional, cast
from uuid import UUID, uuid4, uuid5

from superfunctions.db import (
    Adapter,
    CreateParams,
    DeleteParams,
    Direction,
    FindManyParams,
    FindOneParams,
    Operator,
    OrderBy,
    UpdateParams,
    WhereClause,
)

from ..errors import ValidationError
from ..models import (
    CommunicationEvent,
    DeviceToken,
    EmailTransaction,
    Platform,
    PushNotification,
    SmsTransaction,
    SuppressionList,
)

DEFAULT_EVENT_QUERY_LIMIT = 50
MAX_EVENT_QUERY_LIMIT = 200
EVENT_IDEMPOTENCY_NAMESPACE = UUID("bfbc0bcb-8cf7-4d9a-8cc5-7d4196909d50")


def normalize_suppression_email(email: str) -> str:
    """Normalize suppression email keys."""
    return email.strip().lower()


def _resolve_event_limit(limit: Optional[int]) -> int:
    if limit is None:
        return DEFAULT_EVENT_QUERY_LIMIT
    if limit < 0:
        raise ValidationError("`limit` must be a non-negative number")
    return min(limit, MAX_EVENT_QUERY_LIMIT)


def _resolve_offset(offset: Optional[int]) -> Optional[int]:
    if offset is None:
        return None
    if offset < 0:
        raise ValidationError("`offset` must be a non-negative number")
    return offset


def _validate_event_window(start_at: Optional[datetime], end_at: Optional[datetime]) -> None:
    if start_at and end_at and start_at >= end_at:
        raise ValidationError("`startAt` must be earlier than `endAt`")


# --- Email Transaction Helpers ---


async def create_email_transaction(db: Adapter, data: dict) -> EmailTransaction:
    """Create an email transaction."""
    result = await db.create(
        CreateParams(
            model="email_transactions",
            data={
                **data,
                "id": data.get("id", str(uuid4())),
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow(),
            },
        )
    )
    return EmailTransaction.model_validate(result)


async def update_email_transaction(db: Adapter, id: str, data: dict) -> EmailTransaction:
    """Update an email transaction."""
    result = await db.update(
        UpdateParams(
            model="email_transactions",
            where=[WhereClause(field="id", operator=Operator.EQ, value=id)],
            data={**data, "updatedAt": datetime.utcnow()},
        )
    )
    return EmailTransaction.model_validate(result)


async def get_email_transaction(db: Adapter, id: str) -> Optional[EmailTransaction]:
    """Get an email transaction by ID."""
    result = await db.find_one(
        FindOneParams(
            model="email_transactions",
            where=[WhereClause(field="id", operator=Operator.EQ, value=id)],
        )
    )
    return EmailTransaction.model_validate(result) if result else None


async def get_email_transaction_by_provider_message_id(
    db: Adapter, provider_message_id: str
) -> Optional[EmailTransaction]:
    """Get an email transaction by provider message ID."""
    result = await db.find_one(
        FindOneParams(
            model="email_transactions",
            where=[
                WhereClause(
                    field="providerMessageId",
                    operator=Operator.EQ,
                    value=provider_message_id,
                )
            ],
        )
    )
    return EmailTransaction.model_validate(result) if result else None


async def _get_reference_record(
    db: Adapter, reference_id: str, reference_type: str
) -> Optional[dict[str, Any]]:
    """Get the underlying transaction or notification for an event."""
    model_by_reference_type = {
        "email": "email_transactions",
        "sms": "sms_transactions",
        "push": "push_notifications",
    }
    model = model_by_reference_type.get(reference_type)
    if model is None:
        return None

    return cast(
        Optional[dict[str, Any]],
        await db.find_one(
            FindOneParams(
                model=model,
                where=[WhereClause(field="id", operator=Operator.EQ, value=reference_id)],
            )
        ),
    )


# --- Event Helpers ---


async def record_event(db: Adapter, data: dict) -> CommunicationEvent:
    """Record a communication event."""
    provider_event_id = data.get("providerEventId")
    event_id = str(
        uuid5(
            EVENT_IDEMPOTENCY_NAMESPACE,
            json.dumps(
                [
                    data.get("referenceId"),
                    data.get("referenceType"),
                    data.get("eventType"),
                    data.get("provider"),
                    provider_event_id,
                    data.get("recipientEmail"),
                    data.get("recipientPhone"),
                    data.get("deviceToken"),
                ],
                separators=(",", ":"),
                ensure_ascii=False,
            ),
        )
        if provider_event_id
        else uuid4()
    )
    try:
        result = await db.create(
            CreateParams(
                model="communication_events",
                data={
                    **data,
                    "id": event_id,
                    "createdAt": datetime.utcnow(),
                },
            )
        )
    except Exception:
        if not provider_event_id:
            raise
        existing = await db.find_one(
            FindOneParams(
                model="communication_events",
                where=[WhereClause(field="id", operator=Operator.EQ, value=event_id)],
            )
        )
        if existing is None:
            raise
        result = existing
    return CommunicationEvent.model_validate(result)


async def get_events_by_reference(
    db: Adapter, reference_id: str, reference_type: str
) -> list[CommunicationEvent]:
    """Get events for a specific reference."""
    results = await db.find_many(
        FindManyParams(
            model="communication_events",
            where=[
                WhereClause(field="referenceId", operator=Operator.EQ, value=reference_id),
                WhereClause(field="referenceType", operator=Operator.EQ, value=reference_type),
            ],
            orderBy=[OrderBy(field="eventTimestamp", direction=Direction.ASC)],
        )
    )
    return [CommunicationEvent.model_validate(r) for r in results]


async def find_events(db: Adapter, params: dict) -> list[CommunicationEvent]:
    """Find communication events matching criteria."""
    start_at = params.get("start_at")
    end_at = params.get("end_at")
    _validate_event_window(start_at, end_at)
    limit = _resolve_event_limit(params.get("limit"))
    offset = _resolve_offset(params.get("offset")) or 0
    requires_reference_filtering = bool(
        params.get("provider_message_id") or params.get("user_id")
    )

    where = []
    if params.get("reference_id"):
        where.append(WhereClause(field="referenceId", operator=Operator.EQ, value=params["reference_id"]))
    if params.get("reference_type"):
        where.append(WhereClause(field="referenceType", operator=Operator.EQ, value=params["reference_type"]))
    if params.get("event_type"):
        where.append(WhereClause(field="eventType", operator=Operator.EQ, value=params["event_type"]))
    if params.get("provider"):
        where.append(WhereClause(field="provider", operator=Operator.EQ, value=params["provider"]))
    if start_at:
        where.append(WhereClause(field="eventTimestamp", operator=Operator.GTE, value=start_at))
    if end_at:
        where.append(WhereClause(field="eventTimestamp", operator=Operator.LT, value=end_at))
    if params.get("provider_message_id") and params.get("reference_type") == "push":
        return []

    results = await db.find_many(
        FindManyParams(
            model="communication_events",
            where=where if where else None,
            limit=None if requires_reference_filtering else limit,
            offset=None if requires_reference_filtering else offset,
            orderBy=[OrderBy(field="eventTimestamp", direction=Direction.ASC)],
        )
    )

    provider_message_id = params.get("provider_message_id")
    user_id = params.get("user_id")
    if not requires_reference_filtering:
        return [CommunicationEvent.model_validate(r) for r in results]

    reference_cache: dict[tuple[str, str], Optional[dict[str, Any]]] = {}
    filtered_results: list[dict[str, Any]] = []

    for result in results:
        reference_key = (result["referenceType"], result["referenceId"])
        if reference_key not in reference_cache:
            reference_cache[reference_key] = await _get_reference_record(
                db, result["referenceId"], result["referenceType"]
            )

        reference = reference_cache[reference_key]
        if not reference:
            continue

        if provider_message_id and reference.get("providerMessageId") != provider_message_id:
            continue

        if user_id and reference.get("userId") != user_id:
            continue

        filtered_results.append(result)

    paginated_results = filtered_results[offset : offset + limit]
    return [CommunicationEvent.model_validate(r) for r in paginated_results]


# --- Suppression List Helpers ---


async def is_email_suppressed(db: Adapter, email: str) -> bool:
    """Check if an email is suppressed."""
    entry = await get_suppression_list_entry(db, email)
    return entry is not None


async def get_suppression_list_entry(db: Adapter, email: str) -> Optional[SuppressionList]:
    """Get a suppression list entry by email."""
    result = await db.find_one(
        FindOneParams(
            model="suppression_list",
            where=[
                WhereClause(
                    field="email",
                    operator=Operator.EQ,
                    value=normalize_suppression_email(email),
                )
            ],
        )
    )
    return SuppressionList.model_validate(result) if result else None


async def add_to_suppression_list(db: Adapter, data: dict) -> SuppressionList:
    """Add an email to the suppression list."""
    normalized_email = normalize_suppression_email(data["email"])
    # Check if already exists
    existing = await get_suppression_list_entry(db, normalized_email)
    if existing:
        return existing

    result = await db.create(
        CreateParams(
            model="suppression_list",
            data={
                **data,
                "email": normalized_email,
                "id": str(uuid4()),
                "createdAt": datetime.utcnow(),
            },
        )
    )
    return SuppressionList.model_validate(result)


async def remove_from_suppression_list(db: Adapter, email: str) -> None:
    """Remove an email from the suppression list."""
    entry = await get_suppression_list_entry(db, email)
    if entry:
        await db.delete(
            DeleteParams(
                model="suppression_list",
                where=[WhereClause(field="id", operator=Operator.EQ, value=str(entry.id))],
            )
        )


async def find_suppression_list(db: Adapter, params: dict) -> list[SuppressionList]:
    """Find suppression list entries matching criteria."""
    where = []
    if params.get("reason"):
        where.append(WhereClause(field="reason", operator=Operator.EQ, value=params["reason"]))

    results = await db.find_many(
        FindManyParams(
            model="suppression_list",
            where=where if where else None,
            limit=params.get("limit"),
            offset=params.get("offset"),
            orderBy=[OrderBy(field="email", direction=Direction.ASC)],
        )
    )
    return [SuppressionList.model_validate(r) for r in results]


# --- Device Token Helpers ---


async def create_device_token(db: Adapter, **data: Any) -> DeviceToken:
    """Create a device token."""
    result = await db.create(
        CreateParams(
            model="device_tokens",
            data={
                **data,
                "id": str(data.get("id", uuid4())),
            },
        )
    )
    return DeviceToken.model_validate(result)


async def update_device_token(db: Adapter, device_id: str, **data: Any) -> DeviceToken:
    """Update a device token."""
    result = await db.update(
        UpdateParams(
            model="device_tokens",
            where=[WhereClause(field="id", operator=Operator.EQ, value=str(device_id))],
            data={**data, "updatedAt": datetime.utcnow()},
        )
    )
    return DeviceToken.model_validate(result)


async def find_device_token(
    db: Adapter,
    user_id: str,
    token: str,
    platform: Platform,
) -> Optional[DeviceToken]:
    """Find a device token by user, token, and platform."""
    result = await db.find_one(
        FindOneParams(
            model="device_tokens",
            where=[
                WhereClause(field="userId", operator=Operator.EQ, value=user_id),
                WhereClause(field="token", operator=Operator.EQ, value=token),
                WhereClause(field="platform", operator=Operator.EQ, value=platform),
            ],
        )
    )
    return DeviceToken.model_validate(result) if result else None


async def find_device_tokens(
    db: Adapter,
    user_id: str,
    platform: Optional[Platform] = None,
    is_active: bool = True,
) -> list[DeviceToken]:
    """Find device tokens for a user."""
    where = [
        WhereClause(field="userId", operator=Operator.EQ, value=user_id),
        WhereClause(field="isActive", operator=Operator.EQ, value=is_active),
    ]

    if platform:
        where.append(WhereClause(field="platform", operator=Operator.EQ, value=platform))

    results = await db.find_many(
        FindManyParams(
            model="device_tokens",
            where=where,
            orderBy=None,
        )
    )
    return [DeviceToken.model_validate(r) for r in results]


async def find_inactive_device_tokens(
    db: Adapter,
    older_than: datetime,
) -> list[DeviceToken]:
    """Find inactive device tokens older than the provided cutoff."""
    results = await db.find_many(
        FindManyParams(
            model="device_tokens",
            where=[
                WhereClause(field="isActive", operator=Operator.EQ, value=False),
                WhereClause(field="lastUsedAt", operator=Operator.LT, value=older_than),
            ],
            orderBy=None,
        )
    )
    return [DeviceToken.model_validate(r) for r in results]


async def deactivate_device_tokens(db: Adapter, tokens: list[str]) -> None:
    """Deactivate device tokens by token values."""
    for token in tokens:
        # Find all devices with this token
        devices = await db.find_many(
            FindManyParams(
                model="device_tokens",
                where=[WhereClause(field="token", operator=Operator.EQ, value=token)],
                orderBy=None,
            )
        )

        # Deactivate each
        for device in devices:
            await db.update(
                UpdateParams(
                    model="device_tokens",
                    where=[WhereClause(field="id", operator=Operator.EQ, value=str(device["id"]))],
                    data={"isActive": False, "updatedAt": datetime.utcnow()},
                )
            )


async def delete_device_token(db: Adapter, device_id: Any) -> None:
    """Delete a device token."""
    await db.delete(
        DeleteParams(
            model="device_tokens",
            where=[WhereClause(field="id", operator=Operator.EQ, value=str(device_id))],
        )
    )


async def delete_device_tokens(db: Adapter, device_ids: list[Any]) -> int:
    """Delete multiple device tokens and return the deletion count."""
    deleted = 0
    for device_id in device_ids:
        await delete_device_token(db, device_id=device_id)
        deleted += 1
    return deleted


# --- Push Notification Helpers ---


async def create_push_notification(db: Adapter, data: dict) -> PushNotification:
    """Create a push notification."""
    result = await db.create(
        CreateParams(
            model="push_notifications",
            data={
                **data,
                "id": data.get("id", str(uuid4())),
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow(),
            },
        )
    )
    return PushNotification.model_validate(result)


async def update_push_notification(
    db: Adapter, id: str, data: dict
) -> PushNotification:
    """Update a push notification."""
    result = await db.update(
        UpdateParams(
            model="push_notifications",
            where=[WhereClause(field="id", operator=Operator.EQ, value=id)],
            data={**data, "updatedAt": datetime.utcnow()},
        )
    )
    return PushNotification.model_validate(result)


async def get_push_notification(db: Adapter, id: str) -> Optional[PushNotification]:
    """Get a push notification by ID."""
    result = await db.find_one(
        FindOneParams(
            model="push_notifications",
            where=[WhereClause(field="id", operator=Operator.EQ, value=id)],
        )
    )
    return PushNotification.model_validate(result) if result else None


# --- SMS Transaction Helpers ---


async def create_sms_transaction(db: Adapter, data: dict) -> SmsTransaction:
    """Create an SMS transaction."""
    result = await db.create(
        CreateParams(
            model="sms_transactions",
            data={
                **data,
                "id": data.get("id", str(uuid4())),
                "createdAt": datetime.utcnow(),
                "updatedAt": datetime.utcnow(),
            },
        )
    )
    return SmsTransaction.model_validate(result)


async def update_sms_transaction(db: Adapter, id: str, data: dict) -> SmsTransaction:
    """Update an SMS transaction."""
    result = await db.update(
        UpdateParams(
            model="sms_transactions",
            where=[WhereClause(field="id", operator=Operator.EQ, value=id)],
            data={**data, "updatedAt": datetime.utcnow()},
        )
    )
    return SmsTransaction.model_validate(result)


async def get_sms_transaction(db: Adapter, id: str) -> Optional[SmsTransaction]:
    """Get an SMS transaction by ID."""
    result = await db.find_one(
        FindOneParams(
            model="sms_transactions",
            where=[WhereClause(field="id", operator=Operator.EQ, value=id)],
        )
    )
    return SmsTransaction.model_validate(result) if result else None
