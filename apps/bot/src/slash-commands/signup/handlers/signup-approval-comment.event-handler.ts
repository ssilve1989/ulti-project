import { Logger } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import { EmbedBuilder } from 'discord.js';
import { getFirstEmbed } from '../../../discord/discord.helpers.js';
import { DiscordService } from '../../../discord/discord.service.js';
import { SignupApprovalCommentCollectedEvent } from '../events/signup.events.js';

@EventsHandler(SignupApprovalCommentCollectedEvent)
export class SignupApprovalCommentEventHandler
  implements IEventHandler<SignupApprovalCommentCollectedEvent>
{
  private readonly logger = new Logger(SignupApprovalCommentEventHandler.name);

  constructor(private readonly discordService: DiscordService) {}

  async handle(event: SignupApprovalCommentCollectedEvent) {
    try {
      await this.sendApprovalMessage(event);
    } catch (error) {
      const scope = Sentry.getCurrentScope();
      scope.setExtra('signup', event.signup);
      scope.captureException(error);
      this.logger.error(
        error,
        `Failed to send approval comment message for signup ${event.signup.discordId}-${event.signup.encounter}`,
      );
    }
  }

  private async sendApprovalMessage({
    signup,
    message,
    approvalComment,
  }: SignupApprovalCommentCollectedEvent) {
    const embed = EmbedBuilder.from(getFirstEmbed(message)).setTitle(
      'Signup Approved',
    );

    const content = `Good news — your signup for **${signup.encounter}** has been approved! 🎉\n\n**Note from the reviewer:**\n> ${approvalComment}`;

    await this.discordService.sendDirectMessage(signup.discordId, {
      content,
      embeds: [embed],
    });

    this.logger.log(
      `Sent approval comment message to user ${signup.discordId} for signup ${signup.discordId}-${signup.encounter}`,
    );
  }
}
