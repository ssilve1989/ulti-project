import { getEncounterChoicesForMode } from '@ulti-project/shared';
import { SlashCommandBuilder } from 'discord.js';
import type { ApplicationModeConfig } from '../../config/app.js';
import { EDIT_SIGNUP_SLASH_COMMAND_NAME } from './edit-signup.consts.js';

export function createEditSignupSlashCommand(mode: ApplicationModeConfig) {
  return new SlashCommandBuilder()
    .setName(EDIT_SIGNUP_SLASH_COMMAND_NAME)
    .setDescription(
      "Correct a reviewed signup's prog point or approve a declined signup",
    )
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The signed-up Discord user')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('encounter')
        .setDescription('Select an encounter')
        .setRequired(true)
        .addChoices(...getEncounterChoicesForMode(mode)),
    );
}
