import { Injectable, Logger } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import {
  ActionRowBuilder,
  ComponentType,
  type InteractionResponse,
  type Message,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  type User,
} from 'discord.js';
import { isSameUserFilter } from '../../common/collection-filters.js';
import { DiscordService } from '../../discord/discord.service.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import type { SignupDocument } from '../../firebase/models/signup.model.js';
import {
  CUSTOM_DECLINE_REASON_INPUT_ID,
  CUSTOM_DECLINE_REASON_MODAL_ID,
  DECLINE_REASON_SELECT_ID,
  createCustomDeclineReasonModal,
  createDeclineReasonRequestEmbed,
  createDeclineReasonSelectMenu,
} from './decline-reason.components.js';
import { CUSTOM_DECLINE_REASON_VALUE } from './signup.consts.js';

@Injectable()
export class DeclineReasonRequestService {
  private readonly logger = new Logger(DeclineReasonRequestService.name);

  constructor(
    private readonly discordService: DiscordService,
    private readonly signupCollection: SignupCollection,
  ) {}

  @SentryTraced()
  async requestDeclineReason(
    signup: SignupDocument,
    reviewerId: string,
  ): Promise<void> {
    try {
      const signupId = `${signup.discordId}-${signup.encounter}`;
      const embed = createDeclineReasonRequestEmbed(
        signup.username,
        signup.encounter,
      );
      const selectMenu = createDeclineReasonSelectMenu(signupId);
      const actionRow = new ActionRowBuilder<typeof selectMenu>().addComponents(
        selectMenu,
      );

      const dmMessage = await this.discordService.sendDirectMessage(
        reviewerId,
        {
          embeds: [embed],
          components: [actionRow],
        },
      );

      const reviewerUser = await this.discordService.client.users.fetch(reviewerId);
      await this.handleDeclineReasonInteractions(dmMessage, signup, reviewerUser);
    } catch (error) {
      this.logger.error(
        error,
        `Failed to request decline reason for signup ${signup.discordId}-${signup.encounter}`,
      );
    }
  }

  private async handleDeclineReasonInteractions(
    dmMessage: Message<false> | InteractionResponse<false>,
    signup: SignupDocument,
    reviewerUser: User,
  ): Promise<void> {
    const signupId = `${signup.discordId}-${signup.encounter}`;
    const timeout = 5 * 60 * 1000; // 5 minutes

    try {
      const selectInteraction = await dmMessage.awaitMessageComponent({
        filter: isSameUserFilter(reviewerUser),
        componentType: ComponentType.StringSelect,
        time: timeout,
      });

      if (selectInteraction.customId === `${DECLINE_REASON_SELECT_ID}-${signupId}`) {
        await this.handleReasonSelection(
          selectInteraction as StringSelectMenuInteraction,
          signup,
          signupId,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Decline reason request timed out for signup ${signupId}`,
      );
    }
  }

  private async handleReasonSelection(
    interaction: StringSelectMenuInteraction,
    signup: SignupDocument,
    signupId: string,
  ): Promise<void> {
    const selectedValue = interaction.values[0];

    if (selectedValue === CUSTOM_DECLINE_REASON_VALUE) {
      // Show modal for custom reason
      const modal = createCustomDeclineReasonModal(signupId);
      await interaction.showModal(modal);

      try {
        const modalInteraction = await interaction.awaitModalSubmit({
          filter: isSameUserFilter(interaction.user),
          time: 5 * 60 * 1000, // 5 minutes
        });

        if (modalInteraction.customId === `${CUSTOM_DECLINE_REASON_MODAL_ID}-${signupId}`) {
          await this.handleCustomReasonSubmit(modalInteraction, signup);
        }
      } catch (error) {
        this.logger.warn(
          `Custom decline reason modal timed out for signup ${signupId}`,
        );
      }
    } else {
      // Use predefined reason
      await this.updateSignupWithDeclineReason(signup, selectedValue);
      await interaction.reply({
        content: `✅ Decline reason recorded: "${selectedValue}"`,
        ephemeral: true,
      });
    }
  }

  private async handleCustomReasonSubmit(
    interaction: ModalSubmitInteraction,
    signup: SignupDocument,
  ): Promise<void> {
    const customReason = interaction.fields.getTextInputValue(
      CUSTOM_DECLINE_REASON_INPUT_ID,
    );

    await this.updateSignupWithDeclineReason(signup, customReason);
    await interaction.reply({
      content: `✅ Custom decline reason recorded: "${customReason}"`,
      ephemeral: true,
    });
  }

  private async updateSignupWithDeclineReason(
    signup: SignupDocument,
    declineReason: string,
  ): Promise<void> {
    try {
      await this.signupCollection.updateDeclineReason(
        { discordId: signup.discordId, encounter: signup.encounter },
        declineReason,
      );

      // TODO: In later commit, update the user's DM with the specific reason
      // TODO: In later commit, update the review embed with the reason
      
      this.logger.log(
        `Updated signup ${signup.discordId}-${signup.encounter} with decline reason: ${declineReason}`,
      );
    } catch (error) {
      this.logger.error(
        error,
        `Failed to update signup ${signup.discordId}-${signup.encounter} with decline reason`,
      );
    }
  }
}