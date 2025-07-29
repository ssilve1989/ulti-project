import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

/**
 * Create a standardized back button
 */
function createBackButton(
  customId: string,
  label = 'Back to Main Menu',
): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('🔙');
}

/**
 * Create a standardized action row with back button
 */
export function createBackButtonRow(
  customId: string,
  label?: string,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    createBackButton(customId, label),
  );
}

/**
 * Create a standardized success message with return option
 */
export function createSuccessWithReturnButton(message: string): {
  content: string;
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const returnButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('return-to-main')
      .setLabel('Back to Main Menu')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🔙'),
  );

  return {
    content: message,
    components: [returnButton],
  };
}
