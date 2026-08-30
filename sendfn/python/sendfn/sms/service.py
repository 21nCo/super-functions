"""SMS service orchestration."""

import asyncio
from datetime import datetime

from superfunctions.db import Adapter

from ..models import SendSmsParams, SmsTransaction
from .provider import SendSmsRequest, SmsProvider


class SmsService:
    """SMS service that coordinates SMS provider and database operations."""

    def __init__(
        self,
        provider: SmsProvider,
        db: Adapter,
        event_tracking: bool = True,
    ) -> None:
        """Initialize SMS service.

        Args:
            provider: SMS provider (console, Twilio, etc.)
            db: Database adapter
        """
        self.provider = provider
        self.db = db
        self.event_tracking = event_tracking
        self._initialized = False
        self._initialize_lock = asyncio.Lock()

    async def _ensure_initialized(self) -> None:
        if self._initialized:
            return
        async with self._initialize_lock:
            if self._initialized:
                return
            await self.provider.initialize()
            self._initialized = True

    async def send_sms(self, params: SendSmsParams) -> SmsTransaction:
        """Send an SMS.

        Args:
            params: SMS send parameters

        Returns:
            SMS transaction record
        """
        from ..database.helpers import (
            create_sms_transaction,
            get_sms_transaction,
            record_event,
            update_sms_transaction,
        )

        await self._ensure_initialized()

        # Create transaction record (pending)
        transaction = await create_sms_transaction(
            self.db,
            {
                "userId": params.user_id,
                "to": params.to,
                "message": params.message,
                "provider": self.provider.name,
                "providerMessageId": None,
                "status": "pending",
                "sentAt": None,
                "metadata": params.metadata or {},
            },
        )

        try:
            # Send via provider
            response = await self.provider.send_sms(
                SendSmsRequest(
                    to=params.to,
                    message=params.message,
                    metadata=params.metadata,
                )
            )

            # Update transaction
            await update_sms_transaction(
                self.db,
                str(transaction.id),
                {
                    "status": "sent" if response.success else "failed",
                    "providerMessageId": response.provider_message_id,
                    "sentAt": response.timestamp,
                    "metadata": {
                        **(params.metadata or {}),
                        "error": response.error,
                    },
                },
            )

            # Record event
            if self.event_tracking:
                await record_event(
                    self.db,
                    {
                        "referenceId": str(transaction.id),
                        "referenceType": "sms",
                        "eventType": "sent" if response.success else "failed",
                        "provider": self.provider.name,
                        "providerEventId": response.provider_message_id,
                        "recipientEmail": None,
                        "recipientPhone": params.to,
                        "deviceToken": None,
                        "metadata": {"error": response.error} if response.error else {},
                        "eventTimestamp": response.timestamp,
                    },
                )

            # Get updated transaction
            updated_transaction = await get_sms_transaction(self.db, str(transaction.id))
            if not updated_transaction:
                raise ValueError(f"Transaction {transaction.id} not found after update")

            return updated_transaction

        except Exception as error:
            # Update transaction as failed
            await update_sms_transaction(
                self.db,
                str(transaction.id),
                {
                    "status": "failed",
                    "metadata": {**(params.metadata or {}), "error": str(error)},
                },
            )

            # Record failed event
            if self.event_tracking:
                await record_event(
                    self.db,
                    {
                        "referenceId": str(transaction.id),
                        "referenceType": "sms",
                        "eventType": "failed",
                        "provider": self.provider.name,
                        "providerEventId": None,
                        "recipientEmail": None,
                        "recipientPhone": params.to,
                        "deviceToken": None,
                        "metadata": {"error": str(error)},
                        "eventTimestamp": datetime.now(),
                    },
                )

            raise error
