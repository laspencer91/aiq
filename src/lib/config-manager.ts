import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { CommandDef, Config, UserError } from '../types.js';

export class ConfigManager {
  private static instance: ConfigManager;
  private config?: Config;
  private configPath: string;

  constructor() {
    this.configPath = this.getConfigPath();
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private getConfigPath(): string {
    const configDir = process.env.AIQ_CONFIG_DIR || path.join(os.homedir(), '.aiq');
    return path.join(configDir, 'config.json');
  }

  private resolveEnvVars<T extends object | string>(obj: T): T {
    if (typeof obj === 'string') {
      // Handle ${VAR_NAME:-default} syntax
      return obj.replace(/\${([^}]+)}/g, (match, expr: string) => {
        const [varName, defaultVal] = expr.split(':-');
        return process.env[varName] || defaultVal || '';
      }) as T;
    }

    if (Array.isArray(obj)) {
      return obj.map((item: T) => this.resolveEnvVars<T>(item)) as T;
    }

    if (obj && typeof obj === 'object') {
      const resolved: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        resolved[key] = this.resolveEnvVars<T>(value as T);
      }
      return resolved as T;
    }

    return obj;
  }

  async load(): Promise<Config> {
    if (this.config) {
      return this.config;
    }

    try {
      const configContent = await fs.readFile(this.configPath, 'utf-8');
      const parsed = JSON.parse(configContent) as Config;
      this.config = this.resolveEnvVars<Config>(parsed);

      // Validate required fields
      this.validate(this.config);

      return this.config;
    } catch (error) {
      if (error instanceof Error) {
        if ('code' in error && error.code === 'ENOENT') {
          throw new UserError('Config file not found', 'Run "aiq config init" to create one');
        }
        throw new UserError(
          'Invalid JSON in config file',
          'Run "aiq config validate" to check for errors',
        );
      }
      throw error;
    }
  }

  async save(config: Config): Promise<void> {
    const dir = path.dirname(this.configPath);

    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });

    // Save config with pretty formatting
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf-8');

    this.config = config;
  }

  async exists(): Promise<boolean> {
    try {
      await fs.access(this.configPath);
      return true;
    } catch {
      return false;
    }
  }

  validate(config: Config): void {
    // Check required provider fields
    if (!config.provider?.apiKey) {
      throw new UserError(
        'API key not configured',
        'Set GEMINI_API_KEY environment variable or add it to config',
      );
    }

    if (!config.provider?.model) {
      throw new UserError(
        'Model not specified in config',
        'Add a model like "gemini-2.0-flash" to your provider config',
      );
    }

    // Validate commands
    const commandNames = new Set<string>();
    for (const cmd of config.commands || []) {
      if (!cmd.name || !cmd.prompt) {
        throw new UserError(
          'Invalid command configuration',
          'Each command must have a name and prompt',
        );
      }

      if (commandNames.has(cmd.name)) {
        throw new UserError(`Duplicate command name: ${cmd.name}`, 'Command names must be unique');
      }
      commandNames.add(cmd.name);

      // Validate params if present
      if (cmd.params) {
        for (const [paramName, paramDef] of Object.entries(cmd.params)) {
          if (!['string', 'number', 'boolean'].includes(paramDef.type)) {
            throw new UserError(
              `Invalid param type for ${paramName}: ${paramDef.type}`,
              'Use string, number, or boolean',
            );
          }

          // Validate choices match type
          if (paramDef.choices && paramDef.type === 'number') {
            const allNumbers = paramDef.choices.every((c) => !isNaN(Number(c)));
            if (!allNumbers) {
              throw new UserError(
                `Choices for number param ${paramName} must all be numbers`,
                'Check your choices array',
              );
            }
          }
        }
      }
    }
  }

  async addCommand(command: CommandDef): Promise<void> {
    const config = await this.load();

    // Check for duplicate
    const existing = config.commands.find((c) => c.name === command.name);
    if (existing) {
      throw new UserError(
        `Command '${command.name}' already exists`,
        'Use "aiq edit" to modify it',
      );
    }

    config.commands.push(command);
    await this.save(config);
  }

  async getCommand(name: string): Promise<CommandDef> {
    const config = await this.load();
    const command = config.commands.find((c) => c.name === name);

    if (!command) {
      throw new UserError(
        `Command '${name}' not found`,
        'Run "aiq list" to see available commands',
      );
    }

    return command;
  }

  getDefaultConfig(): Config {
    return {
      version: '1.0',
      provider: {
        name: 'gemini',
        apiKey: '${GEMINI_API_KEY}',
        model: 'gemini-2.0-flash',
        temperature: 0.7,
        maxTokens: 500,
      },
      editor: '${EDITOR:-nano}',
      commands: [
        {
          name: 'summarize',
          description: 'Summarize text concisely',
          prompt: 'Summarize this in {maxWords} words or less:\n\n{input}',
          params: {
            maxWords: {
              type: 'number',
              default: 50,
              alias: 'w',
              description: 'Maximum words for summary',
            },
          },
        },
        {
          name: 'explain',
          description: 'Explain code or concept clearly',
          prompt: 'Explain this clearly:\n\n{input}',
        },
        {
          name: 'cmd',
          description: 'Get terminal command only',
          prompt:
            'Provide ONLY the terminal command for: {input}\nNo explanation, just the command.',
        },
        {
          name: 'fix',
          description: 'Fix errors in code or text',
          prompt: 'Fix any errors in this and return only the corrected version:\n\n{input}',
        },
      ],
      history: {
        enabled: true,
        maxEntries: 100,
        location: '${HOME}/.aiq/history.json',
      },
    };
  }
}
