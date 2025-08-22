import { BaseProviderConfig } from '../../types';
import { DistinctQuestion } from 'inquirer';

export abstract class IAiProvider<Config extends BaseProviderConfig = BaseProviderConfig> {
  constructor(protected config: Config) {}

  defaultConfig?: Partial<Config> | undefined;
  providerName?: string | undefined;
  displayName?: string | undefined;

  abstract executePrompt(prompt: string): Promise<string>;
  abstract validateConfig(): void;
  abstract validateConnection(): Promise<boolean>;
  abstract getInitQuestions(): DistinctQuestion[];
}
