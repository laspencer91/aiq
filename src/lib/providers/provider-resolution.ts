import { IAiProvider } from '.';
import { ProviderConfig } from '../../types';
import { ProviderDiscovery } from './provider-discovery';

export function resolveProvider(config: ProviderConfig): IAiProvider {
  // Check if the provider exists
  if (!ProviderDiscovery.has(config.name)) {
    const available = ProviderDiscovery.list().join(', ');
    throw new Error(
      `Unknown provider: ${config.name}. Available providers: ${available || 'none'}`,
    );
  }

  // Get the provider instance using discovery
  const provider = ProviderDiscovery.get(config.name, config);

  // Validate config if the provider supports it
  provider.validateConfig();

  return provider;
}
