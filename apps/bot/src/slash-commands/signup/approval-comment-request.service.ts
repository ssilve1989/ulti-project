import { Injectable, Logger } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { SentryTraced } from '@sentry/nestjs';
import { PartyStatus, type SignupDocument } from '@ulti-project/shared';
import {
  type ButtonInteraction,
  ComponentType,
  type InteractionResponse,
  type Message,
  MessageFlags,
  type ModalSubmitInteraction,
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
  APPROVAL_COMMENT_ADD_BUTTON_ID,
  APPROVAL_COMMENT_INPUT_ID,
  APPROVAL_COMMENT_MODAL_ID,
  APPROVAL_COMMENT_SKIP_BUTTON_ID,
  createApprovalCommentButtons,
  createApprovalCommentModal,
  createApprovalCommentRequestEmbed,
} from './approval-comment.components.js';
import { SignupApprovalCommentCollectedEvent } from './events/signup.events.js';
import {
  reportReviewFlowError,
  showModalOrAskRetry,
} from './review-dm-flow.helpers.js';

// Re-exported for spec imports that still reach for it here.
export { MAX_MODAL_SHOW_ATTEMPTS };

@Injectable()
export class ApprovalCommentRequestService {
  private readonly logger = new Logger(ApprovalCommentRequestService.name);

  constructor(
    private readonly discordService: DiscordService,
    private readonly signupCollection: SignupCollection,
    private readonly eventBus: EventBus,
  ) {}

  @SentryTraced()
  async requestApprovalComment(
    signup: SignupDocument,
    reviewer: User,
    reviewMessage: Message<true>,
  ): Promise<void> {
    try {
      const signupId = `${signup.discordId}-${signup.encounter}`;
      const embed = createApprovalCommentRequestEmbed(
        signup.username,
        signup.encounter,
      );
      const actionRow = createApprovalCommentButtons(signupId);

      const dmMessage = await this.discordService.sendDirectMessage(
        reviewer.id,
        {
          embeds: [embed],
          components: [actionRow],
        },
      );

      await this.handleApprovalCommentInteractions(
        dmMessage,
        signup,
        reviewer,
        reviewMessage,
      );
    } catch (error) {
      this.reportError(error, { signup, reviewer });
      this.logger.error(
        error,
        `Failed to request approval comment for signup ${signup.discordId}-${signup.encounter}`,
      );
    }
  }

  private async handleApprovalCommentInteractions(
    dmMessage: Message<false> | InteractionResponse<false>,
    signup: SignupDocument,
    reviewer: User,
    reviewMessage: Message<true>,
  ): Promise<void> {
    const signupId = `${signup.discordId}-${signup.encounter}`;
    const timeout = 5 * 60 * 1000; // 5 minutes
    const validCustomIds = new Set([
      `${APPROVAL_COMMENT_ADD_BUTTON_ID}-${signupId}`,
      `${APPROVAL_COMMENT_SKIP_BUTTON_ID}-${signupId}`,
    ]);

    try {
      let attempts = 0;

      while (attempts < MAX_MODAL_SHOW_ATTEMPTS) {
        const buttonInteraction = await dmMessage.awaitMessageComponent({
          filter: isSameUserFilter(reviewer),
          componentType: ComponentType.Button,
          time: timeout,
        });

        if (!validCustomIds.has(buttonInteraction.customId)) {
          // Some other component interaction on this message — not a failed
          // modal attempt, so it doesn't count against the retry budget.
          continue;
        }

        const handled = await this.handleButtonInteraction(
          buttonInteraction,
          signup,
          signupId,
          reviewer,
          reviewMessage,
        );

        if (handled) {
          return;
        }

        // Only reaches here when the modal failed to show (handleButtonInteraction
        // returned false) — counts toward the bounded retry budget.
        attempts++;
      }

      this.logger.warn(
        `Gave up on the approval comment modal for signup ${signupId} after ${MAX_MODAL_SHOW_ATTEMPTS} attempts`,
      );
    } catch (error) {
      this.handleTimeoutError(
        error,
        `Approval comment request timed out for signup ${signupId}`,
        { signup, reviewer },
      );
    }
  }

  private async handleButtonInteraction(
    interaction: ButtonInteraction,
    signup: SignupDocument,
    signupId: string,
    reviewer: User,
    reviewMessage: Message<true>,
  ): Promise<boolean> {
    if (
      interaction.customId === `${APPROVAL_COMMENT_SKIP_BUTTON_ID}-${signupId}`
    ) {
      await interaction.reply({
        content: '✅ Approval sent without a comment.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const modal = createApprovalCommentModal(signupId);

    const shown = await showModalOrAskRetry(interaction, modal, {
      signupId,
      retryPrompt:
        'That took a moment too long to open — please click the button again to add a comment.',
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
        modalInteraction.customId === `${APPROVAL_COMMENT_MODAL_ID}-${signupId}`
      ) {
        await this.handleCommentSubmit(
          modalInteraction,
          signup,
          reviewer,
          reviewMessage,
        );
      }
    } catch (error) {
      this.handleTimeoutError(
        error,
        `Approval comment modal timed out for signup ${signupId}`,
        { signup, reviewer },
      );
    }

    return true;
  }

  private async handleCommentSubmit(
    interaction: ModalSubmitInteraction,
    signup: SignupDocument,
    reviewer: User,
    reviewMessage: Message<true>,
  ): Promise<void> {
    const comment = interaction.fields
      .getTextInputValue(APPROVAL_COMMENT_INPUT_ID)
      .trim();

    if (!comment) {
      await interaction.reply({
        content: '✅ Approval sent without a comment.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await this.persistApprovalComment(signup, comment, reviewer, reviewMessage);

    await interaction.reply({
      content: `✅ Comment recorded and sent to the user:\n>>> ${comment}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  private async persistApprovalComment(
    signup: SignupDocument,
    approvalComment: string,
    reviewer: User,
    reviewMessage: Message<true>,
  ): Promise<void> {
    // A cleared signup has its Firestore document deleted on approval, so there
    // is nothing to write to — the DM still goes out via the dispatched event.
    if (signup.partyStatus !== PartyStatus.Cleared) {
      try {
        await this.signupCollection.updateApprovalComment(
          { discordId: signup.discordId, encounter: signup.encounter },
          approvalComment,
        );
        this.logger.log(
          `Updated signup ${signup.discordId}-${signup.encounter} with approval comment`,
        );
      } catch (error) {
        this.reportError(error, { signup, reviewer });
        this.logger.error(
          error,
          `Failed to persist approval comment for signup ${signup.discordId}-${signup.encounter}`,
        );
      }
    }

    this.dispatchApprovalCommentEvent(
      signup,
      reviewer,
      reviewMessage,
      approvalComment,
    );
  }

  private dispatchApprovalCommentEvent(
    signup: SignupDocument,
    reviewer: User,
    reviewMessage: Message<true>,
    approvalComment: string,
  ): void {
    try {
      this.eventBus.publish(
        new SignupApprovalCommentCollectedEvent(
          signup,
          reviewer,
          reviewMessage,
          approvalComment,
        ),
      );
    } catch (error) {
      this.reportError(error, { signup, reviewer });
      this.logger.error(
        error,
        `Failed to dispatch SignupApprovalCommentCollectedEvent for signup ${signup.discordId}-${signup.encounter}`,
      );
    }
  }

  private handleTimeoutError(
    error: unknown,
    context: string,
    scope: { signup: SignupDocument; reviewer: User },
  ): void {
    if (isInteractionCollectorTimeoutError(error)) {
      // Reviewer never responded — approval stands, just with no comment.
      this.logger.warn(context);
      return;
    }

    this.reportError(error, scope);
    throw error;
  }

  private reportError(
    error: unknown,
    context: { signup: SignupDocument; reviewer: User },
  ): void {
    reportReviewFlowError(error, context);
  }
}
