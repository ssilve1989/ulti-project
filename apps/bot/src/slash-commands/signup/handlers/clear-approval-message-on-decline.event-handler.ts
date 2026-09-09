import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import { DiscordService } from '../../../discord/discord.service.js';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../../firebase/collections/signup.collection.js';
import { SignupDeclinedEvent } from '../events/signup.events.js';

/**
 * When a signup that carries `approvalMessageId` is declined, the public
 * "Signup Approved" announcement is now wrong. Delete it (a no-op if it is
 * already gone) and clear the stored id so nothing points at it any more.
 */
@EventsHandler(SignupDeclinedEvent)
class ClearApprovalMessageOnDeclineEventHandler
  implements IEventHandler<SignupDeclinedEvent>
{
  constructor(
    private readonly discordService: DiscordService,
    private readonly settingsCollection: SettingsCollection,
    private readonly signupCollection: SignupCollection,
  ) {}

  async handle(event: SignupDeclinedEvent) {
    try {
      const { signup, message } = event;

      if (!signup.approvalMessageId) {
        return;
      }

      const settings = await this.settingsCollection.getSettings(
        message.guildId,
      );
      const signupChannel = settings?.signupChannel;

      if (signupChannel) {
        const existing = await this.discordService.fetchMessage(
          message.guildId,
          signupChannel,
          signup.approvalMessageId,
        );

        await existing?.delete();
      }

      await this.signupCollection.clearApprovalMessageId(signup);
    } catch (error) {
      const scope = Sentry.getCurrentScope();
      scope.setExtra('signup', event.signup);
      scope.captureException(error);
    }
  }
}

export { ClearApprovalMessageOnDeclineEventHandler };
