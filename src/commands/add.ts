import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { ConfigManager } from '../lib/config-manager';
import { UserError, ParamDef, CommandDef, Config } from '../types';

interface BasicCommandInfo {
  name: string;
  description: string;
  prompt: string;
}

interface AddParamsAnswer {
  addParams: boolean;
}

interface ParamConfigAnswers {
  type: 'string' | 'number' | 'boolean';
  description: string;
  default: string;
  alias: string;
  required: boolean;
  hasChoices?: boolean;
  choices?: string[];
}

interface TestCommandAnswer {
  testCommand: boolean;
}

interface TestInputAnswer {
  testInput: string;
}

interface ConfirmSaveAnswer {
  confirmSave: boolean;
}

interface EditActionAnswer {
  action: 'prompt' | 'description' | 'params' | 'rename' | 'cancel';
}

interface NewPromptAnswer {
  newPrompt: string;
}

interface NewDescriptionAnswer {
  newDesc: string;
}

interface NewNameAnswer {
  newName: string;
}

interface ConfirmRemoveAnswer {
  confirm: boolean;
}

export function addCommand(program: Command, config: Config): void {
  program
    .command('add')
    .description('Add a new command interactively')
    .action(async () => {
      try {
        await addNewCommand(config);
      } catch (error) {
        handleError(error);
      }
    });

  program
    .command('edit <command>')
    .description('Edit an existing command')
    .action(async (commandName: string) => {
      try {
        await editCommand(commandName, config);
      } catch (error) {
        handleError(error);
      }
    });

  program
    .command('remove <command>')
    .alias('rm')
    .description('Remove a command')
    .action(async (commandName: string) => {
      try {
        await removeCommand(commandName, config);
      } catch (error) {
        handleError(error);
      }
    });
}

async function addNewCommand(config: Config): Promise<void> {
  console.log(chalk.bold('\n📝 Creating new command...\n'));

  const basicInfo = await inquirer.prompt<BasicCommandInfo>([
    {
      type: 'input',
      name: 'name',
      message: 'Command name:',
      validate: (input: string | undefined | null) => {
        if (!input) return 'Name is required';
        if (!/^[a-z][a-z0-9-]*$/.test(input)) {
          return 'Use lowercase letters, numbers, and hyphens (start with letter)';
        }
        return true;
      },
    },
    {
      type: 'input',
      name: 'description',
      message: 'Description (optional):',
    },
    {
      type: 'editor',
      name: 'prompt',
      message: 'Enter the prompt template:',
      default:
        '# Use {input} for user input (optional - will be appended if not included)\n# Use {paramName} for parameters\n# Example: Translate this {language} code to {target}:\n#\n# {input}\n\n',
    },
  ]);

  if (config.commands.find((c) => c.name === basicInfo.name)) {
    throw new UserError(
      `Command '${basicInfo.name}' already exists`,
      'Use "aiq edit" to modify it',
    );
  }

  // Clean up the prompt (remove comment lines)
  const cleanPrompt = basicInfo.prompt
    .split('\n')
    .filter((line: string) => !line.trim().startsWith('#'))
    .join('\n')
    .trim();

  // Extract parameter names from prompt
  const paramNames = extractParamNames(cleanPrompt);
  const userParams = paramNames.filter((p) => p !== 'input');

  // Build command object
  const newCommand: CommandDef = {
    name: basicInfo.name,
    description: basicInfo.description || undefined,
    prompt: cleanPrompt,
  };

  // Add parameters if any were found
  if (userParams.length > 0) {
    const { addParams } = await inquirer.prompt<AddParamsAnswer>([
      {
        type: 'confirm',
        name: 'addParams',
        message: `Found parameters: ${userParams.join(', ')}. Configure them?`,
        default: true,
      },
    ]);

    if (addParams) {
      newCommand.params = {};

      for (const paramName of userParams) {
        console.log(chalk.cyan(`\nConfiguring parameter: ${paramName}`));

        const paramConfig = await inquirer.prompt<ParamConfigAnswers>([
          {
            type: 'list',
            name: 'type',
            message: 'Parameter type:',
            choices: ['string', 'number', 'boolean'],
            default: 'string',
          },
          {
            type: 'input',
            name: 'description',
            message: 'Description (optional):',
          },
          {
            type: 'input',
            name: 'default',
            message: 'Default value (optional):',
            filter: (input: string, answers) => {
              if (!input) return undefined;
              if (answers?.type === 'number') return Number(input);
              if (answers?.type === 'boolean') return input.toLowerCase() === 'true';
              return input;
            },
          },
          {
            type: 'input',
            name: 'alias',
            message: 'Short alias (single letter, optional):',
            validate: (input: string) => {
              if (!input) return true;
              if (!/^[a-z]$/i.test(input)) {
                return 'Alias must be a single letter';
              }
              return true;
            },
          },
          {
            type: 'confirm',
            name: 'required',
            message: 'Is this parameter required?',
            default: false,
          },
          {
            type: 'confirm',
            name: 'hasChoices',
            message: 'Add predefined choices?',
            default: false,
            when: (answers) => answers.type === 'string',
          },
          {
            type: 'input',
            name: 'choices',
            message: 'Enter choices (comma-separated):',
            when: (answers) => answers.hasChoices,
            filter: (input: string) => input.split(',').map((s: string) => s.trim()),
            validate: (input: string[]) => {
              if (input.length === 0) return 'At least one choice required';
              return true;
            },
          },
        ]);

        const paramDef: ParamDef = {
          type: paramConfig.type,
          description: paramConfig.description || undefined,
          default: paramConfig.default,
          alias: paramConfig.alias || undefined,
          required: paramConfig.required,
          choices: paramConfig.choices || undefined,
        };

        // Remove undefined values
        Object.keys(paramDef).forEach((key) => {
          if (paramDef[key as keyof ParamDef] === undefined) {
            delete paramDef[key as keyof ParamDef];
          }
        });

        newCommand.params[paramName] = paramDef;
      }
    }
  }

  // Test the command
  const { testCommand } = await inquirer.prompt<TestCommandAnswer>([
    {
      type: 'confirm',
      name: 'testCommand',
      message: 'Test the command before saving?',
      default: true,
    },
  ]);

  if (testCommand) {
    const { testInput } = await inquirer.prompt<TestInputAnswer>([
      {
        type: 'input',
        name: 'testInput',
        message: 'Enter test input:',
      },
    ]);

    console.log(chalk.dim('\n--- Generated Prompt ---'));

    // Build test values
    const testValues: Record<string, unknown> = { input: testInput };
    if (newCommand.params) {
      for (const [name, def] of Object.entries(newCommand.params)) {
        if (def.default !== undefined) {
          testValues[name] = def.default;
        }
      }
    }

    // Show the prompt that would be sent
    const { TemplateEngine } = await import('../lib/template-engine');
    const renderedPrompt = TemplateEngine.render(newCommand.prompt, testValues, newCommand.params);
    console.log(renderedPrompt);
    console.log(chalk.dim('--- End of Prompt ---\n'));

    const { confirmSave } = await inquirer.prompt<ConfirmSaveAnswer>([
      {
        type: 'confirm',
        name: 'confirmSave',
        message: 'Save this command?',
        default: true,
      },
    ]);

    if (!confirmSave) {
      console.log(chalk.yellow('Command creation cancelled'));
      return;
    }
  }

  // Save the command
  await ConfigManager.getInstance().addCommand(newCommand, config);

  console.log(chalk.green(`\n✅ Command '${newCommand.name}' added successfully!\n`));
  console.log(chalk.dim('Try it with:'));
  console.log(chalk.cyan(`  aiq ${newCommand.name} "your input"`));

  if (newCommand.params && Object.keys(newCommand.params).length > 0) {
    const exampleParams = Object.entries(newCommand.params)
      .map(([name, def]) => {
        const p = def;
        if (p.alias) {
          return `-${p.alias} value`;
        }
        return `--${name} value`;
      })
      .join(' ');
    console.log(chalk.cyan(`  aiq ${newCommand.name} ${exampleParams} "your input"`));
  }
}

async function editCommand(commandName: string, config: Config): Promise<void> {
  const command = config.commands.find((c) => c.name === commandName);
  if (!command) {
    throw new UserError(
      `Command '${commandName}' not found`,
      'Run "aiq list" to see available commands',
    );
  }

  console.log(chalk.bold(`\nEditing command: ${commandName}\n`));

  const { action } = await inquirer.prompt<EditActionAnswer>([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to edit?',
      choices: [
        { name: 'Edit prompt template', value: 'prompt' },
        { name: 'Edit description', value: 'description' },
        { name: 'Edit parameters', value: 'params' },
        { name: 'Rename command', value: 'rename' },
        { name: 'Cancel', value: 'cancel' },
      ],
    },
  ]);

  if (action === 'cancel') {
    console.log(chalk.dim('Edit cancelled'));
    return;
  }

  switch (action) {
    case 'prompt': {
      const { newPrompt } = await inquirer.prompt<NewPromptAnswer>([
        {
          type: 'editor',
          name: 'newPrompt',
          message: 'Edit the prompt template:',
          default: command.prompt,
        },
      ]);
      command.prompt = newPrompt.trim();
      break;
    }

    case 'description': {
      const { newDesc } = await inquirer.prompt<NewDescriptionAnswer>([
        {
          type: 'input',
          name: 'newDesc',
          message: 'New description:',
          default: command.description,
        },
      ]);
      command.description = newDesc || undefined;
      break;
    }

    case 'rename': {
      const { newName } = await inquirer.prompt<NewNameAnswer>([
        {
          type: 'input',
          name: 'newName',
          message: 'New command name:',
          validate: (input: string) => {
            if (!input) return 'Name is required';
            if (!/^[a-z][a-z0-9-]*$/.test(input)) {
              return 'Use lowercase letters, numbers, and hyphens';
            }
            if (config.commands.find((c) => c.name === input)) {
              return `Command '${input}' already exists`;
            }
            return true;
          },
        },
      ]);
      command.name = newName;
      break;
    }

    case 'params':
      console.log(chalk.yellow('Parameter editing not yet implemented'));
      console.log(chalk.dim('You can edit parameters manually with "aiq config open"'));
      return;
  }

  await ConfigManager.getInstance().save(config);
  console.log(chalk.green(`✅ Command '${commandName}' updated`));
}

async function removeCommand(commandName: string, config: Config): Promise<void> {
  const commandIndex = config.commands.findIndex((c) => c.name === commandName);
  if (commandIndex === -1) {
    throw new UserError(
      `Command '${commandName}' not found`,
      'Run "aiq list" to see available commands',
    );
  }

  const { confirm } = await inquirer.prompt<ConfirmRemoveAnswer>([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Remove command '${commandName}'?`,
      default: false,
    },
  ]);

  if (!confirm) {
    console.log(chalk.dim('Removal cancelled'));
    return;
  }

  config.commands.splice(commandIndex, 1);
  await ConfigManager.getInstance().save(config);

  console.log(chalk.green(`✅ Command '${commandName}' removed`));
}

function extractParamNames(template: string): string[] {
  const params = new Set<string>();
  const regex = /{([^}]+)}/g;
  let match;

  while ((match = regex.exec(template)) !== null) {
    params.add(match[1]);
  }

  return Array.from(params);
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
