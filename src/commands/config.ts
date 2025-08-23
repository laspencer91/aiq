import chalk from 'chalk';
import inquirer, { DistinctQuestion } from 'inquirer';
import { spawn } from 'child_process';
import { BaseProviderConfig, Config, UserError } from '../types.js';
import { CommandModule } from './command-module';
import { ProviderDiscovery } from '../lib/providers/provider-discovery';

// Type definitions for inquirer prompts
interface ProviderChoice {
  provider: string;
}

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

export class ConfigCommandModule extends CommandModule {
  protected registerCommands(): void {
    const configCmd = this.program.command('config').description('Manage configuration');

    configCmd
      .command('init')
      .description('Initialize configuration')
      .action(async () => {
        try {
          await this.initConfig();
        } catch (error) {
          this.handleError(error);
        }
      });

    configCmd
      .command('open')
      .description('Open config file in editor')
      .action(() => {
        try {
          this.openConfig();
        } catch (error) {
          this.handleError(error);
        }
      });

    configCmd
      .command('validate')
      .description('Validate configuration and test API connection')
      .action(async () => {
        try {
          await this.validateConfig();
        } catch (error) {
          this.handleError(error);
        }
      });

    configCmd
      .command('reset')
      .description('Reset to default configuration')
      .action(async () => {
        try {
          await this.resetConfig();
        } catch (error) {
          this.handleError(error);
        }
      });
  }

  private async initConfig(): Promise<void> {
    if (this.configManager.exists()) {
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

    // Get available providers
    const availableProviders = ProviderDiscovery.list();

    if (availableProviders.length === 0) {
      console.error(
        chalk.red(
          'Cant init. No AI providers available. Please ensure providers are properly registered.',
        ),
      );
      process.exit(1);
    }

    // Let user choose a provider
    const { provider: selectedProviderId } = await inquirer.prompt<ProviderChoice>([
      {
        type: 'list',
        name: 'provider',
        message: 'Choose your AI provider:',
        choices: availableProviders.map((id) => {
          const metadata = ProviderDiscovery.getMetadata(id);
          return {
            name: metadata?.displayName || id,
            value: id,
          };
        }),
      },
    ]);

    // Get the selected provider's metadata and create an instance
    const providerMetadata = ProviderDiscovery.getMetadata(selectedProviderId);
    const defaultProviderConfig = providerMetadata?.defaultConfig || { name: selectedProviderId };

    // Create a temporary provider instance to get init questions
    const tempProvider = ProviderDiscovery.get(selectedProviderId, defaultProviderConfig);

    // Get base configuration
    const defaultConfig = this.getDefaultConfig(defaultProviderConfig);

    // Base questions
    const baseQuestions = [
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
    ];

    // Get provider-specific questions if the provider has them
    let providerQuestions: DistinctQuestion[] = [];
    if ('getInitQuestions' in tempProvider && typeof tempProvider.getInitQuestions === 'function') {
      providerQuestions = tempProvider.getInitQuestions();
    } else {
      // Default questions for providers without custom init
      providerQuestions = [
        {
          type: 'password',
          name: 'apiKey',
          message: `Enter your ${providerMetadata?.displayName || selectedProviderId} API key:`,
          validate: (input: string) => input.length > 0 || 'API key is required',
        },
        {
          type: 'input',
          name: 'model',
          message: 'Enter the model to use:',
          default: defaultProviderConfig.model || '',
        },
      ];
    }

    const answers = await inquirer.prompt<InitConfigAnswers>([
      ...baseQuestions,
      ...providerQuestions,
    ]);

    // Create the provider config
    const providerConfig: BaseProviderConfig = {
      ...defaultProviderConfig,
    };

    // Apply answers to provider config
    for (const [key, value] of Object.entries(answers)) {
      if (key !== 'editor' && key !== 'enableHistory') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        providerConfig[key as keyof BaseProviderConfig] = value;
      }
    }

    // Create full config
    const newConfig: Config = {
      ...defaultConfig,
      provider: providerConfig,
      editor: answers.editor,
      history: defaultConfig.history && {
        ...defaultConfig.history,
        enabled: answers.enableHistory,
      },
    };

    console.log(chalk.dim('\nTesting API connection...'));

    // Create provider with the configured settings for validation
    const provider = ProviderDiscovery.get(selectedProviderId, providerConfig);

    try {
      if ('validateConnection' in provider && typeof provider.validateConnection === 'function') {
        await provider.validateConnection();
        console.log(chalk.green('✅ API connection successful!'));
      } else {
        console.log(chalk.yellow('⚠️  Provider does not support connection validation'));
      }
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
    this.configManager.save(newConfig);

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

  private getDefaultConfig(providerConfig: BaseProviderConfig): Config {
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
          prompt:
            'Provide ONLY the terminal command for: {input}\nNo explanation, just the command. No formatting. Raw text only.',
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

  private async validateConfig(): Promise<void> {
    console.log(chalk.bold('Validating configuration...\n'));

    try {
      const config = this.configManager.get();

      if (!config) {
        console.log(chalk.red('✖ Config file not found'));
        process.exit(1);
      }

      console.log(chalk.green('✅ Config file is valid JSON'));
      console.log(chalk.green('✅ Required fields present'));

      // Validate commands
      console.log(chalk.green(`✅ ${config.commands.length} commands configured`));

      // Test API connection with the configured provider
      const providerName = config.provider.name;

      if (!ProviderDiscovery.has(providerName)) {
        console.log(chalk.red(`✖ Provider "${providerName}" not found`));
        console.log(chalk.yellow(`   Available providers: ${ProviderDiscovery.list().join(', ')}`));
        process.exit(1);
      }

      const provider = ProviderDiscovery.get(providerName, config.provider);
      console.log(chalk.dim('\nTesting API connection...'));

      try {
        if ('validateConnection' in provider && typeof provider.validateConnection === 'function') {
          await provider.validateConnection();
          console.log(chalk.green('✅ API connection successful'));
        } else {
          console.log(chalk.yellow('⚠️  Provider does not support connection validation'));
        }
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

  private async resetConfig(): Promise<void> {
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

    // Ask which provider to use for the reset config
    const availableProviders = ProviderDiscovery.list();

    if (availableProviders.length === 0) {
      console.error(chalk.red('No AI providers available.'));
      process.exit(1);
    }

    const { provider: selectedProviderId } = await inquirer.prompt<ProviderChoice>([
      {
        type: 'list',
        name: 'provider',
        message: 'Choose provider for default config:',
        choices: availableProviders.map((id) => {
          const metadata = ProviderDiscovery.getMetadata(id);
          return {
            name: metadata?.displayName || id,
            value: id,
          };
        }),
      },
    ]);

    const providerMetadata = ProviderDiscovery.getMetadata(selectedProviderId);
    const defaultProviderConfig = providerMetadata?.defaultConfig || { name: selectedProviderId };
    const defaultConfig = this.getDefaultConfig(defaultProviderConfig);

    this.configManager.save(defaultConfig);
    console.log(chalk.green('✅ Config reset to defaults'));
    console.log(chalk.yellow('   Remember to set your API key!'));
  }

  private listProviders(): void {
    const providers = ProviderDiscovery.list();

    if (providers.length === 0) {
      console.log(chalk.yellow('No AI providers registered'));
      return;
    }

    console.log(chalk.bold('\nAvailable AI Providers:\n'));

    for (const id of providers) {
      const metadata = ProviderDiscovery.getMetadata(id);
      console.log(chalk.cyan(`• ${metadata?.displayName || id}`));
      console.log(chalk.dim(`  ID: ${id}`));

      if (metadata?.defaultConfig) {
        const config = metadata.defaultConfig;
        if (config.model) {
          console.log(chalk.dim(`  Default model: ${config.model}`));
        }
      }
      console.log();
    }
  }

  private openConfig(): void {
    const config = this.configManager.get();
    const editor = config?.editor || process.env.EDITOR || 'nano';

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

  private handleError(error: unknown): void {
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
}
