import { BaseProviderConfig } from '../../types';
import { DistinctQuestion } from 'inquirer';
import { ProviderDiscovery } from './provider-discovery';

export abstract class IAiProvider<Config extends BaseProviderConfig = BaseProviderConfig> {
  constructor(protected config: Config) {}

  abstract executePrompt(prompt: string): Promise<string>;
  abstract validateConfig(): void;
  abstract validateConnection(): Promise<boolean>;
  abstract getInitQuestions(): DistinctQuestion[];

  public getDisplayName(): string {
    return ProviderDiscovery.getMetadata(this.config.name)?.displayName ?? 'Ai Provider';
  }

  public getDefaultConfig(): BaseProviderConfig | undefined {
    return ProviderDiscovery.getMetadata(this.config.name)?.defaultConfig;
  }
}
