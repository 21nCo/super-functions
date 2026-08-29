"""Suppression list management."""

from datetime import datetime
from typing import Optional

from superfunctions.db import Adapter

from ..database import helpers as db_helpers
from ..errors import SuppressionError, ValidationError
from ..models import SuppressionList, SuppressionReason


class SuppressionManager:
    """Manages email suppression list."""

    def __init__(self, db: Adapter, enabled: bool = True) -> None:
        """Initialize the suppression manager.

        Args:
            db: Database adapter
            enabled: Whether suppression is enabled
        """
        self.db = db
        self.enabled = enabled

    def _normalize_email(self, email: str) -> str:
        return db_helpers.normalize_suppression_email(email)

    async def is_suppressed(self, email: str) -> bool:
        """Check if an email is suppressed.

        Args:
            email: Email address to check

        Returns:
            True if suppressed, False otherwise
        """
        if not self.enabled:
            return False

        return await db_helpers.is_email_suppressed(self.db, self._normalize_email(email))

    async def get_suppression_entry(self, email: str) -> Optional[SuppressionList]:
        """Get suppression list entry for an email.

        Args:
            email: Email address

        Returns:
            Suppression list entry or None
        """
        return await db_helpers.get_suppression_list_entry(self.db, self._normalize_email(email))

    async def add_to_suppression_list(
        self,
        email: str,
        reason: SuppressionReason,
        source: str,
        bounce_type: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> SuppressionList:
        """Add an email to the suppression list.

        Args:
            email: Email address to suppress
            reason: Reason for suppression
            source: Source of suppression (e.g., 'aws-ses', 'user-action')
            bounce_type: Type of bounce (if applicable)
            metadata: Additional metadata

        Returns:
            Suppression list entry
        """
        suppression_data = {
            "email": self._normalize_email(email),
            "reason": reason,
            "source": source,
            "bounceType": bounce_type,
            "metadata": metadata or {},
            "suppressedAt": datetime.utcnow(),
        }

        return await db_helpers.add_to_suppression_list(self.db, suppression_data)

    async def remove_from_suppression_list(self, email: str) -> None:
        """Remove an email from the suppression list.

        Args:
            email: Email address to remove
        """
        await db_helpers.remove_from_suppression_list(self.db, self._normalize_email(email))

    async def bulk_add_to_suppression_list(self, entries: list[dict]) -> None:
        """Add multiple entries to the suppression list."""
        if len(entries) > 1000:
            raise ValidationError("Bulk suppression add accepts at most 1000 entries")

        seen: set[str] = set()
        for entry in entries:
            if not isinstance(entry, dict) or "email" not in entry or "reason" not in entry:
                raise ValidationError(
                    "Each bulk suppression entry must include 'email' and 'reason'"
                )
            normalized_email = self._normalize_email(entry["email"])
            if normalized_email in seen:
                raise ValidationError("Duplicate normalized suppression email in bulk add request")

            seen.add(normalized_email)
            await self.add_to_suppression_list(
                email=normalized_email,
                reason=entry["reason"],
                source=entry.get("source", "manual"),
                bounce_type=entry.get("bounceType"),
                metadata=entry.get("metadata"),
            )

    async def export_suppression_list(
        self,
        limit: int = 1000,
        offset: int = 0,
    ) -> list[SuppressionList]:
        """Export suppression list entries using the public query surface."""
        return await self.query_suppression_list(limit=limit, offset=offset)

    async def check_and_raise(self, email: str) -> None:
        """Check if email is suppressed and raise error if it is.

        Args:
            email: Email address to check

        Raises:
            SuppressionError: If email is suppressed
        """
        if await self.is_suppressed(email):
            entry = await self.get_suppression_entry(email)
            raise SuppressionError(
                f"Email {email} is suppressed. Reason: {entry.reason if entry else 'unknown'}"
            )

    async def check_multiple(self, emails: list[str]) -> dict[str, bool]:
        """Check multiple emails for suppression.

        Args:
            emails: List of email addresses

        Returns:
            Dictionary mapping email to suppression status
        """
        result = {}
        for email in emails:
            result[email] = await self.is_suppressed(email)
        return result

    async def filter_suppressed(self, emails: list[str]) -> tuple[list[str], list[str]]:
        """Filter a list of emails into allowed and suppressed.

        Args:
            emails: List of email addresses

        Returns:
            Tuple of (allowed_emails, suppressed_emails)
        """
        allowed = []
        suppressed = []

        for email in emails:
            if await self.is_suppressed(email):
                suppressed.append(email)
            else:
                allowed.append(email)

        return allowed, suppressed

    async def query_suppression_list(
        self,
        reason: Optional[SuppressionReason] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> list[SuppressionList]:
        """Query the suppression list.

        Args:
            reason: Filter by suppression reason
            limit: Maximum number of results
            offset: Offset for pagination

        Returns:
            List of suppression list entries
        """
        params = {
            "reason": reason,
            "limit": limit,
            "offset": offset,
        }
        return await db_helpers.find_suppression_list(self.db, params)
