import { Injectable, Logger } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import type { ChatInputCommandInteraction } from 'discord.js';
import { Colors, EmbedBuilder, MessageFlags } from 'discord.js';
import { DiscordService } from '#src/discord/discord.service.js';
import { RetireSlashCommand } from '#src/slash-commands/retire/retire.slash-command.js';
import { SlashCommand } from '#src/slash-commands/slash-command.decorator.js';
import type { ISlashCommand } from '#src/slash-commands/slash-command.interface.js';

@Injectable()
@SlashCommand({ builder: RetireSlashCommand })
class RetireCommandHandler implements ISlashCommand {
  private readonly logger = new Logger(RetireCommandHandler.name);

  constructor(private readonly discordService: DiscordService) {}

  @SentryTraced()
  async execute(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
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
  }
}

export { RetireCommandHandler };
