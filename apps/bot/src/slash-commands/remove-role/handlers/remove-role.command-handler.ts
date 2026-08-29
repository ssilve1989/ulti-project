import { Injectable, Logger } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import type { ChatInputCommandInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { DiscordService } from '../../../discord/discord.service.js';
import { SlashCommand } from '../../slash-command.decorator.js';
import type { ISlashCommand } from '../../slash-command.interface.js';
import { RemoveRoleSlashCommand } from '../remove-role.slash-command.js';

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

    await this.discordService.removeRole(guildId, role.id);
    await interaction.editReply('Success!');
  }
}

export { RemoveRoleCommandHandler };
