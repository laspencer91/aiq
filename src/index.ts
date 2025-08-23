#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { ConfigManager } from './lib/config-manager';
import { CommandRunner } from './lib/command-runner';
import { UserError } from './types';
import { historyCommands } from './commands/history';
import { addCommand } from './commands/add';
import * as fs from 'fs';
import * as path from 'path';
import { IAiProvider, resolveProvider } from './lib/providers';
import { ConfigCommandModule } from './commands/config';

interface RunCommandOptions {
  dryRun?: boolean;
  [key: string]: unknown; // For unknown options
}

//////////////////////////////////
////     Initialize
//////////////////////////////////
const program = new Command();
const configManager = ConfigManager.getInstance();
const config = configManager.load();
let provider: IAiProvider | null = null;
let runner: CommandRunner | null = null;
if (config) {
  provider = resolveProvider(config.provider);
  runner = new CommandRunner(config, provider);
}

// Get Version For Display
const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8'),
) as { version: string };

program
  .name('aiq')
  .description('A lightweight CLI tool for reusable AI prompts')
  .version(packageJson.version);

//////////////////////////////////
////   Add subcommands
//////////////////////////////////
ConfigCommandModule.init(program, configManager);

if (runner && config) {
  historyCommands(program, runner, config);
}
if (config) {
  addCommand(program, config);
}

// List command
program
  .command('list')
  .alias('ls')
  .description('List all available commands')
  .action(() => {
    try {
      if (!runner) {
        console.error(chalk.red('No runner found. Cannot list commands.'));
        process.exit(1);
      }
      runner.listCommands();
    } catch (error) {
      handleError(error);
    }
  });

// Dynamic command handling
program
  .command('run <command> [input...]')
  .description('Run a configured command')
  .option('-d, --dry-run', 'Show the prompt without sending')
  .option('-c, --copy', 'Copy response to clipboard')
  .allowUnknownOption()
  .action(async (commandName: string, inputArgs: string[], options: RunCommandOptions) => {
    await runCommand(commandName, inputArgs, options);
  });

// Create dynamic commands for each configured command
if (config && config.commands) {
  for (const commandDef of config.commands) {
    const cmd = program
      .command(`${commandDef.name} [input...]`)
      .description(commandDef?.description ?? 'No description provided')
      .option('-d, --dry-run', 'Show the prompt without sending')
      .option('-c, --copy', 'Copy response to clipboard');

    // Add parameter-specific options
    if (commandDef.params) {
      for (const [paramName, paramDef] of Object.entries(commandDef.params)) {
        const flag = paramDef.alias ? `-${paramDef.alias}, --${paramName}` : `--${paramName}`;

        const description = paramDef.description || `${paramName} parameter`;

        if (paramDef.type === 'boolean') {
          cmd.option(flag, description);
        } else {
          cmd.option(`${flag} <value>`, description);
        }
      }
    }

    cmd.action(async (inputArgs: string[], options: RunCommandOptions) => {
      await runCommand(commandDef.name, inputArgs, options);
    });
  }
}

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
    if (!config) {
      console.error(chalk.red('No config found. Please ensure a config file exists.'));
      process.exit(1);
    }

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

    if (!runner) {
      console.error(chalk.red('No runner found. Please ensure a provider is properly registered.'));
      process.exit(1);
    }

    const result = await runner.run(commandName, {
      dryRun: options.dryRun as boolean,
      copy: options.copy as boolean,
      params,
      input,
    });

    if (result) {
      console.log(chalk.cyan(result));
    }
  } catch (error) {
    handleError(error);
  }
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
