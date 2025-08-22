import { Command } from 'commander';
import { ConfigManager } from '../lib/config-manager';

export abstract class CommandModule {
  protected program!: Command;
  protected configManager!: ConfigManager;

  constructor() {}

  /**
   * Initializes a command module.
   * This static method creates an instance of the specific subclass it's called on,
   * injects dependencies, and registers commands.
   */
  public static init<T extends CommandModule>(
    this: new () => T,
    program: Command,
    configManager: ConfigManager,
  ): T {
    const instance = new this();
    instance.program = program;
    instance.configManager = configManager;
    instance.registerCommands();
    return instance;
  }

  protected abstract registerCommands(): void;
}
