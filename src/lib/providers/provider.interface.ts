export abstract class IAiProvider {
  abstract get displayName(): string;
  abstract executePrompt(prompt: string): Promise<string>;
  abstract validateConnection(): Promise<boolean>;
}
