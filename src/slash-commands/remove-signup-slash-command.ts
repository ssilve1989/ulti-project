import { SlashCommandBuilder } from 'discord.js';
import { ENCOUNTER_CHOICES } from './slash-commands.consts.js';

export const RemoveSignupSlashCommand = new SlashCommandBuilder()
  .setName('remove-signup')
  .setDescription('remove a player from signups')
  .addStringOption((option) =>
    option
      .setName('character')
      .setDescription('Character Name')
      .setRequired(true),
  )
  .addStringOption((option) =>
    option.setRequired(true).setDescription('Home World').setName('world'),
  )
  .addStringOption((option) =>
    option
      .setRequired(true)
      .setDescription('Select an encounter')
      .setName('encounter')
      .addChoices(...ENCOUNTER_CHOICES),
  );
