import { Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { ChatInputCommandInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { SlashCommand } from '../../../slash-command.decorator.js';
import type { ISlashCommand } from '../../../slash-command.interface.js';
import { SettingsSlashCommand } from '../../settings.slash-command.js';

@Injectable()
@SlashCommand({ builder: SettingsSlashCommand, subcommand: 'encounter-roles' })
class EditEncounterRolesCommandHandler implements ISlashCommand {
  constructor(private readonly settingsCollection: SettingsCollection) {}

  async execute(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    const scope = Sentry.getCurrentScope();
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

    await this.settingsCollection.upsert(interaction.guildId, {
      progRoles: { [encounter]: progRole.id },
      clearRoles: { [encounter]: clearRole.id },
    });

    await interaction.editReply('Encounter roles updated!');
  }
}

export { EditEncounterRolesCommandHandler };
