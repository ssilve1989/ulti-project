import { Injectable, Logger } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { SentryTraced } from '@sentry/nestjs';
import type { SignupDocument } from '@ulti-project/shared';
import {
  ActionRowBuilder,
  ComponentType,
  type InteractionResponse,
  type Message,
  MessageFlags,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  type User,
} from 'discord.js';
import { isSameUserFilter } from '../../common/collection-filters.js';
import {
  isInteractionCollectorTimeoutError,
  MAX_MODAL_SHOW_ATTEMPTS,
} from '../../common/discord-interaction.guards.js';
import { DiscordService } from '../../discord/discord.service.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import {
  CUSTOM_DECLINE_REASON_INPUT_ID,
  CUSTOM_DECLINE_REASON_MODAL_ID,
  createCustomDeclineReasonModal,
  createDeclineReasonRequestEmbed,
  createDeclineReasonSelectMenu,
  DECLINE_REASON_SELECT_ID,
} from './decline-reason.components.js';
import { SignupDeclineReasonCollectedEvent } from './events/signup.events.js';
import {
  reportReviewFlowError,
  showModalOrAskRetry,
} from './review-dm-flow.helpers.js';
import { CUSTOM_DECLINE_REASON_VALUE } from './signup.consts.js';

// Re-exported for spec imports that still reach for it here.
export { MAX_MODAL_SHOW_ATTEMPTS };

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
      let attempts = 0;

      while (attempts < MAX_MODAL_SHOW_ATTEMPTS) {
        const selectInteraction = await dmMessage.awaitMessageComponent({
          filter: isSameUserFilter(reviewer),
          componentType: ComponentType.StringSelect,
          time: timeout,
        });

        if (
          selectInteraction.customId !==
          `${DECLINE_REASON_SELECT_ID}-${signupId}`
        ) {
          // Some other component interaction on this message — not a failed
          // modal attempt, so it doesn't count against the retry budget.
          continue;
        }

        const handled = await this.handleReasonSelection(
          selectInteraction,
          signup,
          signupId,
          reviewer,
          reviewMessage,
        );

        if (handled) {
          return;
        }

        // Only reaches here when the modal failed to show (handleReasonSelection
        // returned false) — counts toward the bounded retry budget.
        attempts++;
      }

      this.logger.warn(
        `Gave up on the custom decline reason modal for signup ${signupId} after ${MAX_MODAL_SHOW_ATTEMPTS} attempts`,
      );
      this.dispatchDeclineReasonEvent(signup, reviewer, reviewMessage);
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
  ): Promise<boolean> {
    const selectedValue = interaction.values[0];

    if (selectedValue === CUSTOM_DECLINE_REASON_VALUE) {
      // Show modal for custom reason
      const modal = createCustomDeclineReasonModal(signupId);

      const shown = await showModalOrAskRetry(interaction, modal, {
        signupId,
        retryPrompt:
          'That took a moment too long to open — please click the dropdown again to provide a custom decline reason.',
        logger: this.logger,
      });

      if (!shown) {
        return false;
      }

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
      // Use predefined reason. Defer first: updateSignupWithDeclineReason is a
      // Firestore round-trip that can outlast the interaction-ack window.
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await this.updateSignupWithDeclineReason(
        signup,
        selectedValue,
        reviewer,
        reviewMessage,
      );
      await interaction.editReply({
        content: `✅ Decline reason recorded: "${selectedValue}"`,
      });
    }

    return true;
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

    // Defer before the Firestore write so a slow write can't invalidate the
    // modal-submit token by the time we reply.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await this.updateSignupWithDeclineReason(
      signup,
      customReason,
      reviewer,
      reviewMessage,
    );
    await interaction.editReply({
      content: `✅ Custom decline reason recorded: "${customReason}"`,
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
    if (isInteractionCollectorTimeoutError(error)) {
      this.logger.warn(context);
      // Dispatch event on timeout with no decline reason
      this.dispatchDeclineReasonEvent(signup, reviewer, reviewMessage);
      return;
    }

    // Any other failure is terminal: capture it once, here. Nothing downstream
    // of the fire-and-forget entrypoint consumes a rejection.
    this.reportError(error, { signup, reviewer });
    this.logger.error(error, context);
  }

  private reportError(
    error: unknown,
    context: { signup: SignupDocument; reviewer: User },
  ): void {
    reportReviewFlowError(error, context);
  }
}
