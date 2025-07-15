import {
  ActionRowBuilder,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  Colors,
} from 'discord.js';
import {
  SIGNUP_DECLINE_REASONS,
  CUSTOM_DECLINE_REASON_VALUE,
  CUSTOM_DECLINE_REASON_LABEL,
} from './signup.consts.js';

// Component IDs
export const DECLINE_REASON_SELECT_ID = 'declineReasonSelect';
export const CUSTOM_DECLINE_REASON_MODAL_ID = 'customDeclineReasonModal';
export const CUSTOM_DECLINE_REASON_INPUT_ID = 'customDeclineReasonInput';

// Create the decline reason select menu
export const createDeclineReasonSelectMenu = (signupId: string) => {
  const options = SIGNUP_DECLINE_REASONS.map((reason) => ({
    label: reason,
    value: reason,
  }));

  // Add custom reason option
  options.push({
    label: CUSTOM_DECLINE_REASON_LABEL,
    value: CUSTOM_DECLINE_REASON_VALUE,
  });

  return new StringSelectMenuBuilder()
    .setCustomId(`${DECLINE_REASON_SELECT_ID}-${signupId}`)
    .setPlaceholder('Select a reason for declining this signup')
    .addOptions(options);
};

// Create the custom decline reason modal
export const createCustomDeclineReasonModal = (signupId: string) => {
  const modal = new ModalBuilder()
    .setCustomId(`${CUSTOM_DECLINE_REASON_MODAL_ID}-${signupId}`)
    .setTitle('Provide Custom Decline Reason');

  const reasonInput = new TextInputBuilder()
    .setCustomId(CUSTOM_DECLINE_REASON_INPUT_ID)
    .setLabel('Decline Reason')
    .setPlaceholder('Enter your reason for declining this signup...')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(500);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput),
  );

  return modal;
};

// Create the DM embed for reason selection
export const createDeclineReasonRequestEmbed = (
  signupUserName: string,
  encounter: string,
) => {
  return new EmbedBuilder()
    .setTitle('Decline Reason Required')
    .setDescription(
      `You have declined the signup from **${signupUserName}** for **${encounter}**.`,
    )
    .addFields({
      name: 'Next Steps',
      value: 'Please select a reason for declining this signup from the dropdown below. This will help provide better feedback to the user.',
    })
    .setColor(Colors.Orange)
    .setFooter({
      text: 'This request will timeout in 5 minutes',
    });
};