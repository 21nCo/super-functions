import type { Provider, ProviderInfo } from '../types/provider.js';
import { ProviderStatus, AuthType } from '../types/provider.js';
import type { Logger } from '../types/action.js';

/**
 * Provider registry manages available providers
 */
export class ProviderRegistry {
  private providers = new Map<string, Provider>();
  private configuredProviders = new Set<string>();

  constructor(private logger: Logger) {}

  /**
   * Register a provider
   */
  register(provider: Provider): void {
    if (this.providers.has(provider.name)) {
      this.logger.warn(`Provider ${provider.name} already registered, overwriting`);
    }

    this.providers.set(provider.name, provider);
    this.logger.info(`Provider registered: ${provider.name} v${provider.version}`);
  }

  /**
   * Register multiple providers
   */
  registerMany(providers: Provider[]): void {
    for (const provider of providers) {
      this.register(provider);
    }
  }

  /**
   * Get a provider by name
   */
  get(name: string): Provider | undefined {
    return this.providers.get(name);
  }

  /**
   * Check if provider exists
   */
  has(name: string): boolean {
    return this.providers.has(name);
  }

  /**
   * Mark provider as configured
   */
  markConfigured(name: string): void {
    this.configuredProviders.add(name);
  }

  /**
   * Check if provider is configured
   */
  isConfigured(name: string): boolean {
    return this.configuredProviders.has(name);
  }

  /**
   * List all providers
   */
  list(): Provider[] {
    return Array.from(this.providers.values());
  }

  /**
   * List providers with their status
   */
  listWithStatus(): ProviderInfo[] {
    return Array.from(this.providers.values()).map((provider) => ({
      name: provider.name,
      displayName: provider.displayName,
      description: provider.description,
      iconUrl: provider.iconUrl,
      authType: provider.auth.type,
      status: this.getProviderStatus(provider.name),
      version: provider.version,
      actionsCount: Object.keys(provider.actions).length,
      triggersCount: provider.triggers ? Object.keys(provider.triggers).length : 0,
    }));
  }

  /**
   * Get provider status
   */
  private getProviderStatus(name: string): ProviderStatus {
    if (!this.providers.has(name)) {
      return ProviderStatus.Unavailable;
    }

    if (this.configuredProviders.has(name)) {
      return ProviderStatus.Configured;
    }

    return ProviderStatus.Available;
  }

  /**
   * Search providers
   */
  search(query: string): Provider[] {
    const lowerQuery = query.toLowerCase();
    
    return Array.from(this.providers.values()).filter((provider) => {
      return (
        provider.name.toLowerCase().includes(lowerQuery) ||
        provider.displayName.toLowerCase().includes(lowerQuery) ||
        provider.description.toLowerCase().includes(lowerQuery)
      );
    });
  }

  /**
   * Get providers by auth type
   */
  getByAuthType(authType: AuthType): Provider[] {
    return Array.from(this.providers.values()).filter(
      (provider) => provider.auth.type === authType
    );
  }

  /**
   * Unregister a provider
   */
  unregister(name: string): boolean {
    const removed = this.providers.delete(name);
    if (removed) {
      this.configuredProviders.delete(name);
      this.logger.info(`Provider unregistered: ${name}`);
    }
    return removed;
  }

  /**
   * Clear all providers
   */
  clear(): void {
    this.providers.clear();
    this.configuredProviders.clear();
    this.logger.info('All providers cleared');
  }

  /**
   * Get provider count
   */
  count(): number {
    return this.providers.size;
  }
}
