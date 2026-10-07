"""Shared persistence limits for AuthFn schema keys."""

from .types import ValidationError

AUTHFN_DATABASE_KEY_MAX_LENGTH = 255
AUTHFN_LEGACY_USER_REFERENCE_MAX_LENGTH = 767


def assert_database_key_length(
    value: str,
    field_name: str,
    max_length: int = AUTHFN_DATABASE_KEY_MAX_LENGTH,
) -> str:
    """Reject values that cannot fit the bounded AuthFn key columns."""

    if len(value) > max_length:
        raise ValidationError(
            f"{field_name} must contain at most {max_length} characters",
            {
                "fieldName": field_name,
                "maxLength": max_length,
                "actualLength": len(value),
            },
        )
    return value
