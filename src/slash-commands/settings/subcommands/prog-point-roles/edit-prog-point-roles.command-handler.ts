import { Injectable } from '@nestjs/common';
import type {
  ChatInputCommandInteraction,
  StringSelectMenuBuilder,
} from 'discord.js';
import { ActionRowBuilder, roleMention } from 'discord.js';
import { isSameUserFilter } from '../../../../common/collection-filters.js';
import { isEncounter } from '../../../../encounters/encounters.consts.js';
import { EncountersComponentsService } from '../../../../encounters/encounters-components.service.js';
import { SlashCommand } from '../../../slash-command.decorator.js';
import { SettingsSlashCommand } from '../../settings.slash-command.js';
import { SettingsSubcommandHandler } from '../../settings-subcommand.handler.js';

export const PROG_POINT_ROLES_SELECT_ID = 'progPointRolesSelect';

@Injectable()
@SlashCommand({ builder: SettingsSlashCommand, subcommand: 'prog-point-roles' })
class EditProgPointRolesCommandHandler extends SettingsSubcommandHandler {
  constructor(
    private readonly encountersComponentsService: EncountersComponentsService,
  ) {
    super();
  }

  // awaitMessageComponent rejecting on timeout also reaches this base
  // class's catch, which is why the select menu is cleared here too.
  protected override errorReplyExtras() {
    return { components: [] };
  }

  protected async handle(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    const encounter = interaction.options.getString('encounter', true);
    const role = interaction.options.getRole('role');

    if (!isEncounter(encounter)) {
      await interaction.editReply(`Unknown encounter: ${encounter}`);
      return;
    }

    const menu =
      await this.encountersComponentsService.createProgPointSelectMenu(
        encounter,
        {
          customId: PROG_POINT_ROLES_SELECT_ID,
          includeCleared: false,
          multiSelect: true,
        },
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      menu,
    );

    const message = await interaction.editReply({
      content: role
        ? `Select the prog points that should assign ${roleMention(role.id)}`
        : 'Select the prog points whose role mappings should be removed',
      components: [row],
    });

    const selection = await message.awaitMessageComponent({
      time: 60_000 * 2, // 2 minutes
      filter: isSameUserFilter(interaction.user),
    });

    if (
      selection.customId !== PROG_POINT_ROLES_SELECT_ID ||
      !selection.isStringSelectMenu()
    ) {
      return;
    }

    const settings = await this.settingsCollection.getSettings(
      interaction.guildId,
    );

    const progPointRoles = { ...settings?.progPointRoles?.[encounter] };

    for (const progPointId of selection.values) {
      if (role) {
        progPointRoles[progPointId] = role.id;
      } else {
        delete progPointRoles[progPointId];
      }
    }

    await this.settingsCollection.setProgPointRoles(
      interaction.guildId,
      encounter,
      progPointRoles,
    );

    await selection.update({
      content: role
        ? `Mapped ${selection.values.length} prog point(s) to ${roleMention(role.id)}`
        : `Removed mappings for ${selection.values.length} prog point(s)`,
      components: [],
    });
  }
}

export { EditProgPointRolesCommandHandler };
