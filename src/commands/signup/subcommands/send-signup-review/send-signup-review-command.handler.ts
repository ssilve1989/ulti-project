import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { capitalCase } from 'change-case';
import { EmbedBuilder } from 'discord.js';
import { MissingChannelException } from '../../../../discord/discord.exceptions.js';
import { DiscordService } from '../../../../discord/discord.service.js';
import { EncounterFriendlyDescription } from '../../../../encounters/encounters.consts.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../../../firebase/collections/signup.collection.js';
import { SignupDocument } from '../../../../firebase/models/signup.model.js';
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
  ) {}

  async execute({ signup, guildId }: SendSignupReviewCommand) {
    const reviewChannel =
      await this.settingsCollection.getReviewChannel(guildId);

    if (!reviewChannel) {
      this.logger.warn(`no review channel set for guild ${guildId}`);
      return;
    }

    await this.sendSignupForApproval(signup, reviewChannel, guildId);
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

    const embed = this.createSignupApprovalEmbed(signup);

    const message = await channel.send({
      embeds: [embed],
    });

    await Promise.all([
      message.react(SIGNUP_REVIEW_REACTIONS.APPROVED),
      message.react(SIGNUP_REVIEW_REACTIONS.DECLINED),
    ]);

    // update firebase with the message that correlates to this signup
    await this.repository.setReviewMessageId(signup, message.id);
  }

  private createSignupApprovalEmbed({
    availability,
    character,
    encounter,
    proofOfProgLink,
    screenshot,
    world,
    role,
    progPointRequested,
  }: SignupDocument) {
    let embed = new EmbedBuilder()
      .setDescription(
        `Please react to approve ${SIGNUP_REVIEW_REACTIONS.APPROVED} or deny ${SIGNUP_REVIEW_REACTIONS.DECLINED} the following applicants request`,
      )
      .setTitle('Signup Approval')
      .addFields([
        {
          name: 'Encounter',
          value: EncounterFriendlyDescription[encounter],
          inline: true,
        },
        {
          name: 'Character',
          value: capitalCase(character),
          inline: true,
        },
        { name: '\u200B', value: '\u200B', inline: true },
        { name: 'Home World', value: capitalCase(world), inline: true },
        { name: 'Availability', value: availability, inline: true },
        { name: 'Job', value: role, inline: true },
        { name: 'Prog Point', value: progPointRequested, inline: true },
      ]);

    if (proofOfProgLink) {
      embed = embed.addFields([
        {
          name: 'Prog Proof Link',
          value: `[View](${proofOfProgLink})`,
          inline: true,
        },
      ]);
    }

    if (screenshot) {
      embed = embed.setImage(screenshot);
    }

    return embed;
  }
}

export { SendSignupReviewCommandHandler };
