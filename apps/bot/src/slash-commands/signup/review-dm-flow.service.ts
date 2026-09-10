import { Injectable, Logger } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import type { SignupDocument } from '@ulti-project/shared';
import {
  ActionRowBuilder,
  type ButtonInteraction,
  ComponentType,
  type InteractionResponse,
  type MappedInteractionTypes,
  type Message,
  type MessageComponentInteraction,
  type MessageComponentType,
  MessageFlags,
  type RepliableInteraction,
  type StringSelectMenuInteraction,
  type User,
} from 'discord.js';
import { isSameUserFilter } from '../../common/collection-filters.js';
import {
  isInteractionCollectorTimeoutError,
  MAX_MODAL_SHOW_ATTEMPTS,
} from '../../common/discord-interaction.guards.js';
import { DiscordService } from '../../discord/discord.service.js';
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
  reportReviewFlowError,
  showModalOrAskRetry,
} from './review-dm-flow.helpers.js';
import { CUSTOM_DECLINE_REASON_VALUE } from './signup.consts.js';

/** Each step of a review DM (button/select, then modal) times out after this. */
const STEP_TIMEOUT_MS = 5 * 60 * 1000;

const signupKey = (signup: SignupDocument): string =>
  `${signup.discordId}-${signup.encounter}`;

/**
 * Outcome of one pass of an interaction handler inside `runComponentRetryLoop`:
 * `done` with the collected value (which may be `undefined` — skipped, blank),
 * or not done, meaning a modal failed to open and the trigger should be
 * re-offered against the bounded retry budget.
 */
type StepResult = { done: true; value: string | undefined } | { done: false };

/**
 * Drives the optional follow-up DM a reviewer gets after approving or declining
 * a signup: an approval comment, or a decline reason. Each `collect*` method
 * sends the reviewer a DM with a component, waits for their response against a
 * bounded retry budget, and *returns* whatever it collected — or `undefined` on
 * skip / blank / timeout / failure. Persisting the value and notifying the
 * signee are the caller's job, once it holds the value.
 */
@Injectable()
export class ReviewDmFlowService {
  private readonly logger = new Logger(ReviewDmFlowService.name);

  constructor(private readonly discordService: DiscordService) {}

  // ---------------------------------------------------------------------------
  // Approval comment flow
  // ---------------------------------------------------------------------------

  @SentryTraced()
  async collectApprovalComment(
    signup: SignupDocument,
    reviewer: User,
  ): Promise<string | undefined> {
    const signupId = signupKey(signup);

    try {
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

      return await this.runComponentRetryLoop(
        dmMessage,
        reviewer,
        ComponentType.Button,
        (interaction) => this.handleCommentButton(interaction, signupId),
        signupId,
      );
    } catch (error) {
      return this.settleFlowError(error, signupId, 'approval-comment', {
        signup,
        reviewer,
      });
    }
  }

  private async handleCommentButton(
    interaction: ButtonInteraction,
    signupId: string,
  ): Promise<StepResult> {
    if (
      interaction.customId === `${APPROVAL_COMMENT_SKIP_BUTTON_ID}-${signupId}`
    ) {
      await this.ackReviewer(
        interaction,
        '✅ Approval sent without a comment.',
      );
      return { done: true, value: undefined };
    }

    const shown = await showModalOrAskRetry(
      interaction,
      createApprovalCommentModal(signupId),
      {
        signupId,
        retryPrompt:
          'That took a moment too long to open — please click the button again to add a comment.',
        logger: this.logger,
      },
    );

    if (!shown) {
      return { done: false };
    }

    const comment = await this.awaitModalValue(interaction, {
      modalId: `${APPROVAL_COMMENT_MODAL_ID}-${signupId}`,
      inputId: APPROVAL_COMMENT_INPUT_ID,
      ackWith: (value) =>
        `✅ Comment saved — it'll reach the user with their approval:\n>>> ${value}`,
      ackWithout: '✅ Approval sent without a comment.',
    });

    return { done: true, value: comment };
  }

  // ---------------------------------------------------------------------------
  // Decline reason flow
  // ---------------------------------------------------------------------------

  @SentryTraced()
  async collectDeclineReason(
    signup: SignupDocument,
    reviewer: User,
  ): Promise<string | undefined> {
    const signupId = signupKey(signup);

    try {
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

      return await this.runComponentRetryLoop(
        dmMessage,
        reviewer,
        ComponentType.StringSelect,
        (interaction) => this.handleReasonSelection(interaction, signupId),
        signupId,
      );
    } catch (error) {
      return this.settleFlowError(error, signupId, 'decline-reason', {
        signup,
        reviewer,
      });
    }
  }

  private async handleReasonSelection(
    interaction: StringSelectMenuInteraction,
    signupId: string,
  ): Promise<StepResult> {
    const selectedValue = interaction.values[0];

    if (selectedValue !== CUSTOM_DECLINE_REASON_VALUE) {
      await this.ackReviewer(
        interaction,
        `✅ Decline reason recorded: "${selectedValue}"`,
      );
      return { done: true, value: selectedValue };
    }

    const shown = await showModalOrAskRetry(
      interaction,
      createCustomDeclineReasonModal(signupId),
      {
        signupId,
        retryPrompt:
          'That took a moment too long to open — please click the dropdown again to provide a custom decline reason.',
        logger: this.logger,
      },
    );

    if (!shown) {
      return { done: false };
    }

    const reason = await this.awaitModalValue(interaction, {
      modalId: `${CUSTOM_DECLINE_REASON_MODAL_ID}-${signupId}`,
      inputId: CUSTOM_DECLINE_REASON_INPUT_ID,
      ackWith: (value) => `✅ Custom decline reason recorded: "${value}"`,
      ackWithout: '✅ Decline sent without a specific reason.',
    });

    return { done: true, value: reason };
  }

  // ---------------------------------------------------------------------------
  // Shared plumbing
  // ---------------------------------------------------------------------------

  /**
   * Wait for the reviewer to act on the DM's component. `handleStep` resolves
   * `{ done: true, value }` once the flow is settled, or `{ done: false }` when
   * a modal failed to open — the latter re-offers the trigger against the
   * bounded `MAX_MODAL_SHOW_ATTEMPTS` budget. A spent budget resolves to
   * `undefined`; a collector timeout or any other rejection propagates to the
   * caller's `catch`.
   */
  private async runComponentRetryLoop<T extends MessageComponentType>(
    dmMessage: Message<false> | InteractionResponse<false>,
    reviewer: User,
    componentType: T,
    handleStep: (
      interaction: MappedInteractionTypes<false>[T],
    ) => Promise<StepResult>,
    signupId: string,
  ): Promise<string | undefined> {
    let attempts = 0;

    while (attempts < MAX_MODAL_SHOW_ATTEMPTS) {
      const interaction = await dmMessage.awaitMessageComponent({
        filter: isSameUserFilter(reviewer),
        componentType,
        time: STEP_TIMEOUT_MS,
      });

      const result = await handleStep(interaction);
      if (result.done) {
        return result.value;
      }

      attempts++;
    }

    this.logger.warn(
      `Gave up on the review DM for signup ${signupId} after ${MAX_MODAL_SHOW_ATTEMPTS} attempts`,
    );
    return undefined;
  }

  /**
   * Await the modal submission that follows a trigger, returning its trimmed
   * input (or `undefined` when blank or mismatched) and acking the reviewer
   * either way. A rejected wait (collector timeout included) propagates to the
   * caller's `catch`.
   */
  private async awaitModalValue(
    trigger: MessageComponentInteraction,
    {
      modalId,
      inputId,
      ackWith,
      ackWithout,
    }: {
      modalId: string;
      inputId: string;
      ackWith: (value: string) => string;
      ackWithout: string;
    },
  ): Promise<string | undefined> {
    const submit = await trigger.awaitModalSubmit({
      filter: isSameUserFilter(trigger.user),
      time: STEP_TIMEOUT_MS,
    });

    if (submit.customId !== modalId) {
      return undefined;
    }

    const value = submit.fields.getTextInputValue(inputId).trim();
    await this.ackReviewer(submit, value ? ackWith(value) : ackWithout);
    return value || undefined;
  }

  /**
   * Terminal outcome for a `collect*` flow. A collector timeout means the
   * reviewer never responded — the approval or decline still stands, so just
   * warn. Any other failure is captured to Sentry and logged once, never
   * rethrown into the fire-and-forget caller. Always resolves `undefined`.
   */
  private settleFlowError(
    error: unknown,
    signupId: string,
    flow: 'approval-comment' | 'decline-reason',
    scope: { signup: SignupDocument; reviewer: User },
  ): undefined {
    if (isInteractionCollectorTimeoutError(error)) {
      this.logger.warn(`Timed out on the ${flow} flow for signup ${signupId}`);
      return undefined;
    }

    reportReviewFlowError(error, scope);
    this.logger.error(
      error,
      `Failed on the ${flow} flow for signup ${signupId}`,
    );
    return undefined;
  }

  /** Ephemeral ack to the reviewer's interaction, best-effort. */
  private async ackReviewer(
    interaction: RepliableInteraction,
    content: string,
  ): Promise<void> {
    try {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    } catch (error) {
      this.logger.warn(error, 'Could not ack the reviewer on the review DM');
    }
  }
}
