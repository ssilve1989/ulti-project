import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SentryTraced } from '@sentry/nestjs';
import { MessageFlags } from 'discord.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { sentryReport } from '../../../../sentry/sentry.consts.js';
import { EditChannelsCommand } from './edit-channels.command.js';

@CommandHandler(EditChannelsCommand)
export class EditChannelsCommandHandler
  implements ICommandHandler<EditChannelsCommand>
{
  private readonly logger = new Logger(EditChannelsCommandHandler.name);

  constructor(private readonly settingsCollection: SettingsCollection) {}

  @SentryTraced()
  async execute({ interaction }: EditChannelsCommand) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const reviewChannel = interaction.options.getChannel(
        'signup-review-channel',
      );
      const signupChannel = interaction.options.getChannel(
        'signup-public-channel',
      );
      const autoModChannelId =
        interaction.options.getChannel('moderation-channel');

      const settings = await this.settingsCollection.getSettings(
        interaction.guildId,
      );

      await this.settingsCollection.upsert(interaction.guildId, {
        ...settings,
        reviewChannel: reviewChannel?.id,
        signupChannel: signupChannel?.id,
        autoModChannelId: autoModChannelId?.id,
      });

      await interaction.editReply('Channel settings updated!');
    } catch (e: unknown) {
      sentryReport(e);
      this.logger.error(e);
      return interaction.editReply('Something went wrong!');
    }
  }
}
