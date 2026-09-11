import { Injectable, Logger } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import type { SignupDocument } from '@ulti-project/shared';
import {
  ActionRowBuilder,
  type ButtonInteraction,
  ComponentType,
  type MessageComponentInteraction,
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
} from './reviewer-follow-up-dm.helpers.js';
import { CUSTOM_DECLINE_REASON_VALUE } from './signup.consts.js';

/** Each step of a review DM (button/select, then modal) times out after this. */
const STEP_TIMEOUT_MS = 5 * 60 * 1000;

/** The composite key used throughout the signup flow to identify a signup in logs and component custom ids. */
export const signupKey = (signup: SignupDocument): string =>
  `${signup.discordId}-${signup.encounter}`;

/**
 * Sentinel returned by a step handler when a modal failed to open and the
 * trigger should be re-offered against the bounded retry budget. Distinct
 * from `undefined`, which means the flow settled with no collected value
 * (skipped, blank, or a mismatched modal submission).
 */
const RETRY = Symbol('retry');

/** Outcome of one pass of a step handler inside `runRetryLoop`. */
type StepOutcome = string | undefined | typeof RETRY;

/**
 * Drives the optional follow-up DM a reviewer gets after approving or declining
 * a signup: an approval comment, or a decline reason. Each `collect*` method
 * sends the reviewer a DM with a component, waits for their response against a
 * bounded retry budget, and *returns* whatever it collected — or `undefined` on
 * skip / blank / timeout / failure. Persisting the value and notifying the
 * signee are the caller's job, once it holds the value.
 */
@Injectable()
export class ReviewerFollowUpDmService {
  private readonly logger = new Logger(ReviewerFollowUpDmService.name);

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

      return await this.runRetryLoop(signupId, async () => {
        const interaction =
          await dmMessage.awaitMessageComponent<ComponentType.Button>({
            filter: isSameUserFilter(reviewer),
            componentType: ComponentType.Button,
            time: STEP_TIMEOUT_MS,
          });

        return this.handleCommentButton(interaction, signupId);
      });
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
  ): Promise<StepOutcome> {
    if (
      interaction.customId === `${APPROVAL_COMMENT_SKIP_BUTTON_ID}-${signupId}`
    ) {
      await this.ackReviewer(
        interaction,
        '✅ Approval sent without a comment.',
      );
      return undefined;
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
      return RETRY;
    }

    return this.awaitModalValue(interaction, {
      modalId: `${APPROVAL_COMMENT_MODAL_ID}-${signupId}`,
      inputId: APPROVAL_COMMENT_INPUT_ID,
      ackWith: (value) =>
        `✅ Comment saved — it'll reach the user with their approval:\n>>> ${value}`,
      ackWithout: '✅ Approval sent without a comment.',
    });
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

      return await this.runRetryLoop(signupId, async () => {
        const interaction =
          await dmMessage.awaitMessageComponent<ComponentType.StringSelect>({
            filter: isSameUserFilter(reviewer),
            componentType: ComponentType.StringSelect,
            time: STEP_TIMEOUT_MS,
          });

        return this.handleReasonSelection(interaction, signupId);
      });
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
  ): Promise<StepOutcome> {
    const selectedValue = interaction.values[0];

    if (selectedValue !== CUSTOM_DECLINE_REASON_VALUE) {
      await this.ackReviewer(
        interaction,
        `✅ Decline reason recorded: "${selectedValue}"`,
      );
      return selectedValue;
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
      return RETRY;
    }

    return this.awaitModalValue(interaction, {
      modalId: `${CUSTOM_DECLINE_REASON_MODAL_ID}-${signupId}`,
      inputId: CUSTOM_DECLINE_REASON_INPUT_ID,
      ackWith: (value) => `✅ Custom decline reason recorded: "${value}"`,
      ackWithout: '✅ Decline sent without a specific reason.',
    });
  }

  // ---------------------------------------------------------------------------
  // Shared plumbing
  // ---------------------------------------------------------------------------

  /**
   * Run `step` — which awaits the reviewer's next component interaction and
   * handles it — against the bounded `MAX_MODAL_SHOW_ATTEMPTS` retry budget.
   * `step` resolves the collected value (possibly `undefined` — skipped,
   * blank) once settled, or the `RETRY` sentinel when a modal failed to open,
   * which re-runs `step` to re-offer the trigger. A spent budget resolves to
   * `undefined`; a collector timeout or any other rejection propagates to the
   * caller's `catch`.
   */
  private async runRetryLoop(
    signupId: string,
    step: () => Promise<StepOutcome>,
  ): Promise<string | undefined> {
    let attempts = 0;

    while (attempts < MAX_MODAL_SHOW_ATTEMPTS) {
      const result = await step();
      if (result !== RETRY) {
        return result;
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
