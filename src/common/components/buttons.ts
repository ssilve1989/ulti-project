import { ButtonBuilder, ButtonStyle } from 'discord.js';

export const ConfirmButton = new ButtonBuilder()
  .setCustomId('confirm')
  .setLabel('Confirm')
  .setStyle(ButtonStyle.Success);

export const CancelButton = new ButtonBuilder()
  .setCustomId('cancel')
  .setLabel('Cancel')
  .setStyle(ButtonStyle.Primary);
