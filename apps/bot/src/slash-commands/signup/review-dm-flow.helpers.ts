import type { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { SignupDocument } from '@ulti-project/shared';
import {
  DiscordAPIError,
  type MessageComponentInteraction,
  type ModalBuilder,
  type User,
} from 'discord.js';

/** Discord's "Unknown interaction" — the interaction token has expired. */
const UNKNOWN_INTERACTION_CODE = 10062;

/**
 * Attach the signup + reviewer context to the current Sentry scope and capture
 * `error`. Shared by the approval-comment and decline-reason review-DM flows.
 */
export function reportReviewFlowError(
  error: unknown,
  context: { signup: SignupDocument; reviewer: User },
): void {
  const scope = Sentry.getCurrentScope();
  scope.setExtra('signup', context.signup);
  scope.setExtra('reviewer', context.reviewer);
  scope.captureException(error);
}

interface ShowModalOptions {
  signupId: string;
  /** DM sent to the reviewer when the interaction token has already expired. */
  retryPrompt: string;
  logger: Logger;
}

/**
 * Show `modal` in response to `interaction`. If Discord has already invalidated
 * the interaction token (error 10062 — the reviewer sat on the trigger too
 * long), DM them `retryPrompt` and return `false` so the caller can re-offer the
 * trigger against its bounded retry budget. Any other failure is rethrown.
 */
export async function showModalOrAskRetry(
  interaction: MessageComponentInteraction,
  modal: ModalBuilder,
  { signupId, retryPrompt, logger }: ShowModalOptions,
): Promise<boolean> {
  try {
    await interaction.showModal(modal);
    return true;
  } catch (error) {
    if (
      error instanceof DiscordAPIError &&
      error.code === UNKNOWN_INTERACTION_CODE
    ) {
      logger.warn(
        `Modal token expired before it could be shown for signup ${signupId}, asking reviewer to retry`,
      );
      await interaction.user.send(retryPrompt);
      return false;
    }

    throw error;
  }
}
