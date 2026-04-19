"""Bundled authfn plugin implementations."""

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


def __getattr__(name: str) -> object:
    if name in {"ApiKeyPluginConfig", "ApiKeyService", "authfn_api_key_plugin"}:
        from .api_keys import ApiKeyPluginConfig, ApiKeyService, authfn_api_key_plugin

        return {
            "ApiKeyPluginConfig": ApiKeyPluginConfig,
            "ApiKeyService": ApiKeyService,
            "authfn_api_key_plugin": authfn_api_key_plugin,
        }[name]

    if name in {"EmailOtpPluginConfig", "EmailOtpService", "authfn_email_otp_plugin"}:
        from .email_otp import EmailOtpPluginConfig, EmailOtpService, authfn_email_otp_plugin

        return {
            "EmailOtpPluginConfig": EmailOtpPluginConfig,
            "EmailOtpService": EmailOtpService,
            "authfn_email_otp_plugin": authfn_email_otp_plugin,
        }[name]

    if name in {"MultiRegionPluginConfig", "MultiRegionRegionConfig", "MultiRegionService", "authfn_multi_region_plugin"}:
        from .multi_region import (
            MultiRegionPluginConfig,
            MultiRegionRegionConfig,
            MultiRegionService,
            authfn_multi_region_plugin,
        )

        return {
            "MultiRegionPluginConfig": MultiRegionPluginConfig,
            "MultiRegionRegionConfig": MultiRegionRegionConfig,
            "MultiRegionService": MultiRegionService,
            "authfn_multi_region_plugin": authfn_multi_region_plugin,
        }[name]

    if name in {"SocialOAuthPluginConfig", "SocialOAuthService", "SocialProviderConfig", "authfn_social_oauth_plugin"}:
        from .social_oauth import (
            SocialOAuthPluginConfig,
            SocialOAuthService,
            SocialProviderConfig,
            authfn_social_oauth_plugin,
        )

        return {
            "SocialOAuthPluginConfig": SocialOAuthPluginConfig,
            "SocialOAuthService": SocialOAuthService,
            "SocialProviderConfig": SocialProviderConfig,
            "authfn_social_oauth_plugin": authfn_social_oauth_plugin,
        }[name]

    if name in {"TwoFactorPluginConfig", "TwoFactorService", "authfn_two_factor_plugin"}:
        from .two_factor import TwoFactorPluginConfig, TwoFactorService, authfn_two_factor_plugin

        return {
            "TwoFactorPluginConfig": TwoFactorPluginConfig,
            "TwoFactorService": TwoFactorService,
            "authfn_two_factor_plugin": authfn_two_factor_plugin,
        }[name]

    raise AttributeError(name)
