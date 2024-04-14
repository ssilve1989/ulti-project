import { SlashCommandBuilder } from 'discord.js';
import { ENCOUNTER_CHOICES } from '../slash-commands.consts.js';

export const SignupSlashCommand = new SlashCommandBuilder()
  .setName('signup')
  .setDescription('Signup for an ultimate prog/clear party!')
  .addStringOption((option) =>
    option
      .setRequired(true)
      .setDescription('Select an encounter')
      .setName('encounter')
      .addChoices(...ENCOUNTER_CHOICES),
  )
  .addStringOption((option) =>
    option
      .setRequired(true)
      .setDescription('Character Name')
      .setName('character'),
  )
  .addStringOption((option) =>
    option.setRequired(true).setDescription('Home World').setName('world'),
  )
  .addStringOption((option) =>
    option
      .setRequired(true)
      .setDescription('Job/Role. Ex. SGE/WHM, Healer/Tank, etc')
      // we want the display label to be job, but its actually broader than a specific job so we'll refer to it as
      // role still internally, even though that's not broad enough either since people can multi-role
      .setName('job'),
  )
  .addStringOption((option) =>
    option
      .setRequired(true)
      .setDescription('Availability. Ex: M-F 8pm-12am EST')
      .setName('availability'),
  )
  .addStringOption((option) =>
    option
      .setRequired(true)
      .setName('prog-point')
      .setDescription('What prog point are you at?'),
  )
  .addStringOption((option) =>
    option
      .setDescription(
        'Link your proof of prog-point here (fflogs/youtube/twitch etc)',
      )
      .setName('prog-proof-link'),
  )
  .addAttachmentOption((option) =>
    option
      .setName('screenshot')
      .setDescription('Screenshot proof of prog point'),
  );
