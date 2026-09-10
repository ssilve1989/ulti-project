import { ButtonBuilder, ButtonStyle } from 'discord.js';

export const EDIT_APPROVE_BUTTON_ID = 'edit-approve';
// local-only: the handler distinguishes on EDIT_APPROVE_BUTTON_ID
const EDIT_DECLINE_BUTTON_ID = 'edit-decline';

export const EditApproveButton = new ButtonBuilder()
  .setCustomId(EDIT_APPROVE_BUTTON_ID)
  .setLabel('Approve')
  .setStyle(ButtonStyle.Success);

export const EditDeclineButton = new ButtonBuilder()
  .setCustomId(EDIT_DECLINE_BUTTON_ID)
  .setLabel('Decline')
  .setStyle(ButtonStyle.Danger);
