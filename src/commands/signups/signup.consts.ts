import { ButtonBuilder, ButtonStyle, SlashCommandBuilder } from 'discord.js';

export const SignupCommandData = new SlashCommandBuilder()
  .setName('signup')
  .setDescription('Signup for an ultimate prog/clear party!')
  .addStringOption((option) =>
    option
      .setRequired(true)
      .setDescription('Select an encounter')
      .setName('encounter')
      .addChoices(
        { name: 'The Epic of Alexander (Ultimate)', value: 'tea' },
        { name: 'The Omega Protocol (Ultimate)', value: 'top' },
        { name: 'The Unending Coil of Bahamut (Ultimate)', value: 'ucob' },
        { name: 'The Weapons Refrain (Ultimate)', value: 'uwu' },
        { name: `Dragonsong Reprise (Ultimate)`, value: 'dsr' },
      ),
  )
  .addStringOption((option) =>
    option
      .setRequired(true)
      .setDescription('Character Name @ World')
      .setName('character'),
  )
  .addStringOption((option) =>
    option.setRequired(true).setDescription('FF Logs Link').setName('fflogs'),
  )
  .addStringOption((option) =>
    option
      .setRequired(true)
      .setDescription('Availability. Ex: M-F 8pm-12am EST')
      .setName('availability'),
  );

export const ConfirmButton = new ButtonBuilder()
  .setCustomId('confirm')
  .setLabel('Confirm')
  .setStyle(ButtonStyle.Success);

export const CancelButton = new ButtonBuilder()
  .setCustomId('cancel')
  .setLabel('Cancel')
  .setStyle(ButtonStyle.Primary);
