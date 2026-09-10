import { Injectable, Logger } from '@nestjs/common';
import {
  EncounterFriendlyDescription,
  PartyStatus,
  type SignupDocument,
} from '@ulti-project/shared';
import { EmbedBuilder, type Message } from 'discord.js';
import { DiscordService } from '../../../discord/discord.service.js';
import { reportReviewFlowError } from '../review-dm-flow.helpers.js';

/**
 * DMs the signee the reviewer's optional approval comment. Called directly by
 * `SignupService` once the comment has been collected and the approval
 * persisted — it is a best-effort side-effect and never throws.
 */
@Injectable()
export class SignupApprovalCommentNotifier {
  private readonly logger = new Logger(SignupApprovalCommentNotifier.name);

  constructor(private readonly discordService: DiscordService) {}

  async notify(
    signup: SignupDocument,
    reviewMessage: Message<true>,
    approvalComment: string,
  ): Promise<void> {
    try {
      await this.sendApprovalMessage(signup, reviewMessage, approvalComment);
    } catch (error) {
      reportReviewFlowError(error, { signup });
      this.logger.error(
        error,
        `Failed to send approval comment message for signup ${signup.discordId}-${signup.encounter}`,
      );
    }
  }

  private async sendApprovalMessage(
    signup: SignupDocument,
    reviewMessage: Message<true>,
    approvalComment: string,
  ): Promise<void> {
    const hasCleared = signup.partyStatus === PartyStatus.Cleared;
    const encounter = EncounterFriendlyDescription[signup.encounter];

    const lead = hasCleared
      ? `Congratulations on clearing **${encounter}**! 🎉`
      : `Good news — your signup for **${encounter}** has been approved! 🎉`;
    const content = `${lead}\n\n**Note from the reviewer:**\n> ${approvalComment}`;

    // The review message's embed is a nice-to-have; a cleared or edited review
    // message may have none, and that must not block the DM. Drop its
    // description — it's the reviewer-facing "react to approve/deny" prompt,
    // which makes no sense in the user's DM.
    const source = reviewMessage.embeds.at(0);
    const payload: { content: string; embeds?: EmbedBuilder[] } = { content };
    if (source) {
      payload.embeds = [
        EmbedBuilder.from(source)
          .setTitle(hasCleared ? 'Congratulations!' : 'Signup Approved')
          .setDescription(null),
      ];
    }

    await this.discordService.sendDirectMessage(signup.discordId, payload);

    this.logger.log(
      `Sent approval comment message to user ${signup.discordId} for signup ${signup.discordId}-${signup.encounter}`,
    );
  }
}
