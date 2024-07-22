import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { DiscordService } from '../discord/discord.service.js';
import { SentryTraced } from '../observability/span.decorator.js';
import { RemoveRoleCommand } from './remove-role.command.js';

@CommandHandler(RemoveRoleCommand)
class RemoveRoleCommandHandler implements ICommandHandler<RemoveRoleCommand> {
  private readonly logger = new Logger(RemoveRoleCommandHandler.name);

  constructor(private readonly discordService: DiscordService) {}

  @SentryTraced()
  async execute({ interaction }: RemoveRoleCommand) {
    await interaction.deferReply({ ephemeral: true });

    const { guildId, options } = interaction;
    const role = options.getRole('role', true);

    this.logger.log(`Removing role ${role.id} from all guild members`);

    await this.discordService.removeRole(guildId, role.id);
    await interaction.editReply('Success!');
  }
}

export { RemoveRoleCommandHandler };
