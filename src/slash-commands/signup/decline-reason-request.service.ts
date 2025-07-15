import { Injectable, Logger } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import { SentryTraced } from '@sentry/nestjs';
import {
  ActionRowBuilder,
  ComponentType,
  DiscordjsError,
  DiscordjsErrorCodes,
  type InteractionResponse,
  type Message,
  MessageFlags,
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
  createCustomDeclineReasonModal,
  createDeclineReasonRequestEmbed,
  createDeclineReasonSelectMenu,
  DECLINE_REASON_SELECT_ID,
} from './decline-reason.components.js';
import { SignupDeclineReasonCollectedEvent } from './events/signup.events.js';
import { CUSTOM_DECLINE_REASON_VALUE } from './signup.consts.js';

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

      await this.handleDeclineReasonInteractions(
        dmMessage,
        signup,
        reviewer,
        reviewMessage,
      );
    } catch (error) {
      this.reportError(error, { signup, reviewer });
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

      if (
        selectInteraction.customId === `${DECLINE_REASON_SELECT_ID}-${signupId}`
      ) {
        await this.handleReasonSelection(
          selectInteraction as StringSelectMenuInteraction,
          signup,
          signupId,
          reviewer,
          reviewMessage,
        );
      }
    } catch (error) {
      this.handleTimeoutError(
        error,
        signup,
        reviewer,
        reviewMessage,
        `Decline reason request timed out for signup ${signupId}`,
      );
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

        if (
          modalInteraction.customId ===
          `${CUSTOM_DECLINE_REASON_MODAL_ID}-${signupId}`
        ) {
          await this.handleCustomReasonSubmit(
            modalInteraction,
            signup,
            reviewer,
            reviewMessage,
          );
        }
      } catch (error) {
        this.handleTimeoutError(
          error,
          signup,
          reviewer,
          reviewMessage,
          `Custom decline reason modal timed out for signup ${signupId}`,
        );
      }
    } else {
      // Use predefined reason
      await this.updateSignupWithDeclineReason(
        signup,
        selectedValue,
        reviewer,
        reviewMessage,
      );
      await interaction.reply({
        content: `✅ Decline reason recorded: "${selectedValue}"`,
        flags: MessageFlags.Ephemeral,
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

    await this.updateSignupWithDeclineReason(
      signup,
      customReason,
      reviewer,
      reviewMessage,
    );
    await interaction.reply({
      content: `✅ Custom decline reason recorded: "${customReason}"`,
      flags: MessageFlags.Ephemeral,
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

      // Dispatch the decline reason event with the collected reason
      this.dispatchDeclineReasonEvent(
        signup,
        reviewer,
        reviewMessage,
        declineReason,
      );
    } catch (error) {
      this.reportError(error, { signup, reviewer });
      this.logger.error(
        error,
        `Failed to update signup ${signup.discordId}-${signup.encounter} with decline reason`,
      );
    }
  }

  private dispatchDeclineReasonEvent(
    signup: SignupDocument,
    reviewer: User,
    reviewMessage: Message<true>,
    declineReason?: string,
  ): void {
    try {
      const declineEvent = new SignupDeclineReasonCollectedEvent(
        signup,
        reviewer,
        reviewMessage,
        declineReason,
      );
      this.eventBus.publish(declineEvent);

      this.logger.log(
        `Dispatched SignupDeclineReasonCollectedEvent for signup ${signup.discordId}-${signup.encounter}${
          declineReason
            ? ` with reason: ${declineReason}`
            : ' (no specific reason)'
        }`,
      );
    } catch (error) {
      this.reportError(error, { signup, reviewer });
      this.logger.error(
        error,
        `Failed to dispatch SignupDeclineReasonCollectedEvent for signup ${signup.discordId}-${signup.encounter}`,
      );
    }
  }

  private handleTimeoutError(
    error: unknown,
    signup: SignupDocument,
    reviewer: User,
    reviewMessage: Message<true>,
    context: string,
  ): void {
    if (
      error instanceof DiscordjsError &&
      error.code === DiscordjsErrorCodes.InteractionCollectorError
    ) {
      this.logger.warn(context);
      // Dispatch event on timeout with no decline reason
      this.dispatchDeclineReasonEvent(signup, reviewer, reviewMessage);
    } else {
      // Re-throw non-timeout errors
      this.reportError(error, { signup, reviewer });
      throw error;
    }
  }

  private reportError(
    error: unknown,
    context: { signup: SignupDocument; reviewer: User },
  ): void {
    const scope = Sentry.getCurrentScope();
    scope.setExtra('signup', context.signup);
    scope.setExtra('reviewer', context.reviewer);
    scope.captureException(error);
  }
}
