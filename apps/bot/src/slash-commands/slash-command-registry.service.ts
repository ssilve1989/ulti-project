import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import type {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import {
  SLASH_COMMAND_KEY,
  type SlashCommandOptions,
} from './slash-command.decorator.js';
import type { ISlashCommand } from './slash-command.interface.js';

function isISlashCommand(instance: unknown): instance is ISlashCommand {
  return (
    typeof instance === 'object' &&
    instance !== null &&
    'execute' in instance &&
    typeof (instance as Record<string, unknown>).execute === 'function'
  );
}

@Injectable()
class SlashCommandRegistry implements OnModuleInit {
  private readonly commandMap = new Map<string, ISlashCommand>();
  private readonly builders = new Map<
    string,
    | SlashCommandBuilder
    | SlashCommandSubcommandsOnlyBuilder
    | SlashCommandOptionsOnlyBuilder
  >();
  private readonly logger = new Logger(SlashCommandRegistry.name);

  constructor(private readonly discoveryService: DiscoveryService) {}

  onModuleInit() {
    for (const wrapper of this.discoveryService.getProviders()) {
      if (!wrapper.metatype) continue;

      const entries: SlashCommandOptions[] | undefined = Reflect.getMetadata(
        SLASH_COMMAND_KEY,
        wrapper.metatype,
      );
      if (!entries) continue;

      for (const opts of entries) {
        const name = opts.builder.name;
        const key = opts.subcommand ? `${name}:${opts.subcommand}` : name;
        if (!isISlashCommand(wrapper.instance)) {
          this.logger.warn(
            `${wrapper.metatype.name} is decorated with @SlashCommand but does not implement ISlashCommand — skipping`,
          );
          continue;
        }
        this.commandMap.set(key, wrapper.instance);
        this.builders.set(name, opts.builder);
      }
    }

    this.logger.log(
      `${this.commandMap.size} slash command handlers registered`,
    );
  }

  async dispatch(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    const sub = interaction.options.getSubcommand(false);
    const key = sub
      ? `${interaction.commandName}:${sub}`
      : interaction.commandName;

    const handler = this.commandMap.get(key);
    if (!handler) return;

    await handler.execute(interaction);
  }

  getAllBuilders(): (
    | SlashCommandBuilder
    | SlashCommandSubcommandsOnlyBuilder
    | SlashCommandOptionsOnlyBuilder
  )[] {
    return [...this.builders.values()];
  }
}

export { SlashCommandRegistry };
