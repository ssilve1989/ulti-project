import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

// Component IDs
export const APPROVAL_COMMENT_ADD_BUTTON_ID = 'approvalCommentAdd';
export const APPROVAL_COMMENT_SKIP_BUTTON_ID = 'approvalCommentSkip';
export const APPROVAL_COMMENT_MODAL_ID = 'approvalCommentModal';
export const APPROVAL_COMMENT_INPUT_ID = 'approvalCommentInput';

// Create the "add a comment" / "skip" button row
export const createApprovalCommentButtons = (signupId: string) => {
  const addButton = new ButtonBuilder()
    .setCustomId(`${APPROVAL_COMMENT_ADD_BUTTON_ID}-${signupId}`)
    .setLabel('Add a comment')
    .setStyle(ButtonStyle.Primary);

  const skipButton = new ButtonBuilder()
    .setCustomId(`${APPROVAL_COMMENT_SKIP_BUTTON_ID}-${signupId}`)
    .setLabel('Skip')
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    addButton,
    skipButton,
  );
};

// Create the modal that collects the reviewer's optional comment
export const createApprovalCommentModal = (signupId: string) => {
  const modal = new ModalBuilder()
    .setCustomId(`${APPROVAL_COMMENT_MODAL_ID}-${signupId}`)
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
};

// Create the DM embed prompting the reviewer for an optional comment
export const createApprovalCommentRequestEmbed = (
  signupUserName: string,
  encounter: string,
) => {
  return new EmbedBuilder()
    .setTitle('Add a Comment (optional)')
    .setDescription(
      `You have approved the signup from **${signupUserName}** for **${encounter}**.`,
    )
    .addFields({
      name: 'Next Steps',
      value:
        'Optionally add a comment for the user. If you do, it will be sent to them in a direct message alongside their approval. Choose "Skip" to send the approval without one.',
    })
    .setColor(Colors.Green)
    .setFooter({
      text: 'Each step in this request times out after 5 minutes of inactivity.',
    });
};
