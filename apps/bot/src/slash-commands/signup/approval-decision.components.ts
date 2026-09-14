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
export const APPROVAL_CANCEL_BUTTON_ID = 'approvalDecisionCancel';
export const APPROVAL_COMMENT_MODAL_ID = 'approvalCommentModal';
export const APPROVAL_COMMENT_INPUT_ID = 'approvalCommentInput';

// Create the Approve / Approve with Comment / Cancel button row. Approve and
// Approve with Comment start disabled until a prog point has been selected
// in the accompanying menu; Cancel stays enabled so the reviewer can back
// out at any point.
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

  const cancelButton = new ButtonBuilder()
    .setCustomId(APPROVAL_CANCEL_BUTTON_ID)
    .setLabel('Cancel')
    .setStyle(ButtonStyle.Danger)
    .setDisabled(false);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    approveButton,
    approveWithCommentButton,
    cancelButton,
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
