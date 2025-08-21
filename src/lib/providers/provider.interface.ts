import { BaseProviderConfig, ProviderConfig } from '../../types';
import { DistinctQuestion } from 'inquirer';

export abstract class IAiProvider<Config extends BaseProviderConfig = ProviderConfig> {
  abstract get displayName(): string;
  abstract executePrompt(prompt: string): Promise<string>;
  abstract validateConfig(): void;
  abstract validateConnection(): Promise<boolean>;
  abstract getInitQuestions(): DistinctQuestion[];
  abstract getDefaultProviderConfig(): Config;

  public static getDefaultConfig(): BaseProviderConfig {
    return {
      name: 'no-provider',
    };
  }
}
