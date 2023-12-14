import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { SettingsCommand } from '../settings.command.js';
import { SettingsService } from '../../settings.service.js';
import { Logger } from '@nestjs/common';
import { ChatInputCommandInteraction } from 'discord.js';

@CommandHandler(SettingsCommand)
class SettingsCommandHandler implements ICommandHandler<SettingsCommand> {
  private readonly logger = new Logger(SettingsCommandHandler.name);

  constructor(private readonly service: SettingsService) {}

  async execute({ interaction }: SettingsCommand) {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guildId;

    try {
      const reviewerRole = interaction.options.getRole('reviewer-role');
      const reviewChannel = interaction.options.getChannel(
        'signup-review-channel',
      );

      await this.service.upsertSettings(guildId, {
        reviewerRole: reviewerRole?.id,
        reviewChannel: reviewChannel?.id,
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

export { SettingsCommandHandler };
