import { Logger } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import {
  EncounterFriendlyDescription,
  PartyStatus,
} from '@ulti-project/shared';
import { EmbedBuilder } from 'discord.js';
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
    const hasCleared = signup.partyStatus === PartyStatus.Cleared;
    const encounter = EncounterFriendlyDescription[signup.encounter];

    const lead = hasCleared
      ? `Congratulations on clearing **${encounter}**! 🎉`
      : `Good news — your signup for **${encounter}** has been approved! 🎉`;
    const content = `${lead}\n\n**Note from the reviewer:**\n> ${approvalComment}`;

    // The review message's embed is a nice-to-have; a cleared or edited review
    // message may have none, and that must not block the DM.
    const source = message.embeds.at(0);
    const payload: { content: string; embeds?: EmbedBuilder[] } = { content };
    if (source) {
      payload.embeds = [
        EmbedBuilder.from(source).setTitle(
          hasCleared ? 'Congratulations!' : 'Signup Approved',
        ),
      ];
    }

    await this.discordService.sendDirectMessage(signup.discordId, payload);

    this.logger.log(
      `Sent approval comment message to user ${signup.discordId} for signup ${signup.discordId}-${signup.encounter}`,
    );
  }
}
