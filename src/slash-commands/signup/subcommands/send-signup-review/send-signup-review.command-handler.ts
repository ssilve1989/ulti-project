import { Logger } from '@nestjs/common';
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs';
import { EmbedBuilder, GuildMember, userMention } from 'discord.js';
import {
  characterField,
  worldField,
} from '../../../../common/components/fields.js';
import { createFields } from '../../../../common/embed-helpers.js';
import { MissingChannelException } from '../../../../discord/discord.exceptions.js';
import { DiscordService } from '../../../../discord/discord.service.js';
import {
  EncounterEmoji,
  EncounterFriendlyDescription,
} from '../../../../encounters/encounters.consts.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../../../firebase/collections/signup.collection.js';
import type { SignupDocument } from '../../../../firebase/models/signup.model.js';
import { SentryTraced } from '../../../../sentry/sentry-traced.decorator.js';
import { SignupApprovalSentEvent } from '../../events/signup.events.js';
import { SIGNUP_REVIEW_REACTIONS } from '../../signup.consts.js';
import { SendSignupReviewCommand } from './send-signup-review.command.js';

@CommandHandler(SendSignupReviewCommand)
class SendSignupReviewCommandHandler
  implements ICommandHandler<SendSignupReviewCommand>
{
  private readonly logger = new Logger(SendSignupReviewCommandHandler.name);

  constructor(
    private readonly discordService: DiscordService,
    private readonly repository: SignupCollection,
    private readonly settingsCollection: SettingsCollection,
    private readonly eventBus: EventBus,
  ) {}

  @SentryTraced()
  async execute({ signup, guildId }: SendSignupReviewCommand) {
    const reviewChannel =
      await this.settingsCollection.getReviewChannel(guildId);

    if (!reviewChannel) {
      this.logger.warn(`no review channel set for guild ${guildId}`);
      return;
    }

    const reviewMessageId = await this.sendSignupForApproval(
      signup,
      reviewChannel,
      guildId,
    );

    this.eventBus.publish(
      new SignupApprovalSentEvent({ ...signup, reviewMessageId }, guildId),
    );
  }

  /**
   * Sends a message to the signups channel with the signup information
   * and listens for reactions on the message so we can update the approval status
   * @param signup
   */
  async sendSignupForApproval(
    signup: SignupDocument,
    channelId: string,
    guildId: string,
  ) {
    const channel = await this.discordService.getTextChannel({
      guildId,
      channelId,
    });

    if (!channel) {
      throw new MissingChannelException(channelId, guildId);
    }

    const member = await this.discordService.getGuildMember({
      guildId,
      memberId: signup.discordId,
    });

    const embed = this.createSignupApprovalEmbed(signup, member);

    const message = await channel.send({
      content: `Signup Review for ${userMention(signup.discordId)}`,
      embeds: [embed],
    });

    await Promise.all([
      message.react(SIGNUP_REVIEW_REACTIONS.APPROVED),
      message.react(SIGNUP_REVIEW_REACTIONS.DECLINED),
    ]);

    // update firebase with the message that correlates to this signup
    await this.repository.setReviewMessageId(signup, message.id);
    return message.id;
  }

  private createSignupApprovalEmbed(
    {
      availability,
      character,
      encounter,
      notes,
      proofOfProgLink,
      screenshot,
      world,
      role,
      progPointRequested,
    }: SignupDocument,
    member?: GuildMember,
  ) {
    const emoji = this.discordService.getEmojiString(EncounterEmoji[encounter]);
    const avatarUrl = member?.displayAvatarURL();

    const fields = createFields([
      characterField(character),
      worldField(world, 'Home World'),
      { name: 'Job', value: role, inline: true },
      { name: 'Prog Point', value: progPointRequested, inline: true },
      {
        name: 'Prog Proof Link',
        value: proofOfProgLink,
        transform: (v) => `[View](${v})`,
        inline: true,
      },
      { name: 'Availability', value: availability, inline: true },
      { name: 'Notes', value: notes, inline: false },
    ]);

    const embed = new EmbedBuilder()
      .setDescription(
        `Please react to approve ${SIGNUP_REVIEW_REACTIONS.APPROVED} or deny ${SIGNUP_REVIEW_REACTIONS.DECLINED} the following applicants request`,
      )
      .setTitle(
        `Signup Approval - ${EncounterFriendlyDescription[encounter]} ${emoji}`.trim(),
      )
      .addFields(fields);

    if (avatarUrl) {
      embed.setThumbnail(avatarUrl);
    }

    if (screenshot) {
      embed.setImage(screenshot);
    }

    return embed;
  }
}

export { SendSignupReviewCommandHandler };
