import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import { Colors, EmbedBuilder, userMention } from 'discord.js';
import { match, P } from 'ts-pattern';
import { getFirstEmbed } from '../../../discord/discord.helpers.js';
import { DiscordService } from '../../../discord/discord.service.js';
import {
  SignupApprovedEvent,
  SignupDeclinedEvent,
} from '../events/signup.events.js';

@EventsHandler(SignupApprovedEvent, SignupDeclinedEvent)
class SignupEmbedEventHandler
  implements IEventHandler<SignupApprovedEvent | SignupDeclinedEvent>
{
  constructor(private readonly discordService: DiscordService) {}

  async handle(event: SignupApprovedEvent | SignupDeclinedEvent) {
    try {
      await match(event)
        .with(P.instanceOf(SignupApprovedEvent), this.handleApproved.bind(this))
        .with(P.instanceOf(SignupDeclinedEvent), this.handleDeclined.bind(this))
        .run();
    } catch (error) {
      const scope = Sentry.getCurrentScope();
      scope.setExtra('signup', event.signup);
      scope.captureException(error);
    }
  }

  private async handleApproved({ message, reviewedBy }: SignupApprovedEvent) {
    const embed = getFirstEmbed(message);
    const displayName = await this.discordService.getDisplayName({
      guildId: message.guildId,
      userId: reviewedBy.id,
    });

    const update = EmbedBuilder.from(embed)
      .setDescription(null)
      .setColor(Colors.Green)
      .setFooter({
        text: `Approved by ${displayName}`,
        iconURL: reviewedBy.displayAvatarURL(),
      })
      .setTimestamp(new Date());

    await message.edit({ embeds: [update] });
  }

  private async handleDeclined({
    message,
    reviewedBy,
    signup,
  }: SignupDeclinedEvent) {
    const displayName = await this.discordService.getDisplayName({
      guildId: message.guildId,
      userId: reviewedBy.id,
    });

    const content = `Declined ${userMention(signup.discordId)}`;

    const embed = EmbedBuilder.from(getFirstEmbed(message))
      .setDescription(null)
      .setFooter({
        text: `Declined by ${displayName}`,
        iconURL: reviewedBy.displayAvatarURL(),
      })
      .setColor(Colors.Red)
      .setTimestamp(new Date());

    await message.edit({ content, embeds: [embed] });
  }
}

export { SignupEmbedEventHandler as UpdateApprovalEmbedEventHandler };
