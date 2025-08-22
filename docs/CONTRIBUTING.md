# Contributing to aiq

Thanks for your interest in contributing! This guide covers local setup, running the project in development, and how to extend aiq with new AI providers and command modules.

## Getting started

Prerequisites:
- Node.js >= 18
- Yarn (recommended) or npm

Clone and install:
```shell script
git clone https://github.com/laspencer91/aiq.git
cd aiq
yarn install
# or
npm install
```


Run the CLI in dev (watch) mode:
```shell script
yarn dev -- --help
# or
npm run dev -- --help
```


Build:
```shell script
yarn build
# or
npm run build
```


Run tests:
```shell script
yarn test
# or
npm test
```


Lint and format:
```shell script
yarn lint
yarn format
# or
npm run lint
npm run format
```


Optional: try the CLI globally during local development:
```shell script
yarn build
yarn link
aiq --help
# when finished
yarn unlink
```


Environment variables (example):
```shell script
# Create a .env file or export env vars directly
export GEMINI_API_KEY="<your-api-key>"
```


Tip: Initialize a local config and try a command:
```shell script
# Create config interactively
aiq config init

# List available commands
aiq list

# Run a command (example)
aiq explain "What does this do?"
```


## Extending aiq

You can extend aiq in two primary ways:
1) Add a new AI Provider (to support another AI service)
2) Add a Command Module (to introduce new CLI commands/subcommands)

Below are concise outlines to help you get started quickly.

---

### 1) Adding a new AI Provider

What to implement:
- A provider class that exposes metadata via a decorator (internal name, display name, defaults)
- Interface methods that handle prompt execution and validation:
  - executePrompt(prompt: string): Promise<string>
  - validateConfig(): void
  - validateConnection(): Promise<boolean>
  - getInitQuestions(): DistinctQuestion[]
- Make sure your provider is discoverable by provider discovery/registration

Use the existing Gemini provider as a reference for:
- How the decorator is applied with default configuration and display name
- How the provider implements the interface methods
- How validation and minimal “ping” checks are handled

Skeleton:
```textmate
// src/lib/providers/myprovider/my-provider.ts
// Outline only – adapt names/paths to your project.
import { IAiProvider } from '../provider.interface';
import { Provider } from '../provider.decorator'; // registration decorator
// import types you need (e.g., BaseProviderConfig)

interface MyProviderConfig extends BaseProviderConfig {
  name: 'myprovider';   // Required field
  apiKey: string;       // For your provider
  model: string;        // For your provider 
  temperature?: number; // For your provider
  maxTokens?: number;   // For your provider
};

@Provider<MyProviderConfig>('My Provider', {
  name: 'myprovider',
  apiKey: '${MYPROVIDER_API_KEY}', // env-var placeholder is fine
  model: 'my-default-model',
  temperature: 0.7,
  maxTokens: 500,
})
export class MyProvider extends IAiProvider<MyProviderConfig> {
  validateConfig(): void {
    if (!this.config.apiKey || this.config.apiKey.startsWith('${')) {
      throw new Error('API key not configured');
    }
    if (!this.config.model) {
      throw new Error('Model is required');
    }
  }

  async validateConnection(): Promise<boolean> {
    // Make a minimal request to verify credentials/model.
    await this.executePrompt('ping');
    return true;
  }

  async executePrompt(prompt: string): Promise<string> {
    // Call your provider’s API and return the plain text result.
    // Throw errors with helpful messages if the request fails.
    return '...response...';
  }

  getInitQuestions(): DistinctQuestion[] {
    // Inquirer questions used during `aiq config init`
    return [
      {
        type: 'password',
        name: 'apiKey',
        message: 'Enter your API key:',
        validate: (v: string) => (v ? true : 'API key is required'),
      },
      {
        type: 'input',
        name: 'model',
        message: 'Model to use:',
        default: 'my-default-model',
      },
    ];
  }
}
```


Checklist:
- Pick a stable internal provider name (e.g., "myprovider") and a human-friendly display name.
- Use sensible defaults in the decorator (env-var placeholders are OK).
- Implement all required methods listed above.
- Ensure your provider is exported/loaded so it’s discoverable at runtime.
- Reference the Gemini provider to see the decorator usage and interface implementation pattern.

---

### 2) Adding a Command Module

What to implement:
- A class that groups related commands and registers them with the CLI
- A protected registerCommands() method that attaches commands/subcommands and their actions

Use the existing configuration module as a reference for:
- How commands and subcommands are structured
- How actions handle user input/flags and error handling

Skeleton:
```textmate
// src/commands/my-feature.ts
// Outline only – adapt names/paths to your project.
import { CommandModule } from './command-module';

export class MyFeatureCommandModule extends CommandModule {
  protected registerCommands(): void {
    const my = this.program.command('my').description('My feature commands');

    my
      .command('do')
      .description('Perform an action')
      .option('-f, --flag', 'Optional flag')
      .action(async (opts: { flag?: boolean }) => {
        // Implement your behavior here
        console.log('Doing the thing...', opts.flag ? '(with flag)' : '');
      });
  }
}
```


Wiring:
- Initialize your module alongside others during CLI bootstrap so its commands are available at runtime.
- As an example pattern, review the configuration module to see how it’s initialized and how subcommands are organized.

---

## Submitting changes

1. Create a feature branch:
```shell script
git checkout -b feat/my-change
```


2. Make your changes (add tests where it makes sense).

3. Verify locally:
```shell script
yarn lint && yarn test && yarn build
# or
npm run lint && npm test && npm run build
```


4. Commit with a clear message and open a pull request describing:
- What changed and why
- How to test (commands, expected behavior)
- Any follow-ups or limitations

Thank you for helping improve aiq!
