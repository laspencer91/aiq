import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { spawn } from 'child_process';
import { ConfigManager } from '../lib/config-manager.js';
import { GeminiProvider } from '../lib/providers';
import { UserError } from '../types.js';
import { resolveProvider } from '../lib/providers';

export function configCommands(program: Command): void {
  const config = program.command('config').description('Manage configuration');

  config
    .command('init')
    .description('Initialize configuration')
    .action(async () => {
      try {
        await initConfig();
      } catch (error) {
        handleError(error);
      }
    });

  config
    .command('open')
    .description('Open config file in editor')
    .action(async () => {
      try {
        await openConfig();
      } catch (error) {
        handleError(error);
      }
    });

  config
    .command('validate')
    .description('Validate configuration and test API connection')
    .action(async () => {
      try {
        await validateConfig();
      } catch (error) {
        handleError(error);
      }
    });

  config
    .command('reset')
    .description('Reset to default configuration')
    .action(async () => {
      try {
        await resetConfig();
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

async function initConfig(): Promise<void> {
  const configManager = ConfigManager.getInstance();

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

  const answers = await inquirer.prompt<InitConfigAnswers>([
    {
      type: 'input',
      name: 'apiKey',
      message: 'Enter your Gemini API key:',
      validate: (input: string) => {
        if (!input) {
          return 'API key is required';
        }
        if (input.length < 20) {
          return "That doesn't look like a valid API key";
        }
        return true;
      },
      transformer: (input: string) => {
        // Hide the API key as it's typed
        return input.replace(/./g, '*');
      },
    },
    {
      type: 'list',
      name: 'model',
      message: 'Select Gemini model:',
      choices: [
        { name: 'Gemini 2.0 Flash (Recommended)', value: 'gemini-2.0-flash' },
        { name: 'Gemini 2.5 Flash Lite (Faster)', value: 'gemini-2.5-flash-lite' },
        { name: 'Gemini 1.5 Pro (More capable)', value: 'gemini-1.5-pro' },
      ],
      default: 'gemini-2.0-flash',
    },
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
      default: '${EDITOR:-nano}',
    },
    {
      type: 'confirm',
      name: 'enableHistory',
      message: 'Enable command history?',
      default: true,
    },
  ]);

  // Create config
  const defaultConfig = configManager.getDefaultConfig();
  const newConfig = {
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

  // Test the API connection
  console.log(chalk.dim('\nTesting API connection...'));
  const provider = new GeminiProvider(newConfig.provider);

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

async function openConfig(): Promise<void> {
  const configManager = ConfigManager.getInstance();

  if (!(await configManager.exists())) {
    throw new UserError('Config file not found', 'Run "aiq config init" first');
  }

  const config = await configManager.load();
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

async function validateConfig(): Promise<void> {
  const configManager = ConfigManager.getInstance();

  console.log(chalk.bold('Validating configuration...\n'));

  try {
    const config = await configManager.load();
    console.log(chalk.green('✅ Config file is valid JSON'));
    console.log(chalk.green('✅ Required fields present'));

    // Check for API key
    const provider = resolveProvider(config.provider);

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

async function resetConfig(): Promise<void> {
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

  const configManager = ConfigManager.getInstance();
  const defaultConfig = configManager.getDefaultConfig();

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
