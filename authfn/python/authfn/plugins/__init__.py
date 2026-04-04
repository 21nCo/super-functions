"""Bundled authfn plugin implementations."""

from .email_otp import (
    EmailOtpPluginConfig,
    EmailOtpService,
    authfn_email_otp_plugin,
)
from .api_keys import (
    ApiKeyPluginConfig,
    ApiKeyService,
    authfn_api_key_plugin,
)
from .social_oauth import (
    SocialOAuthPluginConfig,
    SocialOAuthService,
    SocialProviderConfig,
    authfn_social_oauth_plugin,
)
from .two_factor import (
    TwoFactorPluginConfig,
    TwoFactorService,
    authfn_two_factor_plugin,
)
from .multi_region import (
    MultiRegionPluginConfig,
    MultiRegionRegionConfig,
    MultiRegionService,
    authfn_multi_region_plugin,
)

__all__ = [
    "ApiKeyPluginConfig",
    "ApiKeyService",
    "EmailOtpPluginConfig",
    "EmailOtpService",
    "TwoFactorPluginConfig",
    "TwoFactorService",
    "authfn_api_key_plugin",
    "authfn_email_otp_plugin",
    "SocialOAuthPluginConfig",
    "SocialOAuthService",
    "SocialProviderConfig",
    "authfn_social_oauth_plugin",
    "authfn_two_factor_plugin",
    "MultiRegionPluginConfig",
    "MultiRegionRegionConfig",
    "MultiRegionService",
    "authfn_multi_region_plugin",
]
