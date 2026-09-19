"""Shared persistence limits for AuthFn schema keys."""

from .types import ValidationError

AUTHFN_DATABASE_KEY_MAX_LENGTH = 255


def assert_database_key_length(value: str, field_name: str) -> str:
    """Reject values that cannot fit the bounded AuthFn key columns."""

    if len(value) > AUTHFN_DATABASE_KEY_MAX_LENGTH:
        raise ValidationError(
            f"{field_name} must contain at most {AUTHFN_DATABASE_KEY_MAX_LENGTH} characters",
            {
                "fieldName": field_name,
                "maxLength": AUTHFN_DATABASE_KEY_MAX_LENGTH,
                "actualLength": len(value),
            },
        )
    return value
