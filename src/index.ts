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

const program = new Command();

// Load package.json for version
const packageJson = JSON.parse(
  await fs.readFile(
    path.join(path.dirname(new URL(import.meta.url).pathname), '../package.json'),
    'utf-8',
  ),
);

program
  .name('aiq')
  .description('A lightweight CLI tool for reusable AI prompts')
  .version(packageJson.version);

// Add subcommands
configCommands(program);
historyCommands(program);
addCommand(program);

// List command
program
  .command('list')
  .alias('ls')
  .description('List all available commands')
  .action(async () => {
    try {
      const configManager = ConfigManager.getInstance();
      const config = await configManager.load();
      const runner = new CommandRunner(config);
      await runner.listCommands();
    } catch (error) {
      handleError(error);
    }
  });

// Test command
program
  .command('test <command>')
  .description('Test a command with sample input')
  .action(async (commandName) => {
    try {
      const configManager = ConfigManager.getInstance();
      const config = await configManager.load();
      const runner = new CommandRunner(config);

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
  .action(async (commandName, inputArgs, options) => {
    await runCommand(commandName, inputArgs, options);
  });

// Default action - handle direct command calls
program
  .arguments('<command> [input...]')
  .allowUnknownOption()
  .action(async (commandName, inputArgs, options) => {
    // Check if it's a built-in command first
    const builtInCommands = ['config', 'history', 'add', 'list', 'test'];
    if (!builtInCommands.includes(commandName)) {
      await runCommand(commandName, inputArgs, options);
    }
  });

async function runCommand(commandName: string, inputArgs: string[], options: any) {
  try {
    const configManager = ConfigManager.getInstance();
    const config = await configManager.load();
    const command = config.commands.find((c) => c.name === commandName);

    if (!command) {
      console.error(chalk.red(`Error: Command '${commandName}' not found`));
      console.error(chalk.dim('Run "aiq list" to see available commands'));
      process.exit(1);
    }

    const runner = new CommandRunner(config);

    // Parse command-specific options
    const params: Record<string, any> = {};

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
      dryRun: options.dryRun,
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

function handleError(error: any): void {
  if (error instanceof UserError) {
    console.error(chalk.red(`✖ ${error.message}`));
    if (error.hint) {
      console.error(chalk.yellow(`  💡 ${error.hint}`));
    }
  } else {
    console.error(chalk.red('✖ Unexpected error:'), error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    } else {
      console.error(chalk.dim('Run with DEBUG=1 for stack trace'));
    }
  }
  process.exit(1);
}

// Parse arguments
program.parse(process.argv);

// Show help if no arguments
if (process.argv.length === 2) {
  program.help();
}
