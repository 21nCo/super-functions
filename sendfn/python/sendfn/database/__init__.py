"""Database adapter utilities for sendfn.

This module re-exports superfunctions.db types for convenience and provides
sendfn-specific helper functions.
"""

from superfunctions.db import (
    Adapter,
    CreateParams,
    DeleteParams,
    FindManyParams,
    FindOneParams,
    Operator,
    OrderBy,
    UpdateParams,
    WhereClause,
)

from .helpers import (
    add_to_suppression_list,
    create_email_transaction,
    find_events,
    find_suppression_list,
    get_email_transaction,
    get_email_transaction_by_provider_message_id,
    get_events_by_reference,
    get_suppression_list_entry,
    is_email_suppressed,
    normalize_suppression_email,
    record_event,
    remove_from_suppression_list,
    update_email_transaction,
)
from .memory import MemoryAdapter

__all__ = [
    # Re-exported from superfunctions.db
    "Adapter",
    "CreateParams",
    "FindManyParams",
    "FindOneParams",
    "UpdateParams",
    "DeleteParams",
    "WhereClause",
    "OrderBy",
    "Operator",
    # Local implementations
    "MemoryAdapter",
    # Helper functions
    "create_email_transaction",
    "update_email_transaction",
    "get_email_transaction",
    "get_email_transaction_by_provider_message_id",
    "record_event",
    "get_events_by_reference",
    "find_events",
    "is_email_suppressed",
    "get_suppression_list_entry",
    "normalize_suppression_email",
    "add_to_suppression_list",
    "remove_from_suppression_list",
    "find_suppression_list",
]
