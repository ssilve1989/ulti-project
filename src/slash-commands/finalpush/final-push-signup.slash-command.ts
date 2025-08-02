import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { ApplicationModeConfig } from '../../app.config.js';
import { getEncounterChoicesForMode } from '../../encounters/encounters.consts.js';

export const FINAL_PUSH_SLASH_COMMAND_NAME = 'final-push';

export function createFinalPushSlashCommand(mode: ApplicationModeConfig) {
  return new SlashCommandBuilder()
    .setName(FINAL_PUSH_SLASH_COMMAND_NAME)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDescription('signup for the final push event!')
    .addStringOption((option) =>
      option
        .setRequired(true)
        .setDescription('Select an encounter')
        .setName('encounter')
        .addChoices(...getEncounterChoicesForMode(mode)),
    );
}
