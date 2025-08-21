import { Command } from 'commander';
import chalk from 'chalk';
import { HistoryManager } from '../lib/history-manager.js';
import { CommandRunner } from '../lib/command-runner.js';
import { Config, UserError } from '../types.js';

export function historyCommands(program: Command, runner: CommandRunner, config: Config): void {
  const history = program.command('history').description('Manage command history');

  history
    .command('show')
    .alias('list')
    .description('Show recent command history')
    .option('-n, --number <n>', 'Number of entries to show', '10')
    .action(async (options: { number: string }) => {
      try {
        await showHistory(parseInt(options.number), config);
      } catch (error) {
        handleError(error);
      }
    });

  history
    .command('search <query>')
    .description('Search command history')
    .action(async (query: string) => {
      try {
        await searchHistory(query, config);
      } catch (error) {
        handleError(error);
      }
    });

  history
    .command('clear')
    .description('Clear command history')
    .action(async () => {
      try {
        await clearHistory(config);
      } catch (error) {
        handleError(error);
      }
    });

  // Standalone last command
  program
    .command('last')
    .description('Show last command response')
    .action(async () => {
      try {
        await showLast(config);
      } catch (error) {
        handleError(error);
      }
    });

  // Standalone replay command
  program
    .command('replay <id>')
    .description('Replay a command from history')
    .action(async (id: string) => {
      try {
        await replayCommand(id, runner, config);
      } catch (error) {
        handleError(error);
      }
    });

  // Default history action
  history.action(async () => {
    try {
      await showHistory(10, config);
    } catch (error) {
      handleError(error);
    }
  });
}

async function showHistory(count: number, config: Config): Promise<void> {
  if (!config.history?.enabled) {
    console.log(chalk.yellow('History is disabled in config'));
    return;
  }

  const historyManager = new HistoryManager(config.history);
  const entries = await historyManager.getLast(count);

  if (entries.length === 0) {
    console.log(chalk.dim('No history yet'));
    return;
  }

  console.log(chalk.bold(`\nShowing last ${entries.length} commands:\n`));

  for (const entry of entries) {
    const date = new Date(entry.timestamp);
    const timeStr = date.toLocaleString();
    const paramStr =
      Object.keys(entry.params).length > 0 ? chalk.dim(` ${JSON.stringify(entry.params)}`) : '';

    console.log(chalk.cyan(`[${timeStr}]`));
    console.log(`  Command: ${chalk.bold(entry.command)}${paramStr}`);
    console.log(`  ID: ${chalk.dim(entry.id)}`);
    console.log(`  Duration: ${chalk.dim(entry.duration + 'ms')}`);

    // Show truncated prompt and response
    const maxLength = 100;
    const promptPreview =
      entry.prompt.length > maxLength ? entry.prompt.substring(0, maxLength) + '...' : entry.prompt;
    const responsePreview =
      entry.response.length > maxLength
        ? entry.response.substring(0, maxLength) + '...'
        : entry.response;

    console.log(`  Prompt: ${chalk.dim(promptPreview.replace(/\n/g, ' '))}`);
    console.log(`  Response: ${chalk.dim(responsePreview.replace(/\n/g, ' '))}`);
    console.log();
  }

  console.log(chalk.dim('Use "aiq replay <id>" to re-run a command'));
}

async function searchHistory(query: string, config: Config): Promise<void> {
  if (!config.history?.enabled) {
    console.log(chalk.yellow('History is disabled in config'));
    return;
  }

  const historyManager = new HistoryManager(config.history);
  const entries = await historyManager.search(query);

  if (entries.length === 0) {
    console.log(chalk.dim(`No results found for "${query}"`));
    return;
  }

  console.log(chalk.bold(`\nFound ${entries.length} matching entries:\n`));

  for (const entry of entries) {
    const date = new Date(entry.timestamp);
    console.log(chalk.cyan(`[${date.toLocaleString()}] ${entry.command}`));
    console.log(`  ID: ${chalk.dim(entry.id)}`);

    // Highlight matching parts
    const promptMatch = entry.prompt.toLowerCase().includes(query.toLowerCase());
    const responseMatch = entry.response.toLowerCase().includes(query.toLowerCase());

    if (promptMatch) {
      const excerpt = getExcerpt(entry.prompt, query);
      console.log(`  Prompt: ${chalk.yellow(excerpt)}`);
    }

    if (responseMatch) {
      const excerpt = getExcerpt(entry.response, query);
      console.log(`  Response: ${chalk.yellow(excerpt)}`);
    }

    console.log();
  }
}

async function clearHistory(config: Config): Promise<void> {
  if (!config.history?.enabled) {
    console.log(chalk.yellow('History is disabled in config'));
    return;
  }

  // Confirm before clearing
  console.log(chalk.yellow('⚠️  This will delete all command history'));
  process.stdout.write('Are you sure? (y/N): ');

  const answer = await new Promise<string>((resolve) => {
    process.stdin.once('data', (data) => {
      resolve(data.toString().trim().toLowerCase());
    });
  });

  if (answer !== 'y') {
    console.log(chalk.dim('Cancelled'));
    return;
  }

  const historyManager = new HistoryManager(config.history);
  await historyManager.clear();
  console.log(chalk.green('✅ History cleared'));
}

async function showLast(config: Config): Promise<void> {
  if (!config.history?.enabled) {
    console.log(chalk.yellow('History is disabled in config'));
    return;
  }

  const historyManager = new HistoryManager(config.history);
  const last = await historyManager.getLastResponse();

  if (!last) {
    console.log(chalk.dim('No previous commands in history'));
    return;
  }

  const date = new Date(last.timestamp);
  console.log(chalk.dim(`\nLast command: ${last.command} (${date.toLocaleString()})\n`));
  console.log(last.response);
}

async function replayCommand(id: string, runner: CommandRunner, config: Config): Promise<void> {
  if (!config.history?.enabled) {
    throw new UserError('History is disabled in config');
  }

  const historyManager = new HistoryManager(config.history);
  const entry = await historyManager.getById(id);

  if (!entry) {
    throw new UserError(
      `Command with ID '${id}' not found`,
      'Use "aiq history" to see available IDs',
    );
  }

  console.log(chalk.dim(`Replaying command: ${entry.command}`));
  console.log(chalk.dim(`Original prompt:\n${entry.prompt}\n`));

  // Extract input from the original prompt
  // This is a simplified approach - might need refinement
  const command = config.commands.find((c) => c.name === entry.command);
  if (!command) {
    throw new UserError(`Command '${entry.command}' no longer exists in config`);
  }

  // Re-run with same parameters
  const result = await runner.run(entry.command, {
    params: entry.params,
    input: entry.prompt, // Use the rendered prompt as input
  });

  console.log(chalk.bold('\nNew response:'));
  console.log(result);
}

function getExcerpt(text: string, query: string, contextLength: number = 50): string {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) return text.substring(0, 100) + '...';

  const start = Math.max(0, index - contextLength);
  const end = Math.min(text.length, index + query.length + contextLength);

  let excerpt = text.substring(start, end);
  if (start > 0) excerpt = '...' + excerpt;
  if (end < text.length) excerpt = excerpt + '...';

  return excerpt.replace(/\n/g, ' ');
}

function handleError(error: unknown): void {
  if (error instanceof UserError) {
    console.error(chalk.red(`✖ ${error.message}`));
    if (error.hint) {
      console.error(chalk.yellow(`  💡 ${error.hint}`));
    }
  } else {
    console.error(chalk.red('✖ Error:'), (error as Error).message);
  }
  process.exit(1);
}
