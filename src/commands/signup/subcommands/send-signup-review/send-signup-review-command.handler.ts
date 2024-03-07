import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Client, EmbedBuilder } from 'discord.js';
import { EncounterFriendlyDescription } from '../../../../encounters/encounters.consts.js';
import { InjectDiscordClient } from '../../../../discord/discord.decorators.js';
import { SettingsService } from '../../../settings/settings.service.js';
import { SIGNUP_REVIEW_REACTIONS } from '../../signup.consts.js';
import {
  InvalidReviewChannelException,
  MissingChannelException,
} from '../../../../discord/discord.exceptions.js';
import { SignupRepository } from '../../../../firebase/repositories/signup.repository.js';
import { SendSignupReviewCommand } from './send-signup-review.command.js';
import { SignupDocument } from '../../../../firebase/models/signup.model.js';
import { capitalCase } from 'change-case';

@CommandHandler(SendSignupReviewCommand)
class SendSignupReviewCommandHandler
  implements ICommandHandler<SendSignupReviewCommand>
{
  private readonly logger = new Logger(SendSignupReviewCommandHandler.name);

  constructor(
    @InjectDiscordClient() private readonly client: Client,
    private readonly repository: SignupRepository,
    private readonly settingsService: SettingsService,
  ) {}

  async execute({ signup, guildId }: SendSignupReviewCommand) {
    const reviewChannel = await this.settingsService.getReviewChannel(guildId);

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
    const channel = this.client.guilds.cache
      .get(guildId)
      ?.channels.cache.get(channelId);

    if (!channel) {
      throw new MissingChannelException(channelId, guildId);
    }

    if (!channel.isTextBased()) {
      throw new InvalidReviewChannelException(channel.name, guildId);
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
    fflogsLink,
    screenshot,
    world,
    role,
    partyType,
  }: SignupDocument) {
    let embed = new EmbedBuilder()
      .setDescription(
        `Please react to approve ${SIGNUP_REVIEW_REACTIONS.APPROVED} or deny ${SIGNUP_REVIEW_REACTIONS.DECLINED} the following applicants request`,
      )
      .setTitle(`Signup Approval`)
      .addFields([
        {
          name: 'Encounter',
          value: EncounterFriendlyDescription[encounter],
          inline: true,
        },
        { name: 'Party Type', value: partyType, inline: true },
        { name: 'Character', value: capitalCase(character), inline: true },
        { name: 'Home World', value: capitalCase(world), inline: true },
        { name: 'Availability', value: availability, inline: true },
        { name: 'Job', value: role, inline: true },
      ]);

    if (fflogsLink) {
      embed = embed.addFields([
        { name: 'FFLogs Link', value: `[View Report](${fflogsLink})` },
      ]);
    }

    if (screenshot) {
      embed = embed.setImage(screenshot);
    }

    return embed;
  }
}

export { SendSignupReviewCommandHandler };
