import { Logger } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import {
  Encounter,
  EncounterEmoji,
  EncounterFriendlyDescription,
  PartyStatus,
  type SignupDocument,
} from '@ulti-project/shared';
import { Colors, EmbedBuilder, Message, User, userMention } from 'discord.js';
import {
  characterField,
  emptyField,
  worldField,
} from '../../../common/components/fields.js';
import { ClearReactions } from '../../../common/emojis/emojis.js';
import { DiscordService } from '../../../discord/discord.service.js';
import { SignupCollection } from '../../../firebase/collections/signup.collection.js';
import { SignupApprovedEvent } from '../events/signup.events.js';

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
    kind,
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

    const hasCleared = signup.partyStatus === PartyStatus.Cleared;

    const content = `${userMention(signup.discordId)} ${this.getMessageContent(
      hasCleared,
      signup.encounter,
    )}`;

    const embed = await this.createEmbed(
      guildId,
      approvedBy,
      hasCleared,
      signup,
    );

    const payload = { content, embeds: [embed] };

    // Only `/edit-signup` reconciles against an existing announcement: a
    // correction edits the public post in place so it is not duplicated.
    // `approvalMessageId` is only ever stored on the non-cleared path, so this
    // branch never has to touch reactions. The standard approval flow always
    // falls through to post a fresh announcement, even if a stale id is present
    // (e.g. a re-submitted signup that was approved before).
    if (kind === 'edit' && signup.approvalMessageId) {
      const existing = await this.discordService.fetchMessage(
        guildId,
        signupChannel,
        signup.approvalMessageId,
      );

      if (existing) {
        await existing.edit(payload);
        return;
      }
    }

    const message = await channel.send(payload);

    if (hasCleared) {
      await this.addReactions(message);
    } else {
      await this.repository.setApprovalMessageId(signup, message.id);
    }
  }

  private async createEmbed(
    guildId: string,
    approvedBy: User,
    hasCleared: boolean,
    {
      encounter,
      character,
      world,
      role,
      progPoint,
      progPointRequested,
      discordId,
      proofOfProgLink,
      screenshot,
    }: SignupDocument,
  ): Promise<EmbedBuilder> {
    const progPointFieldValue = progPoint ?? progPointRequested;
    const emoji = this.discordService.getEmojiString(EncounterEmoji[encounter]);

    const [approvedUsersDisplayName, progger] = await Promise.all([
      this.discordService.getDisplayName({
        userId: approvedBy.id,
        guildId,
      }),
      this.discordService.getGuildMember({ memberId: discordId, guildId }),
    ]);

    const title = hasCleared
      ? 'Congratulations!'
      : `Signup Approved - ${EncounterFriendlyDescription[encounter]} ${emoji}`.trim();

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setFields([
        characterField(character),
        worldField(world),
        { name: 'Job', value: role, inline: true },
        { name: 'Prog Point', value: progPointFieldValue, inline: true },
        emptyField(),
      ])
      .setFooter({
        text: `Approved by ${approvedUsersDisplayName}`,
        iconURL: approvedBy.displayAvatarURL(),
      })
      .setColor(Colors.Green)
      .setTimestamp(new Date());

    if (proofOfProgLink) {
      embed.addFields([
        {
          name: 'Prog Proof Link',
          value: `[View](${proofOfProgLink})`,
          inline: true,
        },
      ]);
    }

    if (screenshot) {
      embed.setImage(screenshot);
    }

    const avatarUrl = progger?.displayAvatarURL();
    return avatarUrl ? embed.setThumbnail(avatarUrl) : embed;
  }

  private getMessageContent(hasCleared: boolean, encounter: Encounter) {
    return hasCleared
      ? `Congratulations on clearing **${EncounterFriendlyDescription[encounter]}**!`
      : 'Signup Approved!';
  }

  private async addReactions(message: Message) {
    // fetch clear reactions and attach em to the embed
    try {
      const emojis = await this.discordService.getEmojis(ClearReactions);
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
