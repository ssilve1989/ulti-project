import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import { SentryTraced } from '@sentry/nestjs';
import { MessageFlags } from 'discord.js';
import { ErrorService } from '../../../../error/error.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { EditChannelsCommand } from './edit-channels.command.js';

@CommandHandler(EditChannelsCommand)
export class EditChannelsCommandHandler
  implements ICommandHandler<EditChannelsCommand>
{
  constructor(
    private readonly settingsCollection: SettingsCollection,
    private readonly errorService: ErrorService,
  ) {}

  @SentryTraced()
  async execute({ interaction }: EditChannelsCommand) {
    const scope = Sentry.getCurrentScope();

    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const reviewChannel = interaction.options.getChannel(
        'signup-review-channel',
      );
      const signupChannel = interaction.options.getChannel(
        'signup-public-channel',
      );
      const autoModChannelId =
        interaction.options.getChannel('moderation-channel');

      // Add command-specific context
      scope.setContext('channel_update', {
        hasReviewChannel: !!reviewChannel,
        hasSignupChannel: !!signupChannel,
        hasAutoModChannel: !!autoModChannelId,
      });

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
    } catch (error) {
      const errorEmbed = this.errorService.handleCommandError(
        error,
        interaction,
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
}
