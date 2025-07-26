import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SentryTraced } from '@sentry/nestjs';
import { Colors, EmbedBuilder, MessageFlags } from 'discord.js';
import { getErrorMessage } from '../../common/error-guards.js';
import { DiscordService } from '../../discord/discord.service.js';
import { RetireCommand } from './retire.command.js';

@CommandHandler(RetireCommand)
class RetireCommandHandler implements ICommandHandler<RetireCommand> {
  private readonly logger = new Logger(RetireCommandHandler.name);

  constructor(private readonly discordService: DiscordService) {}

  @SentryTraced()
  async execute({ interaction }: RetireCommand): Promise<void> {
    // This command can only be used in a guild
    if (!interaction.inGuild()) {
      this.logger.error('Retire command used outside of a guild');
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const currentHelperRole = interaction.options.getRole(
      'current-helper-role',
      true,
    );
    const retiredHelperRole = interaction.options.getRole(
      'retired-helper-role',
      true,
    );

    if (currentHelperRole.id === retiredHelperRole.id) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Role Retirement')
            .setDescription(
              'The current and retired helper roles cannot be the same.',
            )
            .setColor(Colors.Red),
        ],
      });
      return;
    }

    try {
      // Use the new retireRole method to handle the role retirement
      const result = await this.discordService.retireRole(
        interaction.guildId,
        currentHelperRole.id,
        retiredHelperRole.id,
      );

      // Send completion message
      const resultEmbed = new EmbedBuilder()
        .setTitle('Role Retirement Complete')
        .setDescription(
          `Replaced ${currentHelperRole.name} with ${retiredHelperRole.name}`,
        )
        .addFields([
          {
            name: 'Total members processed',
            value: result.totalMembers.toString(),
            inline: true,
          },
          {
            name: 'Successful updates',
            value: result.successCount.toString(),
            inline: true,
          },
          {
            name: 'Failed updates',
            value: result.failCount.toString(),
            inline: true,
          },
        ])
        .setColor(result.failCount > 0 ? Colors.Yellow : Colors.Green)
        .setTimestamp();

      await interaction.editReply({ embeds: [resultEmbed] });
      this.logger.log(
        `Role retirement complete: ${result.successCount} successful, ${result.failCount} failed`,
      );
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      this.logger.error('Error during role retirement', errorMessage);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Role Retirement Failed')
            .setDescription(
              'An error occurred while processing role retirement.',
            )
            .setColor(Colors.Red),
        ],
      });
    }
  }
}

export { RetireCommandHandler };
