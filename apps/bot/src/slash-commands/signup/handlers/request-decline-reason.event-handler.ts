import { Logger } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { SignupCollection } from '../../../firebase/collections/signup.collection.js';
import { SignupDeclinedEvent } from '../events/signup.events.js';
import { reportReviewFlowError } from '../review-dm-flow.helpers.js';
import { ReviewDmFlowService } from '../review-dm-flow.service.js';
import { SignupDeclineReasonNotifier } from './signup-decline-reason.notifier.js';

/**
 * After a reaction-review decline lands, offer the reviewer the optional
 * decline-reason DM. A detached side-effect: it never blocks the decline, its
 * persistence, or the embed update. `/edit-signup` re-declines (`kind: 'edit'`)
 * are skipped. Mirrors `RequestApprovalCommentEventHandler`.
 */
@EventsHandler(SignupDeclinedEvent)
export class RequestDeclineReasonEventHandler
  implements IEventHandler<SignupDeclinedEvent>
{
  private readonly logger = new Logger(RequestDeclineReasonEventHandler.name);

  constructor(
    private readonly reviewDmFlowService: ReviewDmFlowService,
    private readonly signupCollection: SignupCollection,
    private readonly notifier: SignupDeclineReasonNotifier,
  ) {}

  async handle({
    signup,
    reviewedBy,
    message,
    kind,
  }: SignupDeclinedEvent): Promise<void> {
    if (kind !== 'decline') {
      return;
    }

    const signupId = `${signup.discordId}-${signup.encounter}`;

    try {
      const reason = await this.reviewDmFlowService.collectDeclineReason(
        signup,
        reviewedBy,
      );

      // Standalone write, separate from the decline status mutation.
      if (reason) {
        try {
          await this.signupCollection.updateDeclineReason(
            { discordId: signup.discordId, encounter: signup.encounter },
            reason,
          );
        } catch (error) {
          reportReviewFlowError(error, { signup, reviewer: reviewedBy });
          this.logger.error(
            error,
            `Failed to record the decline reason for signup ${signupId}`,
          );
        }
      }

      // Always DM the signee — the notifier falls back to the generic denial
      // copy when no reason was given.
      await this.notifier.notify(signup, message, reason);
    } catch (error) {
      reportReviewFlowError(error, { signup, reviewer: reviewedBy });
      this.logger.error(
        error,
        `Failed to handle the decline reason for signup ${signupId}`,
      );
    }
  }
}
