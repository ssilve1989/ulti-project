import { Injectable, Logger } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { SentryTraced } from '@sentry/nestjs';
import {
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '@ulti-project/shared';
import {
  ActionRowBuilder,
  type ButtonInteraction,
  ComponentType,
  type InteractionResponse,
  type MappedInteractionTypes,
  type Message,
  type MessageComponentType,
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
  APPROVAL_COMMENT_INPUT_ID,
  APPROVAL_COMMENT_MODAL_ID,
  APPROVAL_COMMENT_SKIP_BUTTON_ID,
  createApprovalCommentButtons,
  createApprovalCommentModal,
  createApprovalCommentRequestEmbed,
} from './approval-comment.components.js';
import {
  CUSTOM_DECLINE_REASON_INPUT_ID,
  CUSTOM_DECLINE_REASON_MODAL_ID,
  createCustomDeclineReasonModal,
  createDeclineReasonRequestEmbed,
  createDeclineReasonSelectMenu,
} from './decline-reason.components.js';
import {
  SignupApprovalCommentCollectedEvent,
  SignupDeclineReasonCollectedEvent,
} from './events/signup.events.js';
import {
  reportReviewFlowError,
  showModalOrAskRetry,
} from './review-dm-flow.helpers.js';
import { CUSTOM_DECLINE_REASON_VALUE } from './signup.consts.js';

/** Each step of a review DM (button/select, then modal) times out after this. */
const STEP_TIMEOUT_MS = 5 * 60 * 1000;

const signupKey = (signup: SignupDocument): string =>
  `${signup.discordId}-${signup.encounter}`;

/**
 * Drives the optional follow-up DM a reviewer gets after approving or declining a
 * signup: an approval comment, or a decline reason. Both flows send the reviewer
 * a DM with a component, wait for a response against a bounded retry budget, and
 * relay whatever they collect to the user via an event — so the shared plumbing
 * (`runComponentRetryLoop`, `handleTerminalError`) lives here once.
 */
@Injectable()
export class ReviewDmFlowService {
  private readonly logger = new Logger(ReviewDmFlowService.name);

  constructor(
    private readonly discordService: DiscordService,
    private readonly signupCollection: SignupCollection,
    private readonly eventBus: EventBus,
  ) {}

  // ---------------------------------------------------------------------------
  // Approval comment flow
  // ---------------------------------------------------------------------------

  @SentryTraced()
  async requestApprovalComment(
    signup: SignupDocument,
    reviewer: User,
    reviewMessage: Message<true>,
  ): Promise<void> {
    try {
      const signupId = signupKey(signup);
      const dmMessage = await this.discordService.sendDirectMessage(
        reviewer.id,
        {
          embeds: [
            createApprovalCommentRequestEmbed(
              signup.username,
              signup.encounter,
            ),
          ],
          components: [createApprovalCommentButtons(signupId)],
        },
      );

      await this.handleApprovalCommentInteractions(
        dmMessage,
        signup,
        reviewer,
        reviewMessage,
      );
    } catch (error) {
      reportReviewFlowError(error, { signup, reviewer });
      this.logger.error(
        error,
        `Failed to request approval comment for signup ${signupKey(signup)}`,
      );
    }
  }

  private async handleApprovalCommentInteractions(
    dmMessage: Message<false> | InteractionResponse<false>,
    signup: SignupDocument,
    reviewer: User,
    reviewMessage: Message<true>,
  ): Promise<void> {
    const signupId = signupKey(signup);

    await this.runComponentRetryLoop(
      dmMessage,
      reviewer,
      ComponentType.Button,
      (interaction) =>
        this.handleButtonInteraction(
          interaction,
          signup,
          signupId,
          reviewer,
          reviewMessage,
        ),
      {
        onExhausted: () =>
          this.logger.warn(
            `Gave up on the approval comment modal for signup ${signupId} after ${MAX_MODAL_SHOW_ATTEMPTS} attempts`,
          ),
        onError: (error) =>
          this.handleTerminalError(
            error,
            `Approval comment request timed out for signup ${signupId}`,
            { signup, reviewer },
          ),
      },
    );
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
        time: STEP_TIMEOUT_MS,
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
      this.handleTerminalError(
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

    // Persisting is a Firestore round-trip that can outlast the ~3s
    // interaction-ack window; deferring first keeps the later reply valid.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!(await this.isSignupStillApproved(signup))) {
      await interaction.editReply({
        content:
          'ℹ️ This signup is no longer approved, so your comment was not sent.',
      });
      return;
    }

    // Once the comment is in hand it reaches the user via the dispatched event.
    // A transient Firestore failure must not drop it — persist best-effort, then
    // dispatch regardless and tell the reviewer if the record write failed.
    let recorded = true;
    try {
      await this.persistApprovalComment(signup, comment);
    } catch (error) {
      recorded = false;
      reportReviewFlowError(error, { signup, reviewer });
      this.logger.error(
        error,
        `Failed to record approval comment for signup ${signupKey(signup)}`,
      );
    }

    this.dispatchApprovalCommentEvent(signup, reviewer, reviewMessage, comment);

    await interaction.editReply({
      content: recorded
        ? `✅ Comment saved — it'll reach the user with their approval:\n>>> ${comment}`
        : `⚠️ Sent to the user, but it couldn't be saved to the signup record:\n>>> ${comment}`,
    });
  }

  /**
   * A late modal submit can land minutes after the reviewer opened it, by which
   * time the signup may have been declined, removed, or edited. Re-read it so we
   * don't DM the user an "approved" note for a signup that no longer is. If the
   * lookup itself fails we fail open — a blip must not block the comment.
   */
  private async isSignupStillApproved(
    signup: SignupDocument,
  ): Promise<boolean> {
    // A cleared signup's document is deleted on approval — nothing to re-check,
    // and the DM is its only delivery path.
    if (signup.partyStatus === PartyStatus.Cleared) {
      return true;
    }

    try {
      const current = await this.signupCollection.findById(
        SignupCollection.getKeyForSignup({
          discordId: signup.discordId,
          encounter: signup.encounter,
        }),
      );

      return current?.status === SignupStatus.APPROVED;
    } catch (error) {
      this.logger.warn(
        `Could not re-check approval state for signup ${signupKey(signup)}; proceeding with the comment`,
      );
      this.logger.error(error);
      return true;
    }
  }

  private async persistApprovalComment(
    signup: SignupDocument,
    approvalComment: string,
  ): Promise<void> {
    // A cleared signup has its Firestore document deleted on approval, so there
    // is nothing to write to — the DM still goes out via the dispatched event.
    if (signup.partyStatus === PartyStatus.Cleared) {
      return;
    }

    await this.signupCollection.updateApprovalComment(
      { discordId: signup.discordId, encounter: signup.encounter },
      approvalComment,
    );
    this.logger.log(
      `Updated signup ${signupKey(signup)} with approval comment`,
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
      reportReviewFlowError(error, { signup, reviewer });
      this.logger.error(
        error,
        `Failed to dispatch SignupApprovalCommentCollectedEvent for signup ${signupKey(signup)}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Decline reason flow
  // ---------------------------------------------------------------------------

  @SentryTraced()
  async requestDeclineReason(
    signup: SignupDocument,
    reviewer: User,
    reviewMessage: Message<true>,
  ): Promise<void> {
    try {
      const signupId = signupKey(signup);
      const selectMenu = createDeclineReasonSelectMenu(signupId);
      const dmMessage = await this.discordService.sendDirectMessage(
        reviewer.id,
        {
          embeds: [
            createDeclineReasonRequestEmbed(signup.username, signup.encounter),
          ],
          components: [
            new ActionRowBuilder<typeof selectMenu>().addComponents(selectMenu),
          ],
        },
      );

      await this.handleDeclineReasonInteractions(
        dmMessage,
        signup,
        reviewer,
        reviewMessage,
      );
    } catch (error) {
      reportReviewFlowError(error, { signup, reviewer });
      this.logger.error(
        error,
        `Failed to request decline reason for signup ${signupKey(signup)}`,
      );
    }
  }

  private async handleDeclineReasonInteractions(
    dmMessage: Message<false> | InteractionResponse<false>,
    signup: SignupDocument,
    reviewer: User,
    reviewMessage: Message<true>,
  ): Promise<void> {
    const signupId = signupKey(signup);

    await this.runComponentRetryLoop(
      dmMessage,
      reviewer,
      ComponentType.StringSelect,
      (interaction) =>
        this.handleReasonSelection(
          interaction,
          signup,
          signupId,
          reviewer,
          reviewMessage,
        ),
      {
        onExhausted: () => {
          this.logger.warn(
            `Gave up on the custom decline reason modal for signup ${signupId} after ${MAX_MODAL_SHOW_ATTEMPTS} attempts`,
          );
          this.dispatchDeclineReasonEvent(signup, reviewer, reviewMessage);
        },
        onError: (error) =>
          this.handleTerminalError(
            error,
            `Decline reason request timed out for signup ${signupId}`,
            { signup, reviewer },
            () =>
              this.dispatchDeclineReasonEvent(signup, reviewer, reviewMessage),
          ),
      },
    );
  }

  private async handleReasonSelection(
    interaction: StringSelectMenuInteraction,
    signup: SignupDocument,
    signupId: string,
    reviewer: User,
    reviewMessage: Message<true>,
  ): Promise<boolean> {
    const selectedValue = interaction.values[0];

    if (selectedValue !== CUSTOM_DECLINE_REASON_VALUE) {
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
      return true;
    }

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
        time: STEP_TIMEOUT_MS,
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
      this.handleTerminalError(
        error,
        `Custom decline reason modal timed out for signup ${signupId}`,
        { signup, reviewer },
        () => this.dispatchDeclineReasonEvent(signup, reviewer, reviewMessage),
      );
    }

    return true;
  }

  private async handleCustomReasonSubmit(
    interaction: ModalSubmitInteraction,
    signup: SignupDocument,
    reviewer: User,
    reviewMessage: Message<true>,
  ): Promise<void> {
    const customReason = interaction.fields
      .getTextInputValue(CUSTOM_DECLINE_REASON_INPUT_ID)
      .trim();

    // Defer before any Firestore write so a slow write can't invalidate the
    // modal-submit token by the time we reply.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!customReason) {
      // Blank submission — fall back to the no-reason decline, same as a
      // selection timeout. The user is still notified of the decline.
      this.dispatchDeclineReasonEvent(signup, reviewer, reviewMessage);
      await interaction.editReply({
        content: '✅ Decline sent without a specific reason.',
      });
      return;
    }

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
    // The reason reaches the declined user via the dispatched event. A transient
    // Firestore failure must not drop it — persist best-effort, then dispatch
    // regardless.
    try {
      await this.signupCollection.updateDeclineReason(
        { discordId: signup.discordId, encounter: signup.encounter },
        declineReason,
      );

      this.logger.log(
        `Updated signup ${signupKey(signup)} with decline reason: ${declineReason}`,
      );
    } catch (error) {
      reportReviewFlowError(error, { signup, reviewer });
      this.logger.error(
        error,
        `Failed to update signup ${signupKey(signup)} with decline reason`,
      );
    }

    this.dispatchDeclineReasonEvent(
      signup,
      reviewer,
      reviewMessage,
      declineReason,
    );
  }

  private dispatchDeclineReasonEvent(
    signup: SignupDocument,
    reviewer: User,
    reviewMessage: Message<true>,
    declineReason?: string,
  ): void {
    try {
      this.eventBus.publish(
        new SignupDeclineReasonCollectedEvent(
          signup,
          reviewer,
          reviewMessage,
          declineReason,
        ),
      );
    } catch (error) {
      reportReviewFlowError(error, { signup, reviewer });
      this.logger.error(
        error,
        `Failed to dispatch SignupDeclineReasonCollectedEvent for signup ${signupKey(signup)}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Shared plumbing
  // ---------------------------------------------------------------------------

  /**
   * Wait for the reviewer to act on the DM's component. `handleInteraction`
   * returns `true` once the flow is resolved (or deliberately skipped) and
   * `false` when a modal failed to open — the latter re-offers the trigger
   * against the bounded `MAX_MODAL_SHOW_ATTEMPTS` budget. `onExhausted` runs when
   * the budget is spent; `onError` handles a collector timeout or any other
   * rejection (nothing downstream of the fire-and-forget entrypoint consumes it).
   */
  private async runComponentRetryLoop<T extends MessageComponentType>(
    dmMessage: Message<false> | InteractionResponse<false>,
    reviewer: User,
    componentType: T,
    handleInteraction: (
      interaction: MappedInteractionTypes<false>[T],
    ) => Promise<boolean>,
    {
      onExhausted,
      onError,
    }: { onExhausted: () => void; onError: (error: unknown) => void },
  ): Promise<void> {
    try {
      let attempts = 0;

      while (attempts < MAX_MODAL_SHOW_ATTEMPTS) {
        const interaction = await dmMessage.awaitMessageComponent({
          filter: isSameUserFilter(reviewer),
          componentType,
          time: STEP_TIMEOUT_MS,
        });

        if (await handleInteraction(interaction)) {
          return;
        }

        attempts++;
      }

      onExhausted();
    } catch (error) {
      onError(error);
    }
  }

  /**
   * A collector timeout means the reviewer never responded — the approval or
   * decline still stands, so just warn (and run `onTimeout`, which the decline
   * flow uses to still notify the user). Any other failure is terminal: capture
   * it once, here.
   */
  private handleTerminalError(
    error: unknown,
    logMessage: string,
    scope: { signup: SignupDocument; reviewer: User },
    onTimeout?: () => void,
  ): void {
    if (isInteractionCollectorTimeoutError(error)) {
      this.logger.warn(logMessage);
      onTimeout?.();
      return;
    }

    reportReviewFlowError(error, scope);
    this.logger.error(error, logMessage);
  }
}
