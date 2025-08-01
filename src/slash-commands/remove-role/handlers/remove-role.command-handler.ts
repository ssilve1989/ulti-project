import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SentryTraced } from '@sentry/nestjs';
import { MessageFlags } from 'discord.js';
import { DiscordService } from '../../../discord/discord.service.js';
import { RemoveRoleCommand } from '../commands/remove-role.command.js';

@CommandHandler(RemoveRoleCommand)
class RemoveRoleCommandHandler implements ICommandHandler<RemoveRoleCommand> {
  private readonly logger = new Logger(RemoveRoleCommandHandler.name);

  constructor(private readonly discordService: DiscordService) {}

  @SentryTraced()
  async execute({ interaction }: RemoveRoleCommand) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const { guildId, options } = interaction;
    const role = options.getRole('role', true);

    this.logger.log(`Removing role ${role.id} from all guild members`);

    await this.discordService.removeRole(guildId, role.id);
    await interaction.editReply('Success!');
  }
}

export { RemoveRoleCommandHandler };
