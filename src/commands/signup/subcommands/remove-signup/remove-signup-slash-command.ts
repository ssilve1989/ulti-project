import { SlashCommandBuilder } from 'discord.js';
import { ENCOUNTER_CHOICES } from '../../../slash-commands.consts.js';

export const RemoveSignupSlashCommand = new SlashCommandBuilder()
  .setName('remove-signup')
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
      .addChoices(...ENCOUNTER_CHOICES),
  );
