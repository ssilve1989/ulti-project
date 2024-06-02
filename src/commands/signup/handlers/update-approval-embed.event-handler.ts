import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/node';
import { Colors, EmbedBuilder } from 'discord.js';
import { DiscordService } from '../../../discord/discord.service.js';
import { SignupApprovedEvent } from '../signup.events.js';

@EventsHandler(SignupApprovedEvent)
class UpdateApprovalEmbedEventHandler
  implements IEventHandler<SignupApprovedEvent>
{
  constructor(private readonly discordService: DiscordService) {}

  async handle({
    sourceMessage,
    signup,
    approvedBy,
    guildId,
  }: SignupApprovedEvent) {
    const scope = Sentry.getCurrentScope();
    try {
      const displayName = await this.discordService.getDisplayName({
        guildId,
        userId: approvedBy.id,
      });

      const embed = sourceMessage.embeds[0];

      const update = EmbedBuilder.from(embed)
        .setDescription(null)
        .setColor(Colors.Green)
        .setFooter({
          text: `Approved by ${displayName}`,
          // biome-ignore lint/style/useNamingConvention: uncontrolled property name
          iconURL: approvedBy.displayAvatarURL(),
        })
        .setTimestamp(new Date());

      await sourceMessage.edit({ embeds: [update] });
    } catch (error) {
      scope.setExtra('signup', signup);
      scope.captureException(error);
    }
  }
}

export { UpdateApprovalEmbedEventHandler };
