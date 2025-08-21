import { GeminiProvider, IAiProvider } from '.';
import { ProviderConfig } from '../../types';

export function resolveProvider(config: ProviderConfig): IAiProvider {
  switch (config.name) {
    case 'gemini':
      return new GeminiProvider(config);
    default:
      throw new Error(`Unknown provider: ${String(config.name)}`);
  }
}
