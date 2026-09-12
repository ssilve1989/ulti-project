import { Logger } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import { EncounterFriendlyDescription } from '@ulti-project/shared';
import { DiscordService } from '../../../discord/discord.service.js';
import { SignupApprovedEvent } from '../events/signup.events.js';

@EventsHandler(SignupApprovedEvent)
class SendApprovalCommentDmEventHandler
  implements IEventHandler<SignupApprovedEvent>
{
  private readonly logger = new Logger(SendApprovalCommentDmEventHandler.name);

  constructor(private readonly discordService: DiscordService) {}

  async handle(event: SignupApprovedEvent): Promise<void> {
    if (!event.comment) {
      return;
    }

    try {
      const quotedComment = event.comment
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');

      await this.discordService.sendDirectMessage(event.signup.discordId, {
        content: `Your signup for **${
          EncounterFriendlyDescription[event.signup.encounter]
        }** was approved. The reviewer left you a comment:\n\n${quotedComment}`,
      });
    } catch (error) {
      this.logger.error(
        error,
        `Failed to DM approval comment for signup ${event.signup.discordId}-${event.signup.encounter}`,
      );
      const scope = Sentry.getCurrentScope();
      scope.setExtra('event', event);
      scope.captureException(error);
    }
  }
}

export { SendApprovalCommentDmEventHandler };
