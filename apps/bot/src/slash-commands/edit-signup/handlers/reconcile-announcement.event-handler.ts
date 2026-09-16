import { Logger } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { EncounterEmoji } from '@ulti-project/shared';
import type { EmbedBuilder } from 'discord.js';
import { DiscordService } from '../../../discord/discord.service.js';
import { ErrorService } from '../../../error/error.service.js';
import { SignupCollection } from '../../../firebase/collections/signup.collection.js';
import {
  buildApprovalAnnouncementContent,
  buildApprovalAnnouncementEmbed,
  storeApprovalMessageId,
} from '../../signup/approval-announcement.js';
import { buildEditedFooterText } from '../edit-signup.footers.js';
import { SignupEditedEvent } from '../events/signup-edited.event.js';

@EventsHandler(SignupEditedEvent)
export class ReconcileAnnouncementEventHandler
  implements IEventHandler<SignupEditedEvent>
{
  private readonly logger = new Logger(ReconcileAnnouncementEventHandler.name);

  constructor(
    private readonly discordService: DiscordService,
    private readonly signupCollection: SignupCollection,
    private readonly errorService: ErrorService,
  ) {}

  async handle(event: SignupEditedEvent): Promise<void> {
    try {
      await this.reconcile(event);
    } catch (error) {
      this.errorService.captureError(error);
    }
  }

  private async reconcile(event: SignupEditedEvent): Promise<void> {
    const { signupChannel } = event.settings;

    if (!signupChannel) {
      return;
    }

    if (event.kind === 'reversal') {
      await this.postAnnouncement(event, signupChannel);
      return;
    }

    await this.editAnnouncement(event, signupChannel);
  }

  private async editAnnouncement(
    event: SignupEditedEvent,
    signupChannel: string,
  ): Promise<void> {
    const { before, after, editor, guildId } = event;

    const message = before.approvalMessageId
      ? await this.discordService.fetchMessage(
          guildId,
          signupChannel,
          before.approvalMessageId,
        )
      : undefined;

    if (!message) {
      // approved before approvalMessageId was stored, or the post was deleted
      this.logger.log(
        `No approval announcement to edit for signup ${SignupCollection.getKeyForSignup(after)}`,
      );
      return;
    }

    const embed = await this.buildEmbed(event, {
      text: await buildEditedFooterText(this.discordService, event),
      iconURL: editor.displayAvatarURL(),
    });

    await message.edit({
      content: buildApprovalAnnouncementContent(after),
      embeds: [embed],
    });
  }

  private async postAnnouncement(
    event: SignupEditedEvent,
    signupChannel: string,
  ): Promise<void> {
    const { after, editor, guildId } = event;

    const channel = await this.discordService.getTextChannel({
      guildId,
      channelId: signupChannel,
    });

    if (!channel) {
      this.logger.warn(
        `Signup channel ${signupChannel} not found in guild ${guildId}`,
      );
      return;
    }

    const editorName = await this.discordService.getDisplayName({
      userId: editor.id,
      guildId,
    });
    const embed = await this.buildEmbed(event, {
      text: `Approved by ${editorName}`,
      iconURL: editor.displayAvatarURL(),
    });

    const message = await channel.send({
      content: buildApprovalAnnouncementContent(after),
      embeds: [embed],
    });

    await storeApprovalMessageId(
      this.signupCollection,
      this.logger,
      after,
      message.id,
    );
  }

  private async buildEmbed(
    { after, guildId }: SignupEditedEvent,
    footer: { text: string; iconURL: string },
  ): Promise<EmbedBuilder> {
    const applicant = await this.discordService.getGuildMember({
      memberId: after.discordId,
      guildId,
    });

    return buildApprovalAnnouncementEmbed({
      signup: after,
      encounterEmoji: this.discordService.getEmojiString(
        EncounterEmoji[after.encounter],
      ),
      footer,
      applicantAvatarUrl: applicant?.displayAvatarURL(),
    });
  }
}
