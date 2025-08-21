import { Command } from 'commander';
import chalk from 'chalk';
import { ConfigManager } from './lib/config-manager.js';
import { CommandRunner } from './lib/command-runner.js';
import { UserError } from './types.js';
import { configCommands } from './commands/config.js';
import { historyCommands } from './commands/history.js';
import { addCommand } from './commands/add.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { IAiProvider, resolveProvider } from './lib/providers';

interface RunCommandOptions {
  dryRun?: boolean;
  [key: string]: unknown; // For unknown options
}

async function main(): Promise<void> {
  //////////////////////////////////
  ////     Initialize
  //////////////////////////////////
  const program = new Command();
  const configManager = ConfigManager.getInstance();
  const config = await configManager.load();
  let provider: IAiProvider;
  let runner: CommandRunner;
  if (config) {
    provider = resolveProvider(config.provider);
    runner = new CommandRunner(config, provider);
  }

  // Get Version For Display
  const packageJson = JSON.parse(
    await fs.readFile(
      path.join(path.dirname(new URL(import.meta.url).pathname), '../package.json'),
      'utf-8',
    ),
  ) as { version: string };

  program
    .name('aiq')
    .description('A lightweight CLI tool for reusable AI prompts')
    .version(packageJson.version);

  //////////////////////////////////
  ////   Add subcommands
  //////////////////////////////////
  if (config && runner && provider) {
    configCommands(program, configManager, config, provider);
    historyCommands(program, runner, config);
    addCommand(program, config);
  }

  // List command
  program
    .command('list')
    .alias('ls')
    .description('List all available commands')
    .action(() => {
      try {
        runner.listCommands();
      } catch (error) {
        handleError(error);
      }
    });

  // Test command
  program
    .command('test <command>')
    .description('Test a command with sample input')
    .action(async (commandName: string) => {
      try {
        const testInput = await promptForInput('Enter test input: ');
        await runner.testCommand(commandName, testInput);
      } catch (error) {
        handleError(error);
      }
    });

  // Dynamic command handling
  program
    .command('run <command> [input...]')
    .description('Run a configured command')
    .option('-d, --dry-run', 'Show the prompt without sending')
    .allowUnknownOption()
    .action(async (commandName: string, inputArgs: string[], options: RunCommandOptions) => {
      await runCommand(commandName, inputArgs, options);
    });

  // Default action - handle direct command calls
  program
    .arguments('<command> [input...]')
    .allowUnknownOption()
    .action(async (commandName: string, inputArgs: string[], options: RunCommandOptions) => {
      // Check if it's a built-in command first
      const builtInCommands = ['config', 'history', 'add', 'list', 'test'];
      if (!builtInCommands.includes(commandName)) {
        await runCommand(commandName, inputArgs, options);
      }
    });

  async function runCommand(
    commandName: string,
    inputArgs: string[],
    options: RunCommandOptions,
  ): Promise<void> {
    try {
      const command = config.commands.find((c) => c.name === commandName);

      if (!command) {
        console.error(chalk.red(`Error: Command '${commandName}' not found`));
        console.error(chalk.dim('Run "aiq list" to see available commands'));
        process.exit(1);
      }

      // Parse command-specific options
      const params: Record<string, unknown> = {};

      // Process options for this command
      if (command.params) {
        for (const [paramName, paramDef] of Object.entries(command.params)) {
          // Check for long form --paramName
          if (options[paramName] !== undefined) {
            params[paramName] = options[paramName];
          }
          // Check for short form -alias
          else if (paramDef.alias && options[paramDef.alias] !== undefined) {
            params[paramName] = options[paramDef.alias];
          }
        }
      }

      // Get input from args or stdin
      const input = inputArgs.length > 0 ? inputArgs.join(' ') : undefined;

      const result = await runner.run(commandName, {
        dryRun: options.dryRun as boolean,
        params,
        input,
      });

      if (result) {
        console.log(result);
      }
    } catch (error) {
      handleError(error);
    }
  }

  async function promptForInput(message: string): Promise<string> {
    process.stdout.write(chalk.cyan(message));

    return new Promise((resolve) => {
      process.stdin.once('data', (data) => {
        resolve(data.toString().trim());
      });
    });
  }

  function handleError(error: unknown): void {
    if (error instanceof UserError) {
      console.error(chalk.red(`✖ ${error.message}`));
      if (error.hint) {
        console.error(chalk.yellow(`  💡 ${error.hint}`));
      }
    } else {
      console.error(chalk.red('✖ Unexpected error:'), (error as Error).message);
      if (process.env.DEBUG) {
        console.error((error as Error).stack);
      } else {
        console.error(chalk.dim('Run with DEBUG=1 for stack trace'));
      }
    }
    process.exit(1);
  }

  program.parse(process.argv);

  // Show help if no arguments
  if (process.argv.length === 2) {
    program.help();
  }
}

/******************
 * RUN THE PROGRAM
 ******************/
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
