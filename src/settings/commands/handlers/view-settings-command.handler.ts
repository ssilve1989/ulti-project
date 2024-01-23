import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ViewSettingsCommand } from '../view-settings.command.js';
import { SettingsService } from '../../settings.service.js';

@CommandHandler(ViewSettingsCommand)
class ViewSettingsCommandHandler
  implements ICommandHandler<ViewSettingsCommand>
{
  constructor(private readonly settingsService: SettingsService) {}

  async execute({ interaction }: ViewSettingsCommand) {
    await interaction.deferReply({ ephemeral: true });

    const settings = await this.settingsService.getSettings(
      interaction.guildId,
    );

    if (!settings) {
      return interaction.editReply('No settings found!');
    }

    const { reviewChannel, reviewerRole } = settings;
    const role = reviewerRole ? `<@&${reviewerRole}>` : 'No Role Set';

    await interaction.editReply(
      `**Review Channel:** <#${reviewChannel}>\n**Reviewer Role:** ${role}`,
    );
  }
}

export { ViewSettingsCommandHandler };
