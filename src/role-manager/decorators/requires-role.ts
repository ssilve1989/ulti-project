import { type ICommandHandler } from '@nestjs/cqrs';
import { MessageFlags, PermissionsBitField } from 'discord.js';
import type { DiscordCommand } from '../../slash-commands/slash-commands.interfaces.js';

interface Options {
  disallowAdmin?: boolean;
}

/**
 * Requires a specific role to use the wrapped commandhandler classes execute function.
 * Note! This decorator will defer the interactions reply for you.
 * @param roleKey
 * @param param1
 * @returns
 */
export function RequiresRole(
  // TODO: Strongly type role keys?
  roleKey: string,
  { disallowAdmin = false }: Options = {},
) {
  return <T extends { new (...args: any[]): ICommandHandler<DiscordCommand> }>(
    target: T,
  ) => {
    const originalHandler = target.prototype.execute;

    target.prototype.execute = async function (command: DiscordCommand) {
      const { interaction } = command;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const roleManagerService = this.roleManagerService;

      if (!roleManagerService) {
        throw new Error(
          'RoleValidationService must be injected into the command handler',
        );
      }

      const isAdmin = interaction.memberPermissions.has(
        PermissionsBitField.Flags.Administrator,
      );

      const hasRole = await roleManagerService.validateRole(
        interaction,
        roleKey,
      );

      const hasPermission = disallowAdmin ? hasRole : hasRole || isAdmin;

      if (!hasPermission) {
        await interaction.editReply({
          content: 'You do not have permission to use this command.',
        });
        return;
      }

      return originalHandler.call(this, command);
    };

    return target;
  };
}
