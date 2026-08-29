import { getEncounterChoicesForMode } from '@ulti-project/shared';
import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { ApplicationModeConfig } from '../../config/app.js';

// TODO: abstract common options between this and /signup
const TURBO_PROG_SLASH_COMMAND_NAME = 'turbo-prog';

export function createTurboProgSlashCommand(mode: ApplicationModeConfig) {
  return new SlashCommandBuilder()
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setName(TURBO_PROG_SLASH_COMMAND_NAME)
    .setDescription('signup for the current turbo prog event!')
    .addStringOption((option) =>
      option
        .setRequired(true)
        .setDescription('Select an encounter')
        .setName('encounter')
        .addChoices(...getEncounterChoicesForMode(mode)),
    );
}
