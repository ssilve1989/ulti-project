import { Logger } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import { EmbedBuilder } from 'discord.js';
import { DiscordService } from '../../../discord/discord.service.js';
import { SignupDeclineReasonCollectedEvent } from '../events/signup.events.js';
import {
  DEFAULT_DECLINE_FOLLOWUP_MESSAGES,
  SIGNUP_DECLINE_REASONS_CONFIG,
  SIGNUP_MESSAGES,
} from '../signup.consts.js';

@EventsHandler(SignupDeclineReasonCollectedEvent)
export class SignupDeclineReasonEventHandler
  implements IEventHandler<SignupDeclineReasonCollectedEvent>
{
  private readonly logger = new Logger(SignupDeclineReasonEventHandler.name);

  constructor(private readonly discordService: DiscordService) {}

  async handle(event: SignupDeclineReasonCollectedEvent) {
    try {
      await this.sendDeclineMessage(event);
    } catch (error) {
      Sentry.setExtra('signup', event.signup);
      Sentry.captureException(error);
      this.logger.error(
        error,
        `Failed to send decline message for signup ${event.signup.discordId}-${event.signup.encounter}`,
      );
    }
  }

  private async sendDeclineMessage({
    signup,
    message,
    declineReason,
  }: SignupDeclineReasonCollectedEvent) {
    const embed = EmbedBuilder.from(message.embeds[0]).setTitle(
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
