"""Provider registry for managing available providers."""

from typing import Dict, List, Optional, Set

from ..types import Provider, AuthType


class ProviderStatus:
    """Provider availability status."""

    AVAILABLE = "available"
    CONFIGURED = "configured"
    UNAVAILABLE = "unavailable"


class ProviderInfo:
    """Provider information returned to users."""

    def __init__(
        self,
        name: str,
        display_name: str,
        description: str,
        auth_type: AuthType,
        status: str,
        version: str,
        actions_count: int,
        triggers_count: int,
        icon_url: Optional[str] = None,
    ):
        self.name = name
        self.display_name = display_name
        self.description = description
        self.auth_type = auth_type
        self.status = status
        self.version = version
        self.actions_count = actions_count
        self.triggers_count = triggers_count
        self.icon_url = icon_url


class ProviderRegistry:
    """Registry for managing providers."""

    def __init__(self, logger: Optional[any] = None):
        """Initialize provider registry.

        Args:
            logger: Optional logger instance
        """
        self._providers: Dict[str, Provider] = {}
        self._configured: Set[str] = set()
        self.logger = logger

    def register_provider(self, provider: Provider) -> None:
        """Register a new provider.

        Args:
            provider: Provider to register

        Raises:
            ValueError: If provider with same name already registered
        """
        if provider.name in self._providers:
            if self.logger:
                self.logger.warn(
                    f"Provider {provider.name} already registered, overwriting"
                )

        self._providers[provider.name] = provider

        if self.logger:
            self.logger.info(f"Registered provider: {provider.name}")

    def get_provider(self, name: str) -> Optional[Provider]:
        """Get a provider by name.

        Args:
            name: Provider name

        Returns:
            Provider or None if not found
        """
        return self._providers.get(name)

    def list_providers(self) -> List[Provider]:
        """List all registered providers.

        Returns:
            List of providers
        """
        return list(self._providers.values())

    def get_provider_info(self, name: str) -> Optional[ProviderInfo]:
        """Get provider information.

        Args:
            name: Provider name

        Returns:
            Provider info or None if not found
        """
        provider = self.get_provider(name)
        if not provider:
            return None

        # Determine status
        status = ProviderStatus.AVAILABLE
        if name in self._configured:
            status = ProviderStatus.CONFIGURED

        return ProviderInfo(
            name=provider.name,
            display_name=provider.display_name,
            description=provider.description,
            auth_type=provider.auth_type,
            status=status,
            version=provider.version,
            actions_count=len(provider.actions) if hasattr(provider, "actions") else 0,
            triggers_count=(
                len(provider.triggers) if hasattr(provider, "triggers") else 0
            ),
            icon_url=provider.icon_url if hasattr(provider, "icon_url") else None,
        )

    def list_provider_info(self) -> List[ProviderInfo]:
        """List provider information for all providers.

        Returns:
            List of provider info
        """
        return [
            self.get_provider_info(name)
            for name in self._providers.keys()
            if self.get_provider_info(name) is not None
        ]

    def mark_configured(self, name: str) -> None:
        """Mark a provider as configured.

        Args:
            name: Provider name
        """
        self._configured.add(name)

    def is_configured(self, name: str) -> bool:
        """Check if a provider is configured.

        Args:
            name: Provider name

        Returns:
            True if configured
        """
        return name in self._configured

    def has_provider(self, name: str) -> bool:
        """Check if a provider is registered.

        Args:
            name: Provider name

        Returns:
            True if provider is registered
        """
        return name in self._providers
