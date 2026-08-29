"""Event tracking for communication events."""

from datetime import datetime
from typing import Optional

from superfunctions.db import Adapter

from ..database import helpers as db_helpers
from ..models import CommunicationEvent, EventType, ReferenceType


class EventTracker:
    """Tracks communication events."""

    def __init__(self, db: Adapter, enabled: bool = True) -> None:
        """Initialize the event tracker.

        Args:
            db: Database adapter
            enabled: Whether event tracking is enabled
        """
        self.db = db
        self.enabled = enabled

    async def record_event(
        self,
        reference_id: str,
        reference_type: ReferenceType,
        event_type: EventType,
        provider: str,
        provider_event_id: Optional[str] = None,
        recipient_email: Optional[str] = None,
        recipient_phone: Optional[str] = None,
        device_token: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> Optional[CommunicationEvent]:
        """Record a communication event.

        Args:
            reference_id: ID of the email/push/sms transaction
            reference_type: Type of reference (email, push, sms)
            event_type: Type of event (sent, delivered, bounced, etc.)
            provider: Provider name
            provider_event_id: Provider's event ID
            recipient_email: Recipient email address
            recipient_phone: Recipient phone number
            device_token: Device token
            metadata: Additional metadata

        Returns:
            Created event or None if tracking is disabled
        """
        if not self.enabled:
            return None

        event_data = {
            "referenceId": reference_id,
            "referenceType": reference_type,
            "eventType": event_type,
            "provider": provider,
            "providerEventId": provider_event_id,
            "recipientEmail": recipient_email,
            "recipientPhone": recipient_phone,
            "deviceToken": device_token,
            "metadata": metadata or {},
            "eventTimestamp": datetime.utcnow(),
        }

        return await db_helpers.record_event(self.db, event_data)

    async def get_events_by_reference(
        self, reference_id: str, reference_type: ReferenceType
    ) -> list[CommunicationEvent]:
        """Get all events for a specific reference.

        Args:
            reference_id: ID of the email/push/sms transaction
            reference_type: Type of reference (email, push, sms)

        Returns:
            List of communication events
        """
        return await db_helpers.get_events_by_reference(self.db, reference_id, reference_type)

    async def query_events(
        self,
        reference_id: Optional[str] = None,
        reference_type: Optional[ReferenceType] = None,
        provider_message_id: Optional[str] = None,
        provider: Optional[str] = None,
        user_id: Optional[str] = None,
        event_type: Optional[EventType] = None,
        start_at: Optional[datetime] = None,
        end_at: Optional[datetime] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> list[CommunicationEvent]:
        """Query communication events.

        Args:
            reference_id: Filter by reference ID
            reference_type: Filter by reference type
            event_type: Filter by event type
            limit: Maximum number of results
            offset: Offset for pagination

        Returns:
            List of matching communication events
        """
        params = {
            "reference_id": reference_id,
            "reference_type": reference_type,
            "provider_message_id": provider_message_id,
            "provider": provider,
            "user_id": user_id,
            "event_type": event_type,
            "start_at": start_at,
            "end_at": end_at,
            "limit": limit,
            "offset": offset,
        }
        return await db_helpers.find_events(self.db, params)
