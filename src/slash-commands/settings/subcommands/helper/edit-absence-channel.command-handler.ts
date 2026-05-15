import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import { SentryTraced } from '@sentry/nestjs';
import { MessageFlags } from 'discord.js';
import { ErrorService } from '../../../../error/error.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { EditAbsenceChannelCommand } from './edit-absence-channel.command.js';

@CommandHandler(EditAbsenceChannelCommand)
export class EditAbsenceChannelCommandHandler
  implements ICommandHandler<EditAbsenceChannelCommand>
{
  constructor(
    private readonly settingsCollection: SettingsCollection,
    private readonly errorService: ErrorService,
  ) {}

  @SentryTraced()
  async execute({ interaction }: EditAbsenceChannelCommand) {
    try {
      const scope = Sentry.getCurrentScope();
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const absenceChannel = interaction.options.getChannel(
        'absence-channel',
        true,
      );

      scope.setContext('absence_channel_update', {
        channelId: absenceChannel.id,
      });

      const settings = await this.settingsCollection.getSettings(
        interaction.guildId,
      );

      await this.settingsCollection.upsert(interaction.guildId, {
        ...settings,
        absenceNotificationChannelId: absenceChannel.id,
      });

      await interaction.editReply('Absence notification channel updated!');
    } catch (error) {
      const errorEmbed = this.errorService.handleCommandError(
        error,
        interaction,
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
}
