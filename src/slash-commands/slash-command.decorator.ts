import type {
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';

export const SLASH_COMMAND_KEY = Symbol('SLASH_COMMAND_KEY');

export interface SlashCommandOptions {
  builder:
    | SlashCommandBuilder
    | SlashCommandSubcommandsOnlyBuilder
    | SlashCommandOptionsOnlyBuilder;
  subcommand?: string;
}

export function SlashCommand(options: SlashCommandOptions): ClassDecorator {
  return (target) => {
    const existing: SlashCommandOptions[] =
      Reflect.getMetadata(SLASH_COMMAND_KEY, target) ?? [];
    Reflect.defineMetadata(SLASH_COMMAND_KEY, [...existing, options], target);
  };
}
