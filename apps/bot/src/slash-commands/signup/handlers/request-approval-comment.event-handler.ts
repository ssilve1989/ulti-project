import { Logger } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { PartyStatus } from '@ulti-project/shared';
import { SignupCollection } from '../../../firebase/collections/signup.collection.js';
import { SignupApprovedEvent } from '../events/signup.events.js';
import { reportReviewFlowError } from '../review-dm-flow.helpers.js';
import { ReviewDmFlowService } from '../review-dm-flow.service.js';
import { SignupApprovalCommentNotifier } from './signup-approval-comment.notifier.js';

/**
 * After a reaction-review approval lands, offer the reviewer the optional
 * comment DM. This is a detached side-effect: it never blocks the approval, its
 * persistence, or the public announcement. `/edit-signup` re-approvals
 * (`kind: 'edit'`) are skipped.
 */
@EventsHandler(SignupApprovedEvent)
export class RequestApprovalCommentEventHandler
  implements IEventHandler<SignupApprovedEvent>
{
  private readonly logger = new Logger(RequestApprovalCommentEventHandler.name);

  constructor(
    private readonly reviewDmFlowService: ReviewDmFlowService,
    private readonly signupCollection: SignupCollection,
    private readonly notifier: SignupApprovalCommentNotifier,
  ) {}

  async handle({
    signup,
    reviewedBy,
    message,
    kind,
  }: SignupApprovedEvent): Promise<void> {
    if (kind !== 'approval') {
      return;
    }

    const signupId = `${signup.discordId}-${signup.encounter}`;

    try {
      const comment = await this.reviewDmFlowService.collectApprovalComment(
        signup,
        reviewedBy,
      );

      if (!comment) {
        return;
      }

      // Standalone write, separate from the approval status mutation. A cleared
      // signup's document was deleted on approval, so there is nowhere to write
      // it — the comment still reaches the user via the DM below.
      if (signup.partyStatus !== PartyStatus.Cleared) {
        try {
          await this.signupCollection.updateApprovalComment(
            { discordId: signup.discordId, encounter: signup.encounter },
            comment,
          );
        } catch (error) {
          reportReviewFlowError(error, { signup, reviewer: reviewedBy });
          this.logger.error(
            error,
            `Failed to record the approval comment for signup ${signupId}`,
          );
        }
      }

      await this.notifier.notify(signup, message, comment);
    } catch (error) {
      reportReviewFlowError(error, { signup, reviewer: reviewedBy });
      this.logger.error(
        error,
        `Failed to handle the approval comment for signup ${signupId}`,
      );
    }
  }
}
