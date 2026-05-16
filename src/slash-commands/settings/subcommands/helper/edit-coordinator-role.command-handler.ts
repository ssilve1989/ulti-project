import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import * as Sentry from '@sentry/nestjs';
import { SentryTraced } from '@sentry/nestjs';
import { MessageFlags } from 'discord.js';
import { ErrorService } from '../../../../error/error.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { EditCoordinatorRoleCommand } from './edit-coordinator-role.command.js';

@CommandHandler(EditCoordinatorRoleCommand)
export class EditCoordinatorRoleCommandHandler
  implements ICommandHandler<EditCoordinatorRoleCommand>
{
  constructor(
    private readonly settingsCollection: SettingsCollection,
    private readonly errorService: ErrorService,
  ) {}

  @SentryTraced()
  async execute({ interaction }: EditCoordinatorRoleCommand) {
    try {
      const scope = Sentry.getCurrentScope();
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const coordinatorRole = interaction.options.getRole(
        'coordinator-role',
        true,
      );

      scope.setContext('coordinator_role_update', {
        roleId: coordinatorRole.id,
        roleName: coordinatorRole.name,
      });

      const settings = await this.settingsCollection.getSettings(
        interaction.guildId,
      );

      await this.settingsCollection.upsert(interaction.guildId, {
        ...settings,
        coordinatorRole: coordinatorRole.id,
      });

      await interaction.editReply('Coordinator role updated!');
    } catch (error) {
      const errorEmbed = this.errorService.handleCommandError(
        error,
        interaction,
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
}
