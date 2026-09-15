import { Logger } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import { EncounterEmoji } from '@ulti-project/shared';
import type { Message } from 'discord.js';
import { ClearReactions } from '../../../common/emojis/emojis.js';
import { DiscordService } from '../../../discord/discord.service.js';
import { SignupCollection } from '../../../firebase/collections/signup.collection.js';
import {
  buildApprovalAnnouncementContent,
  buildApprovalAnnouncementEmbed,
  storeApprovalMessageId,
} from '../approval-announcement.js';
import { SignupApprovedEvent } from '../events/signup.events.js';
import { hasClearedStatus } from '../signup.utils.js';

@EventsHandler(SignupApprovedEvent)
class SendApprovedMessageEventHandler
  implements IEventHandler<SignupApprovedEvent>
{
  private readonly logger = new Logger(SendApprovedMessageEventHandler.name);

  constructor(
    private readonly discordService: DiscordService,
    private readonly repository: SignupCollection,
  ) {}

  async handle(event: SignupApprovedEvent) {
    try {
      await this.sendApprovedMessage(event);
    } catch (error) {
      const scope = Sentry.getCurrentScope();
      scope.setExtra('event', event);
      scope.captureException(error);
    }
  }

  private async sendApprovedMessage({
    settings: { signupChannel },
    message: { guildId },
    signup,
    reviewedBy: approvedBy,
  }: SignupApprovedEvent) {
    if (!signupChannel) {
      return;
    }

    const channel = await this.discordService.getTextChannel({
      guildId,
      channelId: signupChannel,
    });

    if (!channel) {
      const scope = Sentry.getCurrentScope();
      scope.setExtras({ signupChannel, guildId });
      scope.captureMessage('Text Channel not found');
      return;
    }

    const [approvedUsersDisplayName, progger] = await Promise.all([
      this.discordService.getDisplayName({
        userId: approvedBy.id,
        guildId,
      }),
      this.discordService.getGuildMember({
        memberId: signup.discordId,
        guildId,
      }),
    ]);

    const embed = buildApprovalAnnouncementEmbed({
      signup,
      encounterEmoji: this.discordService.getEmojiString(
        EncounterEmoji[signup.encounter],
      ),
      footer: {
        text: `Approved by ${approvedUsersDisplayName}`,
        iconURL: approvedBy.displayAvatarURL(),
      },
      applicantAvatarUrl: progger?.displayAvatarURL(),
    });

    const message = await channel.send({
      content: buildApprovalAnnouncementContent(signup),
      embeds: [embed],
    });

    if (hasClearedStatus(signup)) {
      await this.addReactions(message);
    } else {
      // Write-only here: the reaction flow always posts a fresh announcement.
      // /edit-signup is the only reader. Cleared signups have no document left.
      await storeApprovalMessageId(
        this.repository,
        this.logger,
        signup,
        message.id,
      );
    }
  }

  private async addReactions(message: Message) {
    // fetch clear reactions and attach em to the embed
    try {
      const emojis = this.discordService.getEmojis(ClearReactions);
      // add the emojis to the source embed
      await Promise.allSettled(
        emojis.map((emoji) =>
          message.react(emoji).catch((err) => {
            this.logger.warn(err);
            Sentry.getCurrentScope().captureException(err);
          }),
        ),
      );
    } catch (err) {
      this.logger.error(err);
      Sentry.getCurrentScope().captureException(err);
    }
  }
}

export { SendApprovedMessageEventHandler };
