import { Injectable, Logger } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import type { ChatInputCommandInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { DiscordService } from '#src/discord/discord.service.js';
import { RemoveRoleSlashCommand } from '#src/slash-commands/remove-role/remove-role.slash-command.js';
import { SlashCommand } from '#src/slash-commands/slash-command.decorator.js';
import type { ISlashCommand } from '#src/slash-commands/slash-command.interface.js';

@Injectable()
@SlashCommand({ builder: RemoveRoleSlashCommand })
class RemoveRoleCommandHandler implements ISlashCommand {
  private readonly logger = new Logger(RemoveRoleCommandHandler.name);

  constructor(private readonly discordService: DiscordService) {}

  @SentryTraced()
  async execute(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const { guildId, options } = interaction;
    const role = options.getRole('role', true);

    this.logger.log(`Removing role ${role.id} from all guild members`);

    const result = await this.discordService.removeRole(guildId, role.id);
    if (!result.roleFound) {
      await interaction.editReply(
        'Role was not found; no removals were attempted.',
      );
      return;
    }

    const message =
      result.failCount > 0
        ? `Role removal completed with failures.\nSuccessful removals: ${result.successCount}/${result.totalMembers}\nFailed removals: ${result.failCount}`
        : `Success! Removed role from ${result.successCount}/${result.totalMembers} members.`;
    await interaction.editReply(message);
  }
}

export { RemoveRoleCommandHandler };
