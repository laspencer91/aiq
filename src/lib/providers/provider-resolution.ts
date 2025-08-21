import { IAiProvider } from '.';
import { GeminiProvider } from './gemini';
import { ProviderConfig } from '../../types';

export function resolveProvider(config: ProviderConfig): IAiProvider {
  let provider: IAiProvider;

  switch (config.name) {
    case 'gemini':
      provider = new GeminiProvider(config);
      break;
    default:
      throw new Error(`Unknown provider: ${String(config.name)}`);
  }

  provider.validateConfig();
  return provider;
}
