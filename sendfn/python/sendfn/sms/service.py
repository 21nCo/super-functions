"""SMS service orchestration."""

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
    ) -> None:
        """Initialize SMS service.

        Args:
            provider: SMS provider (console, Twilio, etc.)
            db: Database adapter
        """
        self.provider = provider
        self.db = db

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
