import { Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { SentryTraced } from '@sentry/nestjs';
import type { ChatInputCommandInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { ErrorService } from '../../../../error/error.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { SlashCommand } from '../../../slash-command.decorator.js';
import type { ISlashCommand } from '../../../slash-command.interface.js';
import { SettingsSlashCommand } from '../../settings.slash-command.js';

@Injectable()
@SlashCommand({ builder: SettingsSlashCommand, subcommand: 'encounter-roles' })
class EditEncounterRolesCommandHandler implements ISlashCommand {
  constructor(
    private readonly settingsCollection: SettingsCollection,
    private readonly errorService: ErrorService,
  ) {}

  @SentryTraced()
  async execute(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    const scope = Sentry.getCurrentScope();
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const encounter = interaction.options.getString('encounter', true);
      const progRole = interaction.options.getRole('prog-role', true);
      const clearRole = interaction.options.getRole('clear-role', true);

      // Add command-specific context
      scope.setContext('encounter_roles_update', {
        encounter,
        progRoleId: progRole.id,
        progRoleName: progRole.name,
        clearRoleId: clearRole.id,
        clearRoleName: clearRole.name,
      });

      const settings = await this.settingsCollection.getSettings(
        interaction.guildId,
      );

      await this.settingsCollection.upsert(interaction.guildId, {
        ...settings,
        progRoles: {
          ...settings?.progRoles,
          [encounter]: progRole.id,
        },
        clearRoles: {
          ...settings?.clearRoles,
          [encounter]: clearRole.id,
        },
      });

      await interaction.editReply('Encounter roles updated!');
    } catch (error) {
      const errorEmbed = this.errorService.handleCommandError(
        error,
        interaction,
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
}

export { EditEncounterRolesCommandHandler };
