import { Injectable, Logger } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
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
import { SignupDeclinedEvent } from './events/signup.events.js';

@Injectable()
export class DeclineReasonRequestService {
  private readonly logger = new Logger(DeclineReasonRequestService.name);

  constructor(
    private readonly discordService: DiscordService,
    private readonly signupCollection: SignupCollection,
    private readonly eventBus: EventBus,
  ) {}

  @SentryTraced()
  async requestDeclineReason(
    signup: SignupDocument,
    reviewer: User,
    reviewMessage: Message<true>,
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
        reviewer.id,
        {
          embeds: [embed],
          components: [actionRow],
        },
      );

      await this.handleDeclineReasonInteractions(dmMessage, signup, reviewer, reviewMessage);
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
    reviewer: User,
    reviewMessage: Message<true>,
  ): Promise<void> {
    const signupId = `${signup.discordId}-${signup.encounter}`;
    const timeout = 5 * 60 * 1000; // 5 minutes

    try {
      const selectInteraction = await dmMessage.awaitMessageComponent({
        filter: isSameUserFilter(reviewer),
        componentType: ComponentType.StringSelect,
        time: timeout,
      });

      if (selectInteraction.customId === `${DECLINE_REASON_SELECT_ID}-${signupId}`) {
        await this.handleReasonSelection(
          selectInteraction as StringSelectMenuInteraction,
          signup,
          signupId,
          reviewer,
          reviewMessage,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Decline reason request timed out for signup ${signupId}`,
      );
      // Dispatch event on timeout with no decline reason
      this.dispatchDeclineEvent(signup, reviewer, reviewMessage);
    }
  }

  private async handleReasonSelection(
    interaction: StringSelectMenuInteraction,
    signup: SignupDocument,
    signupId: string,
    reviewer: User,
    reviewMessage: Message<true>,
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
          await this.handleCustomReasonSubmit(modalInteraction, signup, reviewer, reviewMessage);
        }
      } catch (error) {
        this.logger.warn(
          `Custom decline reason modal timed out for signup ${signupId}`,
        );
        // Dispatch event on timeout with no decline reason
        this.dispatchDeclineEvent(signup, reviewer, reviewMessage);
      }
    } else {
      // Use predefined reason
      await this.updateSignupWithDeclineReason(signup, selectedValue, reviewer, reviewMessage);
      await interaction.reply({
        content: `✅ Decline reason recorded: "${selectedValue}"`,
        ephemeral: true,
      });
    }
  }

  private async handleCustomReasonSubmit(
    interaction: ModalSubmitInteraction,
    signup: SignupDocument,
    reviewer: User,
    reviewMessage: Message<true>,
  ): Promise<void> {
    const customReason = interaction.fields.getTextInputValue(
      CUSTOM_DECLINE_REASON_INPUT_ID,
    );

    await this.updateSignupWithDeclineReason(signup, customReason, reviewer, reviewMessage);
    await interaction.reply({
      content: `✅ Custom decline reason recorded: "${customReason}"`,
      ephemeral: true,
    });
  }

  private async updateSignupWithDeclineReason(
    signup: SignupDocument,
    declineReason: string,
    reviewer: User,
    reviewMessage: Message<true>,
  ): Promise<void> {
    try {
      await this.signupCollection.updateDeclineReason(
        { discordId: signup.discordId, encounter: signup.encounter },
        declineReason,
      );

      this.logger.log(
        `Updated signup ${signup.discordId}-${signup.encounter} with decline reason: ${declineReason}`,
      );

      // Dispatch the decline event now that we have the reason
      this.dispatchDeclineEvent(signup, reviewer, reviewMessage);
    } catch (error) {
      this.logger.error(
        error,
        `Failed to update signup ${signup.discordId}-${signup.encounter} with decline reason`,
      );
    }
  }

  private dispatchDeclineEvent(
    signup: SignupDocument,
    reviewer: User,
    reviewMessage: Message<true>,
  ): void {
    try {
      const declineEvent = new SignupDeclinedEvent(signup, reviewer, reviewMessage);
      this.eventBus.publish(declineEvent);
      
      this.logger.log(
        `Dispatched SignupDeclinedEvent for signup ${signup.discordId}-${signup.encounter}`,
      );
    } catch (error) {
      this.logger.error(
        error,
        `Failed to dispatch SignupDeclinedEvent for signup ${signup.discordId}-${signup.encounter}`,
      );
    }
  }
}