"""Email package for sendfn."""

from .provider import (
    EmailProvider,
    EmailProviderCapabilities,
    SendEmailRequest,
    SendEmailResponse,
)

__all__ = [
    "EmailProvider",
    "EmailProviderCapabilities",
    "SendEmailRequest",
    "SendEmailResponse",
]
