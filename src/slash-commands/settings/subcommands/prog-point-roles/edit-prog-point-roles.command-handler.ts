import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import type {
  ChatInputCommandInteraction,
  StringSelectMenuBuilder,
} from 'discord.js';
import { ActionRowBuilder, MessageFlags, roleMention } from 'discord.js';
import { isSameUserFilter } from '../../../../common/collection-filters.js';
import { isEncounter } from '../../../../encounters/encounters.consts.js';
import { EncountersComponentsService } from '../../../../encounters/encounters-components.service.js';
import { ErrorService } from '../../../../error/error.service.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { SlashCommand } from '../../../slash-command.decorator.js';
import type { ISlashCommand } from '../../../slash-command.interface.js';
import { SettingsSlashCommand } from '../../settings.slash-command.js';

export const PROG_POINT_ROLES_SELECT_ID = 'progPointRolesSelect';

@Injectable()
@SlashCommand({ builder: SettingsSlashCommand, subcommand: 'prog-point-roles' })
class EditProgPointRolesCommandHandler implements ISlashCommand {
  constructor(
    private readonly settingsCollection: SettingsCollection,
    private readonly encountersComponentsService: EncountersComponentsService,
    private readonly errorService: ErrorService,
  ) {}

  @SentryTraced()
  async execute(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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
    } catch (error) {
      // also reached when the select menu times out (awaitMessageComponent rejects)
      const errorEmbed = this.errorService.handleCommandError(
        error,
        interaction,
      );
      await interaction.editReply({ embeds: [errorEmbed], components: [] });
    }
  }
}

export { EditProgPointRolesCommandHandler };
