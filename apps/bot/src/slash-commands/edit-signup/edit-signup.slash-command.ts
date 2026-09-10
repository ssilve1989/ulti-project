import { getEncounterChoicesForMode } from '@ulti-project/shared';
import { SlashCommandBuilder } from 'discord.js';
import type { ApplicationModeConfig } from '../../config/app.js';

const EDIT_SIGNUP_SLASH_COMMAND_NAME = 'edit-signup';

export function createEditSignupSlashCommand(mode: ApplicationModeConfig) {
  return new SlashCommandBuilder()
    .setName(EDIT_SIGNUP_SLASH_COMMAND_NAME)
    .setDescription(
      "Edit an already-reviewed signup's prog point or approval decision",
    )
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The signed-up Discord user')
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('character')
        .setDescription('Character name (case-insensitive)')
        .setMaxLength(64)
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('encounter')
        .setDescription(
          'Encounter (needed only if the user/character has more than one reviewed signup)',
        )
        .addChoices(...getEncounterChoicesForMode(mode))
        .setRequired(false),
    );
}
