import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

// Component IDs
export const APPROVE_BUTTON_ID = 'approvalDecisionApprove';
export const APPROVE_WITH_COMMENT_BUTTON_ID =
  'approvalDecisionApproveWithComment';
export const APPROVAL_COMMENT_MODAL_ID = 'approvalCommentModal';
export const APPROVAL_COMMENT_INPUT_ID = 'approvalCommentInput';

// Create the Approve / Approve with Comment button row. Both buttons start
// disabled until a prog point has been selected in the accompanying menu.
export function createApprovalButtonsRow(
  disabled: boolean,
): ActionRowBuilder<ButtonBuilder> {
  const approveButton = new ButtonBuilder()
    .setCustomId(APPROVE_BUTTON_ID)
    .setLabel('Approve')
    .setStyle(ButtonStyle.Success)
    .setDisabled(disabled);

  const approveWithCommentButton = new ButtonBuilder()
    .setCustomId(APPROVE_WITH_COMMENT_BUTTON_ID)
    .setLabel('Approve with Comment')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(disabled);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    approveButton,
    approveWithCommentButton,
  );
}

// Create the modal that collects the reviewer's optional comment
export function createApprovalCommentModal(): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(APPROVAL_COMMENT_MODAL_ID)
    .setTitle('Add a Comment for the User');

  const commentInput = new TextInputBuilder()
    .setCustomId(APPROVAL_COMMENT_INPUT_ID)
    .setLabel('Comment')
    .setPlaceholder(
      'This will be sent to the user along with their approval...',
    )
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(500);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(commentInput),
  );

  return modal;
}
