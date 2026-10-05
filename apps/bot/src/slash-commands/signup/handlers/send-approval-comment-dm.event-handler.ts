import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { EncounterFriendlyDescription } from '@ulti-project/shared';
import { DiscordService } from '../../../discord/discord.service.js';
import { SignupApprovedEvent } from '../events/signup.events.js';

@EventsHandler(SignupApprovedEvent)
class SendApprovalCommentDmEventHandler
  implements IEventHandler<SignupApprovedEvent>
{
  constructor(private readonly discordService: DiscordService) {}

  async handle(event: SignupApprovedEvent): Promise<void> {
    if (!event.comment) {
      return;
    }

    const quotedComment = event.comment
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');

    await this.discordService.sendDirectMessage(event.signup.discordId, {
      content: `Your signup for **${
        EncounterFriendlyDescription[event.signup.encounter]
      }** was approved. The reviewer left you a comment:\n\n${quotedComment}`,
    });
  }
}

export { SendApprovalCommentDmEventHandler };
