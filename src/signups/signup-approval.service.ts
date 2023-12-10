import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import {
  Client,
  EmbedBuilder,
  Events,
  MessageReaction,
  PartialMessageReaction,
  PartialUser,
  TextChannel,
  User,
} from 'discord.js';
import { EncounterFriendlyDescription } from '../app.consts.js';
import { InjectDiscordClient } from '../client/client.decorators.js';
import { Signup } from './signup.interfaces.js';
import { match } from 'ts-pattern';

class SignupApprovalService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SignupApprovalService.name);
  // TODO: dynamically assign the appropriate channel id
  private static readonly APPROVAL_CHANNEL = '1162558500891787304';
  private static REACTIONS = {
    Approved: '✅',
    Declined: '❌',
  };

  constructor(@InjectDiscordClient() private readonly client: Client) {}

  onApplicationBootstrap() {
    this.client.on(Events.MessageReactionAdd, (reaction, user) => {
      if (reaction.message.channelId !== SignupApprovalService.APPROVAL_CHANNEL)
        return;
      this.handleReaction(reaction, user);
    });
  }

  /**
   * Sends a message to the signups channel with the signup information
   * and listens for reactions on the message so we can update the approval status
   * @param signup
   */
  async sendSignupForApproval(signup: Signup) {
    const channel = this.client.channels.cache.get(
      SignupApprovalService.APPROVAL_CHANNEL,
    ) as TextChannel;

    const embed = this.createSignupApprovalEmbed(signup);

    return channel.send({
      embeds: [embed],
    });
  }

  private async handleReaction(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
  ) {
    if (reaction.partial) {
      // if this message has been removed the fetch might result in a failure which means we shouldn't do anythin
      try {
        await reaction.fetch();
      } catch (e) {
        this.logger.error(e);
      }
    }

    const channel = this.client.channels.cache.get(
      SignupApprovalService.APPROVAL_CHANNEL,
    ) as TextChannel;

    // however if it succeeds the message is now cached and fully available
    match(reaction.emoji.name)
      .with(SignupApprovalService.REACTIONS.Approved, async () => {
        this.logger.log('approved signup');
        await channel.send({ target: user as User, content: 'test' });
      })
      .with(SignupApprovalService.REACTIONS.Declined, () => {
        this.logger.log('declined signup');
      })
      .otherwise(() => {
        // message user maybe?
      });
  }

  private createSignupApprovalEmbed({
    availability,
    character,
    encounter,
    fflogsLink,
    world,
    approved,
  }: Signup) {
    return new EmbedBuilder()
      .setDescription(
        `Please react to approve ${SignupApprovalService.REACTIONS.Approved} or deny ${SignupApprovalService.REACTIONS.Declined} the following applicants request`,
      )
      .setTitle(`Signup Approval`)
      .addFields([
        { name: 'Approved', value: approved ? 'Yes' : 'No' },
        {
          name: 'Encounter',
          value: EncounterFriendlyDescription[encounter],
        },
        { name: 'Character', value: character },
        { name: 'Home World', value: world },
        { name: 'FF Logs Link', value: `[Click Here](${fflogsLink})` },
        { name: 'Availability', value: availability },
      ]);
  }
}

export { SignupApprovalService };
