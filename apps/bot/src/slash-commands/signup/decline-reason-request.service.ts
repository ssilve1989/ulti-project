import { Injectable, Logger } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import { SentryTraced } from '@sentry/nestjs';
import { type SignupDocument, SignupStatus } from '@ulti-project/shared';
import {
  ActionRowBuilder,
  ComponentType,
  DiscordAPIError,
  DiscordjsError,
  DiscordjsErrorCodes,
  type InteractionResponse,
  type Message,
  MessageFlags,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  type User,
} from 'discord.js';
import { match } from 'ts-pattern';
import { isSameUserFilter } from '../../common/collection-filters.js';
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
  CUSTOM_DECLINE_REASON_VALUE,
  SIGNUP_MESSAGES,
} from './signup.consts.js';

export const MAX_MODAL_SHOW_ATTEMPTS = 3;

// `recorded`/`skipped` are both benign no-error outcomes; `failed` is kept
// distinct so callers can tell the reviewer nothing was saved instead of
// showing the same message as a successful recording.
type DeclineReasonUpdateOutcome =
  | { type: 'recorded' }
  | { type: 'skipped' }
  | { type: 'failed' };

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

      if (!(await this.wasApprovedSinceDecline(signup))) {
        this.dispatchDeclineReasonEvent(signup, reviewer, reviewMessage);
      }
    } catch (error) {
      await this.handleTimeoutError(
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

      try {
        await interaction.showModal(modal);
      } catch (error) {
        if (error instanceof DiscordAPIError && error.code === 10062) {
          this.logger.warn(
            `Modal token expired before it could be shown for signup ${signupId}, asking reviewer to retry`,
          );
          await interaction.user.send(
            'That took a moment too long to open — please click the dropdown again to provide a custom decline reason.',
          );
          return false;
        }
        throw error;
      }

      try {
        const modalInteraction = await interaction.awaitModalSubmit({
          // awaitModalSubmit's collector is client-wide (no message/channel
          // scope), so without the customId check it would also accept a
          // modal submit meant for a different signup's decline reason
          filter: (submission) =>
            isSameUserFilter(interaction.user)(submission) &&
            submission.customId ===
              `${CUSTOM_DECLINE_REASON_MODAL_ID}-${signupId}`,
          time: 5 * 60 * 1000, // 5 minutes
        });

        await this.handleCustomReasonSubmit(
          modalInteraction,
          signup,
          reviewer,
          reviewMessage,
        );
      } catch (error) {
        await this.handleTimeoutError(
          error,
          signup,
          reviewer,
          reviewMessage,
          `Custom decline reason modal timed out for signup ${signupId}`,
        );
      }
    } else {
      // Use predefined reason
      const outcome = await this.updateSignupWithDeclineReason(
        signup,
        selectedValue,
        reviewer,
        reviewMessage,
      );
      await interaction.reply({
        content: declineReasonReplyContent(
          outcome,
          `✅ Decline reason recorded: "${selectedValue}"`,
        ),
        flags: MessageFlags.Ephemeral,
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

    const outcome = await this.updateSignupWithDeclineReason(
      signup,
      customReason,
      reviewer,
      reviewMessage,
    );
    await interaction.reply({
      content: declineReasonReplyContent(
        outcome,
        `✅ Custom decline reason recorded: "${customReason}"`,
      ),
      flags: MessageFlags.Ephemeral,
    });
  }

  /**
   * Resolves `skipped` when nothing was recorded or published because the
   * signup has since been approved, or `failed` when the update (including
   * its own pre-read of the signup's current status) errored — distinct from
   * `skipped` so callers don't tell the reviewer a decline reason was
   * recorded when it was not.
   */
  private async updateSignupWithDeclineReason(
    signup: SignupDocument,
    declineReason: string,
    reviewer: User,
    reviewMessage: Message<true>,
  ): Promise<DeclineReasonUpdateOutcome> {
    try {
      if (await this.wasApprovedSinceDecline(signup)) {
        return { type: 'skipped' };
      }

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

      return { type: 'recorded' };
    } catch (error) {
      this.reportError(error, { signup, reviewer });
      this.logger.error(
        error,
        `Failed to update signup ${signup.discordId}-${signup.encounter} with decline reason`,
      );

      return { type: 'failed' };
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

  // `/edit-signup` can reverse the decline while this request is still open;
  // a reason or denial DM after that would contradict the applicant's approval
  private async wasApprovedSinceDecline(
    signup: SignupDocument,
  ): Promise<boolean> {
    const key = SignupCollection.getKeyForSignup(signup);
    const current = await this.signupCollection.findById(key);

    if (current?.status !== SignupStatus.APPROVED) {
      return false;
    }

    this.logger.log(
      `Signup ${key} was approved after being declined, skipping its decline reason and denial DM`,
    );
    return true;
  }

  private async handleTimeoutError(
    error: unknown,
    signup: SignupDocument,
    reviewer: User,
    reviewMessage: Message<true>,
    context: string,
  ): Promise<void> {
    if (
      error instanceof DiscordjsError &&
      error.code === DiscordjsErrorCodes.InteractionCollectorError
    ) {
      this.logger.warn(context);
      // Dispatch event on timeout with no decline reason
      if (!(await this.wasApprovedSinceDecline(signup))) {
        this.dispatchDeclineReasonEvent(signup, reviewer, reviewMessage);
      }
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

function declineReasonReplyContent(
  outcome: DeclineReasonUpdateOutcome,
  recordedContent: string,
): string {
  return match(outcome)
    .with({ type: 'recorded' }, () => recordedContent)
    .with(
      { type: 'skipped' },
      () => SIGNUP_MESSAGES.DECLINE_REASON_AFTER_APPROVAL,
    )
    .with(
      { type: 'failed' },
      () => SIGNUP_MESSAGES.DECLINE_REASON_RECORD_FAILED,
    )
    .exhaustive();
}
