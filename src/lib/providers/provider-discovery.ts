import { IAiProvider } from '.';
import { BaseProviderConfig } from '../../types';

/**
 * Constructor type for providers
 */
export interface ProviderConstructor<T extends BaseProviderConfig = BaseProviderConfig> {
  new (config: T): IAiProvider<T>;
  defaultConfig?: Partial<T>;
  providerName?: string;
  displayName?: string;
}

interface ProviderMetadata {
  providerName: string;
  displayName: string;
  defaultConfig: BaseProviderConfig;
}

const providerMetadata = new WeakMap<any, ProviderMetadata>();

/**
 * Provider Discovery - Central registry for all providers
 */
export class ProviderDiscovery {
  private static providers = new Map<string, ProviderConstructor>();

  /**
   * Register a provider class
   */
  static register<T extends BaseProviderConfig>(
    name: string,
    ProviderClass: ProviderConstructor<T>,
  ): void {
    if (this.providers.has(name)) {
      console.warn(`Provider "${name}" is already registered. Overwriting...`);
    }
    this.providers.set(name.toLowerCase(), ProviderClass as unknown as ProviderConstructor);
    console.log(`Registered provider: ${name}`);
  }

  /**
   * Get a provider instance by name
   */
  static get<T extends BaseProviderConfig = BaseProviderConfig>(
    id: string,
    config?: Partial<T>,
  ): IAiProvider<T> {
    const ProviderClass = this.providers.get(id.toLowerCase());

    if (!ProviderClass) {
      const available = Array.from(this.providers.keys()).join(', ');
      throw new Error(`Provider "${id}" not found. Available providers: ${available || 'none'}`);
    }

    // Get metadata for default config
    const metadata = providerMetadata.get(ProviderClass);
    const defaultConfig = metadata?.defaultConfig || {};

    const finalConfig = {
      ...defaultConfig,
      ...config,
      name: id,
    } as T;

    return new ProviderClass(finalConfig) as IAiProvider<T>;
  }

  /**
   * Get a provider class (constructor) by name
   */
  static getClass(id: string): ProviderConstructor | undefined {
    return this.providers.get(id.toLowerCase());
  }

  /**
   * List all registered provider names
   */
  static list(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if a provider is registered
   */
  static has(id: string): boolean {
    return this.providers.has(id.toLowerCase());
  }

  /**
   * Clear all registered providers (useful for testing)
   */
  static clear(): void {
    this.providers.clear();
  }

  static getMetadata(id: string): ProviderMetadata | undefined {
    const ProviderClass = this.providers.get(id.toLowerCase());
    return ProviderClass ? providerMetadata.get(ProviderClass) : undefined;
  }
}

/**
 * Decorator to automatically register providers
 */
export function Provider<T extends BaseProviderConfig>(displayName: string, defaultConfig: T) {
  return function <C extends ProviderConstructor<T>>(constructor: C): C {
    // Set the provider name on the class
    providerMetadata.set(constructor, {
      providerName: defaultConfig.name,
      displayName: displayName,
      defaultConfig: defaultConfig,
    });

    // Auto-register the provider
    ProviderDiscovery.register(defaultConfig.name, constructor);

    // Return the same constructor type
    return constructor;
  };
}
