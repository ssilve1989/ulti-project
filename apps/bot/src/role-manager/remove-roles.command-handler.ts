import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SentryTraced } from '@sentry/nestjs';
import { DiscordService } from '#src/discord/discord.service.js';
import { SettingsCollection } from '#src/firebase/collections/settings-collection.js';
import { RemoveRolesCommand } from '#src/slash-commands/signup/commands/signup.commands.js';

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
    const [member, settings] = await Promise.all([
      this.discordService.getGuildMember({
        guildId,
        memberId: userId,
      }),
      this.settingsCollection.getSettings(guildId),
    ]);

    const roles = [
      ...new Set(
        [
          settings?.clearRoles?.[encounter],
          settings?.progRoles?.[encounter],
          ...Object.values(settings?.progPointRoles?.[encounter] ?? {}),
        ].filter((roleId): roleId is string => Boolean(roleId)),
      ),
    ];

    if (member && roles.length > 0) {
      await member.roles.remove(roles);
      this.logger.log(
        `removed roles ${roles.join(', ')} from ${member.user.username}`,
      );
    }
  }
}
