import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { Colors, EmbedBuilder, userMention } from 'discord.js';
import { getFirstEmbed } from '../../../discord/discord.helpers.js';
import { DiscordService } from '../../../discord/discord.service.js';
import { ErrorService } from '../../../error/error.service.js';
import { buildEditedFooterText } from '../edit-signup.footers.js';
import { SignupEditedEvent } from '../events/signup-edited.event.js';

@EventsHandler(SignupEditedEvent)
export class UpdateReviewMessageEventHandler
  implements IEventHandler<SignupEditedEvent>
{
  constructor(
    private readonly discordService: DiscordService,
    private readonly errorService: ErrorService,
  ) {}

  async handle(event: SignupEditedEvent): Promise<void> {
    try {
      await this.updateReviewMessage(event);
    } catch (error) {
      this.errorService.captureError(error);
    }
  }

  private async updateReviewMessage(event: SignupEditedEvent): Promise<void> {
    const { kind, after, editor, settings, guildId } = event;

    if (!settings.reviewChannel || !after.reviewMessageId) {
      return;
    }

    const message = await this.discordService.fetchMessage(
      guildId,
      settings.reviewChannel,
      after.reviewMessageId,
    );

    if (!message) {
      return;
    }

    const embed = EmbedBuilder.from(getFirstEmbed(message))
      .setColor(Colors.Green)
      .setFooter({
        text: await buildEditedFooterText(this.discordService, event),
        iconURL: editor.displayAvatarURL(),
      })
      .setTimestamp(new Date());

    // reactions are left alone: they record the original click
    await message.edit(
      kind === 'reversal'
        ? {
            content: `Signup Review for ${userMention(after.discordId)}`,
            embeds: [embed],
          }
        : { embeds: [embed] },
    );
  }
}
