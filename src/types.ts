import { GeminiProviderConfig } from './lib/providers/gemini';

export interface Config {
  version: string;
  provider: ProviderConfig;
  editor?: string;
  commands: CommandDef[];
  history?: HistoryConfig;
}

export type BaseProviderConfig = { name: string; apiKey?: string; model?: string };

export type ProviderConfig = GeminiProviderConfig | BaseProviderConfig;

export interface CommandDef {
  name: string;
  description?: string;
  prompt: string;
  params?: Record<string, ParamDef>;
}

export interface ParamDef {
  type: 'string' | 'number' | 'boolean';
  default?: string | number | boolean; // Converted based on type
  alias?: string;
  required?: boolean;
  description?: string;
  choices?: string[];
}

export interface HistoryConfig {
  enabled: boolean;
  maxEntries: number;
  location: string;
}

export interface HistoryEntry {
  id: string;
  timestamp: number;
  command: string;
  params: Record<string, any>;
  prompt: string;
  response: string;
  duration: number;
}

export class UserError extends Error {
  constructor(
    message: string,
    public hint?: string,
  ) {
    super(message);
    this.name = 'UserError';
  }
}
