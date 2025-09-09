import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import { SentryTraced } from '@sentry/nestjs';
import { DiscordService } from '../../../discord/discord.service.js';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import { RemoveRolesCommand } from '../commands/signup.commands.js';

// TODO: Re-locate under `roles-manager` module
@CommandHandler(RemoveRolesCommand)
export class RemoveRolesCommandHandler
  implements ICommandHandler<RemoveRolesCommand>
{
  private readonly logger = new Logger(RemoveRolesCommandHandler.name);

  constructor(
    public readonly discordService: DiscordService,
    private readonly settingsCollection: SettingsCollection,
  ) {}

  @SentryTraced()
  async execute({ encounter, userId, guildId }: RemoveRolesCommand) {
    try {
      const [member, settings] = await Promise.all([
        this.discordService.getGuildMember({
          guildId,
          memberId: userId,
        }),
        this.settingsCollection.getSettings(guildId),
      ]);

      const roles = [
        settings?.clearRoles?.[encounter],
        settings?.progRoles?.[encounter],
      ].filter(Boolean) as string[];

      if (member && roles.length > 0) {
        await member.roles.remove(roles);
        this.logger.log(
          `removed roles ${roles.join(', ')} from ${member.user.username}`,
        );
      }
    } catch (error) {
      const scope = Sentry.getCurrentScope();
      scope.setExtras({ encounter, userId });
      scope.captureException(error);
    }
  }
}
