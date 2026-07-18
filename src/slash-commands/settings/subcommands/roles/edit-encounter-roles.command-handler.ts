import { Injectable } from '@nestjs/common';
import type { ChatInputCommandInteraction, Role } from 'discord.js';
import type { SettingsDocument } from '../../../../firebase/models/settings.model.js';
import { SlashCommand } from '../../../slash-command.decorator.js';
import { SettingsSlashCommand } from '../../settings.slash-command.js';
import { SettingsEditCommandHandler } from '../../settings-edit-command.handler.js';

interface EncounterRolesOptions {
  encounter: string;
  progRole: Role;
  clearRole: Role;
}

@Injectable()
@SlashCommand({ builder: SettingsSlashCommand, subcommand: 'encounter-roles' })
class EditEncounterRolesCommandHandler extends SettingsEditCommandHandler<EncounterRolesOptions> {
  protected readOptions(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): EncounterRolesOptions {
    return {
      encounter: interaction.options.getString('encounter', true),
      progRole: interaction.options.getRole('prog-role', true),
      clearRole: interaction.options.getRole('clear-role', true),
    };
  }

  protected scopeContext({
    encounter,
    progRole,
    clearRole,
  }: EncounterRolesOptions) {
    return {
      name: 'encounter_roles_update',
      context: {
        encounter,
        progRoleId: progRole.id,
        progRoleName: progRole.name,
        clearRoleId: clearRole.id,
        clearRoleName: clearRole.name,
      },
    };
  }

  protected buildPatch(
    { encounter, progRole, clearRole }: EncounterRolesOptions,
    existing: SettingsDocument | undefined,
  ) {
    return {
      progRoles: { ...existing?.progRoles, [encounter]: progRole.id },
      clearRoles: { ...existing?.clearRoles, [encounter]: clearRole.id },
    };
  }

  protected successMessage(): string {
    return 'Encounter roles updated!';
  }
}

export { EditEncounterRolesCommandHandler };
