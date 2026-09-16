import {
  type ButtonInteraction,
  DiscordAPIError,
  type ModalSubmitInteraction,
  RESTJSONErrorCodes,
} from 'discord.js';
import { isSameUserFilter } from '../../common/collection-filters.js';
import {
  APPROVAL_COMMENT_INPUT_ID,
  createApprovalCommentModal,
} from './approval-decision.components.js';

/**
 * A screen's modal counter. discord.js has no "modal closed" event, so a modal
 * dismissed with Esc leaves its submit listener parked on the message and a
 * later click's submit reaches both listeners. Bumping the counter per click
 * lets the stale listener recognise that it is no longer the newest.
 */
export interface ModalGenerationState {
  modalGeneration: number;
}

export interface CollectedComment {
  submission: ModalSubmitInteraction;
  /** `undefined` rather than '' when the reviewer left the field blank. */
  comment: string | undefined;
}

/**
 * Shows the approval comment modal and waits for the reviewer to submit it.
 *
 * Resolves `undefined` when the click's token expired before the modal could
 * open — the reviewer is DMed `expiredMessage` and can click again — or when a
 * newer click has since shown its own modal. Rejects with the collector's
 * timeout error at `deadline`, leaving callers to decide whether that ends
 * their flow or is reported by an outer collector.
 */
export async function collectApprovalComment(
  interaction: ButtonInteraction,
  state: ModalGenerationState,
  { deadline, expiredMessage }: { deadline: number; expiredMessage: string },
): Promise<CollectedComment | undefined> {
  state.modalGeneration += 1;
  const generation = state.modalGeneration;

  try {
    await interaction.showModal(createApprovalCommentModal());
  } catch (error) {
    if (
      error instanceof DiscordAPIError &&
      error.code === RESTJSONErrorCodes.UnknownInteraction
    ) {
      // recoverable: the collector is still running, so a second click
      // arrives with a fresh interaction token
      await interaction.user.send(expiredMessage);
      return undefined;
    }
    throw error;
  }

  const submission = await interaction.awaitModalSubmit({
    // scoped to this button's message too: an unresolved listener from a
    // prior request would otherwise still match on user alone and could grab
    // a modal submit meant for a different screen
    filter: (modalInteraction) =>
      isSameUserFilter(interaction.user)(modalInteraction) &&
      modalInteraction.message?.id === interaction.message.id,
    // floor of 1: discord.js only arms its timer for a truthy `time`, so a
    // deadline already past must still fail fast rather than hang
    time: Math.max(deadline - Date.now(), 1),
  });

  if (generation !== state.modalGeneration) {
    // stale listener: the newest click's own listener handles this submit
    return undefined;
  }

  const comment = submission.fields
    .getTextInputValue(APPROVAL_COMMENT_INPUT_ID)
    .trim();

  return { submission, comment: comment || undefined };
}
