import { Config, UserError } from '../types.js';
import { TemplateEngine } from './template-engine.js';
import { HistoryManager } from './history-manager.js';
import chalk from 'chalk';
import ora from 'ora';
import { IAiProvider } from './providers';

export interface RunOptions {
  dryRun?: boolean;
  params?: Record<string, unknown>;
  input?: string;
}

export class CommandRunner {
  private config: Config;
  private provider: IAiProvider;
  private history?: HistoryManager;

  constructor(config: Config, provider: IAiProvider) {
    this.config = config;
    this.provider = provider;

    if (config.history?.enabled) {
      this.history = new HistoryManager(config.history);
    }
  }

  async run(commandName: string, options: RunOptions): Promise<string> {
    const command = this.config.commands.find((c) => c.name === commandName);

    if (!command) {
      throw new UserError(
        `Command '${commandName}' not found`,
        'Run "aiq list" to see available commands',
      );
    }

    // Get input from options or stdin
    const input = options.input || (await this.getStdinInput());

    // Prepare values for template
    const values: Record<string, unknown> = {
      ...options.params,
      input,
    };

    // Validate parameters
    TemplateEngine.validateParams(command.prompt, values, command.params);

    // Render the prompt
    const prompt = TemplateEngine.render(command.prompt, values, command.params);

    // Dry run - just show the prompt
    if (options.dryRun) {
      console.log(chalk.dim('--- Prompt to be sent ---'));
      console.log(prompt);
      console.log(chalk.dim('--- End of prompt ---'));
      return '';
    }

    // Execute the prompt
    const spinner = ora(`Sending to ${this.provider.displayName}...`).start();
    const startTime = Date.now();

    try {
      const response = await this.provider.executePrompt(prompt);
      const duration = Date.now() - startTime;

      spinner.succeed(chalk.green('Response received'));

      // Save to history
      if (this.history) {
        await this.history.add({
          command: commandName,
          params: options.params || {},
          prompt,
          response,
          duration,
        });
      }

      return response;
    } catch (error) {
      spinner.fail(chalk.red('Request failed'));
      throw error;
    }
  }

  private async getStdinInput(): Promise<string> {
    // Check if stdin has data (piped input)
    if (!process.stdin.isTTY) {
      const chunks: Buffer[] = [];

      for await (const chunk of process.stdin) {
        chunks.push(chunk as Buffer);
      }

      return Buffer.concat(chunks).toString('utf-8').trim();
    }

    return '';
  }

  listCommands(): void {
    console.log(chalk.bold('\nAvailable Commands:\n'));

    for (const command of this.config.commands) {
      console.log(chalk.cyan(`  ${command.name}`));
      if (command.description) {
        console.log(chalk.dim(`    ${command.description}`));
      }

      // Show parameters
      if (command.params && Object.keys(command.params).length > 0) {
        const paramInfo = Object.entries(command.params)
          .map(([name, def]) => {
            const alias = def.alias ? `-${def.alias}, ` : '';
            const defVal = def.default !== undefined ? ` (default: ${def.default})` : '';
            return `${alias}--${name}${defVal}`;
          })
          .join(', ');
        console.log(chalk.dim(`    Options: ${paramInfo}`));
      }

      console.log();
    }

    console.log(chalk.dim('Run "aiq <command> --help" for more details'));
  }

  async testCommand(commandName: string, testInput: string): Promise<void> {
    const command = this.config.commands.find((c) => c.name === commandName);

    if (!command) {
      throw new UserError(
        `Command '${commandName}' not found`,
        'Run "aiq list" to see available commands',
      );
    }

    console.log(chalk.bold('\nTesting command:'), commandName);
    console.log(chalk.dim('Input:'), testInput);

    const values: { input: string } & Record<string, unknown> = { input: testInput };

    // Add defaults for params
    if (command.params) {
      for (const [name, def] of Object.entries(command.params)) {
        if (def.default !== undefined) {
          values[name] = def.default;
        }
      }
    }

    const prompt = TemplateEngine.render(command.prompt, values, command.params);

    console.log(chalk.dim('\n--- Generated Prompt ---'));
    console.log(prompt);
    console.log(chalk.dim('--- End of Prompt ---\n'));

    const confirm = await this.promptUser(`Send this to ${this.provider.displayName}? (y/n): `);

    if (confirm.toLowerCase() === 'y') {
      const response = await this.run(commandName, { input: testInput });
      console.log(chalk.bold('\nResponse:'));
      console.log(response);
    }
  }

  private async promptUser(message: string): Promise<string> {
    process.stdout.write(message);

    return new Promise((resolve) => {
      process.stdin.once('data', (data) => {
        resolve(data.toString().trim());
      });
    });
  }
}
