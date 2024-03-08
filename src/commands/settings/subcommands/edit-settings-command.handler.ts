import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ChatInputCommandInteraction } from 'discord.js';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import { EditSettingsCommand } from './edit-settings.command.js';

@CommandHandler(EditSettingsCommand)
class EditSettingsCommandHandler
  implements ICommandHandler<EditSettingsCommand>
{
  private readonly logger = new Logger(EditSettingsCommandHandler.name);

  constructor(private readonly settingsCollection: SettingsCollection) {}

  async execute({ interaction }: EditSettingsCommand) {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guildId;

    try {
      const reviewerRole = interaction.options.getRole('reviewer-role');
      const reviewChannel = interaction.options.getChannel(
        'signup-review-channel',
      );
      const signupChannel = interaction.options.getChannel(
        'signup-public-channel',
      );
      const spreadsheetId =
        interaction.options.getString('spreadsheet-id') ?? undefined;

      await this.settingsCollection.upsertSettings(guildId, {
        signupChannel: signupChannel?.id,
        reviewChannel: reviewChannel?.id,
        reviewerRole: reviewerRole?.id,
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
