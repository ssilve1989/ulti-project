import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import { EncounterFriendlyDescription } from '../../app.consts.js';
import { InjectDiscordClient } from '../../discord/discord.decorators.js';
import { SendSignupReviewCommand } from '../signup.commands.js';
import {
  SIGNUP_APPROVAL_CHANNEL,
  SIGNUP_REVIEW_REACTIONS,
} from '../signup.consts.js';
import { Signup } from '../signup.interfaces.js';
import { SignupRepository } from '../signup.repository.js';

@CommandHandler(SendSignupReviewCommand)
class SendSignupReviewCommandHandler
  implements ICommandHandler<SendSignupReviewCommand>
{
  constructor(
    private readonly repository: SignupRepository,
    @InjectDiscordClient() private readonly client: Client,
  ) {}

  async execute({ signup }: SendSignupReviewCommand) {
    await this.sendSignupForApproval(signup);
  }

  /**
   * Sends a message to the signups channel with the signup information
   * and listens for reactions on the message so we can update the approval status
   * @param signup
   */
  async sendSignupForApproval(signup: Signup) {
    const channel = this.client.channels.cache.get(
      SIGNUP_APPROVAL_CHANNEL,
    ) as TextChannel;

    const embed = this.createSignupApprovalEmbed(signup);

    const message = await channel.send({
      embeds: [embed],
    });

    // update firebase with the message that correlates to this signup
    await this.repository.setReviewMessageId(signup, message.id);
  }

  private createSignupApprovalEmbed({
    availability,
    character,
    encounter,
    fflogsLink,
    world,
  }: Signup) {
    return new EmbedBuilder()
      .setDescription(
        `Please react to approve ${SIGNUP_REVIEW_REACTIONS.Approved} or deny ${SIGNUP_REVIEW_REACTIONS.Declined} the following applicants request`,
      )
      .setTitle(`Signup Approval`)
      .addFields([
        {
          name: 'Encounter',
          value: EncounterFriendlyDescription[encounter],
        },
        { name: 'Character', value: character, inline: true },
        { name: 'Home World', value: world, inline: true },
        {
          name: 'FF Logs Link',
          value: `[Click Here](${fflogsLink})`,
          inline: true,
        },
        { name: 'Availability', value: availability, inline: true },
      ]);
  }
}

export { SendSignupReviewCommandHandler };
