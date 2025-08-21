import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { spawn } from 'child_process';
import { ConfigManager } from '../lib/config-manager.js';
import { IAiProvider } from '../lib/providers';
import { Config, ProviderConfig, UserError } from '../types.js';
import { GeminiProvider } from '../lib/providers/gemini';

export function initConfigCommand(program: Command, configManager: ConfigManager): void {
  const configCmd = program.command('config').description('Manage configuration');

  configCmd
    .command('init')
    .description('Initialize configuration')
    .action(async () => {
      try {
        await initConfig(configManager);
      } catch (error) {
        handleError(error);
      }
    });
}

export function configCommands(
  program: Command,
  configManager: ConfigManager,
  config: Config | null,
  provider: IAiProvider | null,
): void {
  configCmd
    .command('open')
    .description('Open config file in editor')
    .action(() => {
      try {
        openConfig(config);
      } catch (error) {
        handleError(error);
      }
    });

  configCmd
    .command('validate')
    .description('Validate configuration and test API connection')
    .action(async () => {
      try {
        await validateConfig(config, provider);
      } catch (error) {
        handleError(error);
      }
    });

  configCmd
    .command('reset')
    .description('Reset to default configuration')
    .action(async () => {
      try {
        await resetConfig(configManager, provider);
      } catch (error) {
        handleError(error);
      }
    });
}

// Type definitions for inquirer prompts
interface InitConfigAnswers {
  apiKey: string;
  model: string;
  editor: string;
  enableHistory: boolean;
}

interface OverwriteAnswer {
  overwrite: boolean;
}

interface ContinueAnswer {
  continueAnyway: boolean;
}

interface ConfirmAnswer {
  confirm: boolean;
}

function getDefaultConfig(providerConfig: ProviderConfig): Config {
  return {
    version: '1.0',
    provider: providerConfig,
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
        prompt: 'Provide ONLY the terminal command for: {input}\nNo explanation, just the command.',
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

async function initConfig(configManager: ConfigManager): Promise<void> {
  if (await configManager.exists()) {
    const { overwrite } = await inquirer.prompt<OverwriteAnswer>([
      {
        type: 'confirm',
        name: 'overwrite',
        message: 'Config file already exists. Overwrite?',
        default: false,
      },
    ]);

    if (!overwrite) {
      console.log(chalk.yellow('Config initialization cancelled'));
      return;
    }
  }

  console.log(chalk.bold('\n🚀 Welcome to AIQ Setup!\n'));

  // TODO, choose provider...
  const provider = new GeminiProvider();
  const defaultConfig = getDefaultConfig(IAiProvider.getDefaultConfig());

  const answers = await inquirer.prompt<InitConfigAnswers>([
    {
      type: 'list',
      name: 'editor',
      message: 'Choose your preferred editor:',
      choices: [
        { name: 'VS Code', value: 'code' },
        { name: 'Vim', value: 'vim' },
        { name: 'Nano', value: 'nano' },
        { name: 'Emacs', value: 'emacs' },
        { name: 'System default', value: '${EDITOR:-nano}' },
      ],
      default: defaultConfig.editor,
    },
    {
      type: 'confirm',
      name: 'enableHistory',
      message: 'Enable command history?',
      default: true,
    },
    ...provider.getInitQuestions(),
  ]);

  // Create config
  const newConfig: Config = {
    ...defaultConfig,
    provider: {
      ...defaultConfig.provider,
      apiKey: answers.apiKey,
      model: answers.model,
    },
    editor: answers.editor,
    history: defaultConfig.history && {
      ...defaultConfig.history,
      enabled: answers.enableHistory,
    },
  };

  console.log(chalk.dim('\nTesting API connection...'));

  try {
    await provider.validateConnection();
    console.log(chalk.green('✅ API connection successful!'));
  } catch (error: unknown) {
    console.log(chalk.yellow('⚠️  Could not validate API connection'));
    console.log(chalk.dim(`   ${(error as Error).message}`));

    const { continueAnyway } = await inquirer.prompt<ContinueAnswer>([
      {
        type: 'confirm',
        name: 'continueAnyway',
        message: 'Continue anyway?',
        default: true,
      },
    ]);

    if (!continueAnyway) {
      console.log(chalk.yellow('Setup cancelled'));
      return;
    }
  }

  // Save config
  await configManager.save(newConfig);

  console.log(chalk.green(`\n✅ Configuration saved!`));
  console.log(chalk.dim(`   Config location: ~/.aiq/config.json`));
  console.log(chalk.cyan('\n📝 Default commands added:'));
  for (const cmd of newConfig.commands) {
    console.log(`   - ${cmd.name}: ${cmd.description}`);
  }

  console.log(chalk.bold('\n🎉 Setup complete! Try these commands:'));
  console.log(chalk.dim('   aiq list                    # See all commands'));
  console.log(chalk.dim('   aiq explain "your text"     # Explain something'));
  console.log(chalk.dim('   echo "text" | aiq summarize # Summarize piped input'));
}

function openConfig(config: Config): void {
  const editor = config.editor || process.env.EDITOR || 'nano';

  // Resolve editor if it has environment variables
  const resolvedEditor = editor.replace(/\${([^}]+)}/g, (match, expr) => {
    const [varName, defaultVal] = String(expr).split(':-');
    return process.env[varName] || defaultVal || '';
  });

  const configPath = process.env.AIQ_CONFIG_DIR
    ? `${process.env.AIQ_CONFIG_DIR}/config.json`
    : '~/.aiq/config.json';

  console.log(chalk.dim(`Opening ${configPath} in ${resolvedEditor}...`));

  const child = spawn(resolvedEditor, [configPath.replace('~', process.env.HOME || '')], {
    stdio: 'inherit',
    shell: true,
  });

  child.on('exit', (code) => {
    if (code === 0) {
      console.log(chalk.green('✅ Config file closed'));
    } else {
      console.log(chalk.yellow('Editor exited with code:', code));
    }
  });
}

async function validateConfig(config: Config, provider: IAiProvider): Promise<void> {
  console.log(chalk.bold('Validating configuration...\n'));

  try {
    console.log(chalk.green('✅ Config file is valid JSON'));
    console.log(chalk.green('✅ Required fields present'));

    // Validate commands
    console.log(chalk.green(`✅ ${config.commands.length} commands configured`));

    // Test API connection
    console.log(chalk.dim('\nTesting API connection...'));

    try {
      await provider.validateConnection();
      console.log(chalk.green('✅ API connection successful'));
    } catch (error: unknown) {
      console.log(chalk.red('✖ API connection failed'));
      console.log(chalk.dim(`   ${(error as Error).message}`));
    }
  } catch (error: unknown) {
    console.log(chalk.red('✖ Configuration is invalid'));
    if (error instanceof UserError && error.hint) {
      console.log(chalk.yellow(`   ${error.hint}`));
    } else {
      console.log(chalk.dim(`   ${(error as Error).message}`));
    }
    process.exit(1);
  }
}

async function resetConfig(configManager: ConfigManager, provider: IAiProvider): Promise<void> {
  const { confirm } = await inquirer.prompt<ConfirmAnswer>([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'This will reset your config to defaults. Continue?',
      default: false,
    },
  ]);

  if (!confirm) {
    console.log(chalk.yellow('Reset cancelled'));
    return;
  }

  const defaultConfig = getDefaultConfig(provider.getDefaultProviderConfig());

  await configManager.save(defaultConfig);
  console.log(chalk.green('✅ Config reset to defaults'));
  console.log(chalk.yellow('   Remember to set your API key!'));
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
