import { SlashCommandBuilder } from 'discord.js';
import type { ApplicationModeConfig } from '../../app.config.js';
import { getEncounterChoicesForMode } from '../../encounters/encounters.consts.js';

export const REMOVE_SIGNUP_SLASH_COMMAND_NAME = 'remove-signup';

export function createRemoveSignupSlashCommand(mode: ApplicationModeConfig) {
  return new SlashCommandBuilder()
    .setName(REMOVE_SIGNUP_SLASH_COMMAND_NAME)
    .setDescription('Remove a signup')
    .addStringOption((option) =>
      option
        .setName('character')
        .setDescription('Character Name')
        .setMaxLength(64)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setRequired(true)
        .setDescription('Home World')
        .setName('world')
        .setMaxLength(32),
    )
    .addStringOption((option) =>
      option
        .setRequired(true)
        .setDescription('Select an encounter')
        .setName('encounter')
        .addChoices(...getEncounterChoicesForMode(mode)),
    );
}
