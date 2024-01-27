import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EditSettingsCommand } from '../edit-settings.command.js';
import { SettingsService } from '../../settings.service.js';
import { Logger } from '@nestjs/common';
import { ChatInputCommandInteraction } from 'discord.js';

@CommandHandler(EditSettingsCommand)
class EditSettingsCommandHandler
  implements ICommandHandler<EditSettingsCommand>
{
  private readonly logger = new Logger(EditSettingsCommandHandler.name);

  constructor(private readonly service: SettingsService) {}

  async execute({ interaction }: EditSettingsCommand) {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guildId;

    try {
      const reviewerRole = interaction.options.getRole('reviewer-role');
      const reviewChannel = interaction.options.getChannel(
        'signup-review-channel',
      );
      const spreadsheetId =
        interaction.options.getString('spreadsheet-id') ?? undefined;

      await this.service.upsertSettings(guildId, {
        reviewerRole: reviewerRole?.id,
        reviewChannel: reviewChannel?.id,
        spreadsheetId,
      });

      await interaction.editReply('Settings updated!');
    } catch (e: unknown) {
      await this.handleError(e, interaction);
    }
  }

  private handleError(e: unknown, interaction: ChatInputCommandInteraction) {
    this.logger.error(e);
    return interaction.editReply('Something went wrong!');
  }
}

export { EditSettingsCommandHandler };
