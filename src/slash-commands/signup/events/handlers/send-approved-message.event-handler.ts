import { Logger } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import { Colors, EmbedBuilder, Message, User, userMention } from 'discord.js';
import {
  characterField,
  worldField,
} from '../../../../common/components/fields.js';
import { ClearReactions } from '../../../../common/emojis/emojis.js';
import { DiscordService } from '../../../../discord/discord.service.js';
import {
  Encounter,
  EncounterEmoji,
  EncounterFriendlyDescription,
} from '../../../../encounters/encounters.consts.js';
import {
  PartyStatus,
  type SignupDocument,
} from '../../../../firebase/models/signup.model.js';
import { SignupApprovedEvent } from '../signup.events.js';

@EventsHandler(SignupApprovedEvent)
class SendApprovedMessageEventHandler
  implements IEventHandler<SignupApprovedEvent>
{
  private readonly logger = new Logger(SendApprovedMessageEventHandler.name);

  constructor(private readonly discordService: DiscordService) {}

  async handle(event: SignupApprovedEvent) {
    const scope = Sentry.getCurrentScope();
    try {
      await this.sendApprovedMessage(event);
    } catch (error) {
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
    const scope = Sentry.getCurrentScope();

    if (!signupChannel) {
      return;
    }

    const channel = await this.discordService.getTextChannel({
      guildId,
      channelId: signupChannel,
    });

    if (!channel) {
      scope.setExtras({ signupChannel, guildId });
      scope.captureMessage('Text Channel not found');
      return;
    }

    const hasCleared = signup.partyStatus === PartyStatus.Cleared;

    const content = this.getMessageContent(hasCleared, signup.encounter);

    const embed = await this.createEmbed(
      guildId,
      approvedBy,
      hasCleared,
      signup,
    );

    const message = await channel.send({
      content: `${userMention(signup.discordId)} ${content}`,
      embeds: [embed],
    });

    if (hasCleared) {
      await this.addReactions(message);
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
      availability,
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

    embed.addFields([
      { name: 'Availability', value: availability, inline: true },
    ]);

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
    const scope = Sentry.getCurrentScope();
    // fetch clear reactions and attach em to the embed
    try {
      const emojis = await this.discordService.getEmojis(ClearReactions);
      // add the emojis to the source embed
      await Promise.allSettled(
        emojis.map((emoji) =>
          message.react(emoji).catch((err) => {
            this.logger.warn(err);
            scope.captureException(err);
          }),
        ),
      );
    } catch (err) {
      this.logger.error(err);
      scope.captureException(err);
    }
  }
}

export { SendApprovedMessageEventHandler };
