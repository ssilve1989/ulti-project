import { Logger } from '@nestjs/common';
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs';
import { SentryTraced } from '@sentry/nestjs';
import type { SignupDocument } from '@ulti-project/shared';
import {
  EncounterEmoji,
  EncounterFriendlyDescription,
} from '@ulti-project/shared';
import { EmbedBuilder, GuildMember, userMention } from 'discord.js';
import { characterField, worldField } from '#src/common/components/fields.js';
import { createFields } from '#src/common/embed-helpers.js';
import { MissingChannelException } from '#src/discord/discord.exceptions.js';
import { DiscordService } from '#src/discord/discord.service.js';
import { SettingsCollection } from '#src/firebase/collections/settings-collection.js';
import { SignupCollection } from '#src/firebase/collections/signup.collection.js';
import { SignupApprovalSentEvent } from '#src/slash-commands/signup/events/signup.events.js';
import { SIGNUP_REVIEW_REACTIONS } from '#src/slash-commands/signup/signup.consts.js';
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
      // Only reachable if the review channel is cleared between the signup's
      // validation and this command: SettingsCollection caches settings, so a
      // flow test cannot reproduce it by seeding (the flow spec's no-channel
      // case is blocked earlier at validateConfiguration).
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
    const [channel, member] = await Promise.all([
      this.discordService.getTextChannel({
        guildId,
        channelId,
      }),
      this.discordService.getGuildMember({
        guildId,
        memberId: signup.discordId,
      }),
    ]);

    if (!channel) {
      throw new MissingChannelException(channelId, guildId);
    }

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
      character,
      encounter,
      notes,
      proofOfProgLink,
      progPoint,
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
        name: 'Previously Approved Prog Point',
        value: progPoint,
        inline: true,
      },
      {
        name: 'Prog Proof Link',
        value: proofOfProgLink,
        transform: (v: string) => `[View](${v})`,
        inline: true,
      },
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
