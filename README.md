# AiQ 🤖
A lightweight CLI for reusable AI prompts.

- Minimal setup
- Works in your terminal
- Save prompts as named commands you can share and reuse

Have you been in your terminal and needed a quick answer—like the right flag for a tricky command, a one-liner to transform output, or a concise note—without tabbing to a browser or heavyweight IDE? aiq is a minimal, in-terminal agent that turns reusable prompts into commands you can run anywhere, so you can stay focused in the shell and get answers fast. You can easily configure your own re-usable prompts!

## What is it useful for?
- Saving repeatable prompts as named commands (e.g., summarize, commit-msg, explain, refactor)
- Running templated, parameterized prompts consistently across your team
- Fast one-off tasks from the terminal: summarize files, draft commit messages, generate docs
- Piping content from files and tools (git, cat, curl) directly into AI prompts
- Automating AI tasks in npm scripts, shell aliases, and CI jobs
- Keeping your prompts organized and discoverable with a simple list and history

## Who is it for?
- Developers, DevOps, data scientists, and technical writers who live in the terminal
- Teams who want consistent, shared prompt workflows in a repo or project
- Anyone who prefers quick keyboard-driven AI interactions over switching to a browser

## Requirements
- Node.js >= 18

## Install (npm)
Global install:
A lightweight, extensible CLI tool for reusable AI prompts. Turn repetitive AI interactions into simple terminal commands.

## Features

- 🚀 **Simple Commands** - Transform complex prompts into one-line commands
- 🔧 **Fully Configurable** - JSON-based configuration with environment variable support
- 📝 **Custom Parameters** - Add parameters with types, defaults, and choices
- 🔄 **Command History** - Track and replay previous commands
- 🎯 **Pipe Support** - Works seamlessly with Unix pipes
- ⚡ **Fast & Lightweight** - Minimal dependencies, maximum productivity

## Installation

### From npm
```bash
npm install -g aiquery
```

### From source
```bash
git clone https://github.com/laspencer91/aiq.git
cd aiq
yarn install
yarn build
yarn link
```

## Quick Start

1. **Initialize configuration:**
```bash
aiq config init
```

2. **Run a command:**
```bash
aiq explain "What is a closure in JavaScript?"
```

3. **Pipe input:**
```bash
cat error.log | aiq fix
```

4. **Use parameters:**
```bash
aiq summarize -w 25 "Your long text here..."
```

## Usage

### Built-in Commands

Default commands included in the configuration:

- `summarize` - Summarize text concisely
- `explain` - Explain code or concepts clearly
- `cmd` - Get terminal commands without explanation
- `fix` - Fix errors in code or text

### Core CLI Commands

```bash
# Configuration
aiq config init      # Initialize configuration
aiq config open      # Open config in editor
aiq config validate  # Validate config and test API

# Command Management
aiq list            # List all available commands
aiq add             # Add new command interactively
aiq edit <command>  # Edit existing command
aiq remove <command> # Remove a command
aiq test <command>  # Test command with sample input

# History
aiq history         # Show recent command history
aiq last           # Show last response
aiq replay <id>    # Replay command from history

# Execution
aiq <command> [options] "input"  # Run a command
aiq <command> --dry-run "input"  # Preview prompt without sending
```

## Configuration

Configuration is stored in `~/.aiq/config.json`:

```json
{
  "version": "1.0",
  "provider": {
    "name": "gemini",
    "apiKey": "${GEMINI_API_KEY}",
    "model": "gemini-2.0-flash",
    "temperature": 0.7
  },
  "commands": [
    {
      "name": "translate",
      "description": "Translate text between languages",
      "prompt": "Translate this text from {from} to {to}:\n\n{input}",
      "params": {
        "from": {
          "type": "string",
          "default": "auto",
          "choices": ["auto", "en", "es", "fr", "de", "ja"]
        },
        "to": {
          "type": "string",
          "required": true,
          "choices": ["en", "es", "fr", "de", "ja"],
          "alias": "t"
        }
      }
    }
  ]
}
```

### Environment Variables

- `GEMINI_API_KEY` - Your Gemini API key
- `EDITOR` - Preferred editor for config editing
- `AIQ_CONFIG_DIR` - Custom config directory (default: `~/.aiq`)

## Creating Custom Commands

### Interactive Command Builder

```bash
$ aiq add

Creating new command...

? Command name: review
? Description: Review and improve code
? Enter the prompt template: (opens editor)

# In editor:
Review this {language} code and suggest improvements:

{input}

? Found parameters: language. Configure them? Yes
? Parameter type: string
? Default value: auto-detect
? Add predefined choices? Yes  
? Enter choices: javascript,python,go,rust,auto-detect

✅ Command 'review' added successfully!
```

### Manual Configuration

Add commands directly to your config file:

```json
{
  "name": "commit",
  "description": "Generate git commit message",
  "prompt": "Generate a {style} commit message for:\n\n{input}",
  "params": {
    "style": {
      "type": "string",
      "default": "conventional",
      "choices": ["conventional", "simple", "detailed"],
      "alias": "s"
    }
  }
}
```

## Template Syntax

- `{input}` - User input (optional - appended if not in template)
- `{paramName}` - Named parameters
- Parameters can have types, defaults, choices, and aliases

## Examples

### Basic Usage
```bash
# Explain code
aiq explain "const x = () => y => x + y"

# Get terminal command
aiq cmd "find all PDF files modified today"

# Summarize with word limit
aiq summarize -w 20 "Long article text..."
```

### With Pipes
```bash
# Fix code errors
cat broken.js | aiq fix

# Generate commit message  
git diff | aiq commit

# Explain command output
docker ps | aiq explain
```

### Advanced
```bash
# Dry run to preview prompt
aiq translate --dry-run -t es "Hello world"

# Search history
aiq history search "docker"

# Replay previous command
aiq replay abc123
```

## Tips

1. **Use pipes for file content:**
   ```bash
   cat README.md | aiq summarize -w 50
   ```

2. **Create aliases for common commands:**
   ```bash
   alias ai-commit='git diff | aiq commit'
   ```

3. **Set environment variables in your shell config:**
   ```bash
   export GEMINI_API_KEY="your-key-here"
   ```

4. **Use dry-run to debug prompts:**
   ```bash
   aiq mycommand --dry-run "test input"
   ```

## Development

### Setup
```bash
# Clone the repository
git clone https://github.com/yourusername/aiq.git
cd aiq

# Install dependencies (Yarn 4 with node-modules linker)
yarn install

# Build the project
yarn build

# Run in development mode
yarn dev

# Run tests
yarn test

# Lint and format
yarn lint
yarn format
```

### Available Scripts
- `yarn build` - Build the TypeScript project
- `yarn dev` - Run in development mode with tsx
- `yarn watch` - Watch mode for TypeScript compiler
- `yarn test` - Run Jest tests
- `yarn lint` - Run ESLint
- `yarn lint:fix` - Fix ESLint issues
- `yarn format` - Format code with Prettier
- `yarn format:check` - Check code formatting
- `yarn typecheck` - Type checking without emit

### Project Structure
```
aiq/
├── src/
│   ├── index.ts           # CLI entry point
│   ├── types.ts           # TypeScript type definitions
│   ├── commands/          # CLI command implementations
│   │   ├── config.ts
│   │   ├── history.ts
│   │   └── add.ts
│   ├── lib/               # Core libraries
│   │   ├── config-manager.ts
│   │   ├── template-engine.ts
│   │   ├── gemini-provider.ts
│   │   ├── history-manager.ts
│   │   ├── command-runner.ts
│   │   └── __tests__/     # Test files
│   └── utils/             # Utility functions
├── .yarnrc.yml            # Yarn configuration (node-modules linker)
├── .eslintrc.json         # ESLint configuration
├── .prettierrc.json       # Prettier configuration
├── jest.config.js         # Jest configuration
├── tsconfig.json          # TypeScript configuration
└── package.json
```

## Contributing

[CONTRIBUTIONS](docs/CONTRIBUTING.md) are welcome! This project aims to be:

- **Simple** - Easy to understand and extend
- **Focused** - Do one thing well
- **Lightweight** - Minimal dependencies
- **Cross-platform** - Works on Linux, macOS, and Windows

## License

MIT

## Roadmap

- [ ] Multiple AI provider support
- [ ] Response caching
- [ ] Plugin system
- [ ] Export commands as standalone scripts
- [ ] Cost tracking
- [ ] Interactive mode for conversations

---

Built with ❤️ for developers who love the terminal
