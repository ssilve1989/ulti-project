import { SlashCommandBuilder } from 'discord.js';
import { Encounter } from '../app.consts.js';

export const SignupSlashCommand = new SlashCommandBuilder()
  .setName('signup')
  .setDescription('Signup for an ultimate prog/clear party!')
  .addStringOption((option) =>
    option
      .setRequired(true)
      .setDescription('Select an encounter')
      .setName('encounter')
      .addChoices(
        { name: 'The Epic of Alexander (Ultimate)', value: Encounter.TEA },
        { name: 'The Omega Protocol (Ultimate)', value: Encounter.TOP },
        {
          name: 'The Unending Coil of Bahamut (Ultimate)',
          value: Encounter.UCOB,
        },
        { name: 'The Weapons Refrain (Ultimate)', value: Encounter.UWU },
        { name: `Dragonsong Reprise (Ultimate)`, value: Encounter.DSR },
      ),
  )
  .addStringOption((option) =>
    option
      .setRequired(true)
      .setDescription('Character Name')
      .setName('character'),
  )
  .addStringOption((option) =>
    // TODO: Could use FFLogs API to create validated autocomplete list of choices?
    option.setRequired(true).setDescription('Home World').setName('world'),
  )
  .addStringOption((option) =>
    option
      .setRequired(true)
      .setDescription('Job/Role. Ex. SGE/WHM, Healer/Tank, etc')
      .setName('role'),
  )
  .addStringOption((option) =>
    option
      .setRequired(true)
      .setDescription('Availability. Ex: M-F 8pm-12am EST')
      .setName('availability'),
  )
  .addStringOption((option) =>
    option
      .setDescription('FF Logs Link for selected encounter showing prog point')
      .setName('fflogs'),
  )
  .addAttachmentOption((option) =>
    option
      .setName('screenshot')
      .setDescription('Screenshot proof of prog point'),
  );
