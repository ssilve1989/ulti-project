import { Injectable, Logger } from '@nestjs/common';
import type { SignupDocument } from '@ulti-project/shared';
import { EmbedBuilder, type Message } from 'discord.js';
import { getFirstEmbed } from '../../../discord/discord.helpers.js';
import { DiscordService } from '../../../discord/discord.service.js';
import { reportReviewFlowError } from '../review-dm-flow.helpers.js';
import {
  DEFAULT_DECLINE_FOLLOWUP_MESSAGES,
  SIGNUP_DECLINE_REASONS_CONFIG,
  SIGNUP_MESSAGES,
} from '../signup.consts.js';

/**
 * DMs the signee that their signup was declined, with the reviewer's reason
 * when one was given (falling back to the generic denial copy otherwise).
 * Called directly by `SignupService` after the decline has been persisted — a
 * best-effort side-effect that never throws.
 */
@Injectable()
export class SignupDeclineReasonNotifier {
  private readonly logger = new Logger(SignupDeclineReasonNotifier.name);

  constructor(private readonly discordService: DiscordService) {}

  async notify(
    signup: SignupDocument,
    reviewMessage: Message<true>,
    declineReason?: string,
  ): Promise<void> {
    try {
      await this.sendDeclineMessage(signup, reviewMessage, declineReason);
    } catch (error) {
      reportReviewFlowError(error, { signup });
      this.logger.error(
        error,
        `Failed to send decline message for signup ${signup.discordId}-${signup.encounter}`,
      );
    }
  }

  private async sendDeclineMessage(
    signup: SignupDocument,
    reviewMessage: Message<true>,
    declineReason?: string,
  ): Promise<void> {
    const embed = EmbedBuilder.from(getFirstEmbed(reviewMessage)).setTitle(
      'Signup Declined',
    );

    // Create user-friendly message with emphasized decline reason
    let content: string;
    if (declineReason) {
      const baseMessage = `We're sorry, but your signup for **${signup.encounter}** could not be approved.\n\n**Reason:**\n> ${declineReason}\n\n`;

      // Find the configuration for this decline reason
      const reasonConfig = SIGNUP_DECLINE_REASONS_CONFIG.find(
        (config) => config.reason === declineReason,
      );

      // Use predefined followup message if available, otherwise use defaults
      let followupMessage: string;
      if (reasonConfig?.followupMessage) {
        followupMessage = reasonConfig.followupMessage;
      } else {
        // Fallback to default messages based on permanent status
        const isPermanentDecline = reasonConfig
          ? reasonConfig.permanent
          : false;
        followupMessage = isPermanentDecline
          ? DEFAULT_DECLINE_FOLLOWUP_MESSAGES.permanent
          : DEFAULT_DECLINE_FOLLOWUP_MESSAGES.nonPermanent;
      }

      content = `${baseMessage}${followupMessage}`;
    } else {
      content = SIGNUP_MESSAGES.SIGNUP_SUBMISSION_DENIED;
    }

    await this.discordService.sendDirectMessage(signup.discordId, {
      content,
      embeds: [embed],
    });

    this.logger.log(
      `Sent decline message to user ${signup.discordId} for signup ${signup.discordId}-${signup.encounter}${
        declineReason
          ? ` with reason: ${declineReason}`
          : ' (no specific reason)'
      }`,
    );
  }
}
