import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/node';
import { DiscordService } from '../../../discord/discord.service.js';
import { SentryTraced } from '../../../observability/span.decorator.js';
import { RemoveRolesCommand } from '../signup.commands.js';

@CommandHandler(RemoveRolesCommand)
export class RemoveRolesCommandHandler
  implements ICommandHandler<RemoveRolesCommand>
{
  private readonly logger = new Logger(RemoveRolesCommandHandler.name);

  constructor(public readonly discordService: DiscordService) {}

  @SentryTraced()
  async execute({ encounter, userId, guildId, settings }: RemoveRolesCommand) {
    const scope = Sentry.getCurrentScope();

    try {
      const member = await this.discordService.getGuildMember({
        guildId,
        memberId: userId,
      });

      const roles = [
        settings.clearRoles?.[encounter],
        settings.progRoles?.[encounter],
      ].filter(Boolean) as string[];

      if (member && roles.length > 0) {
        await member.roles.remove(roles);
        this.logger.log(
          `Removed roles ${roles.join(', ')} from ${member.user.username}`,
        );
      }
    } catch (error) {
      scope.setExtras({ encounter, userId });
      scope.captureException(error);
    }
  }
}
