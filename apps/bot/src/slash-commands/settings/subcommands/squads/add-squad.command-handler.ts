import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import {
  type ChatInputCommandInteraction,
  MessageFlags,
  roleMention,
} from 'discord.js';
import { squadIdOf, validateSquad } from '../../../../board/squads.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { SlashCommand } from '../../../slash-command.decorator.js';
import type { ISlashCommand } from '../../../slash-command.interface.js';
import { SettingsSlashCommand } from '../../settings.slash-command.js';

@Injectable()
@SlashCommand({ builder: SettingsSlashCommand, subcommand: 'squad-add' })
class AddSquadCommandHandler implements ISlashCommand {
  constructor(private readonly settingsCollection: SettingsCollection) {}

  @SentryTraced()
  async execute(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const settings = await this.settingsCollection.getSettings(
      interaction.guildId,
    );
    const existing = settings?.squads ?? {};
    const result = validateSquad(
      {
        name: interaction.options.getString('name', true),
        tag: interaction.options.getString('tag', true),
        color: interaction.options.getString('color', true),
        roleId: interaction.options.getRole('role', true).id,
      },
      existing,
    );
    if (!result.ok) {
      await interaction.editReply(result.message);
      return;
    }

    const { squad } = result;
    await this.settingsCollection.setSquads(interaction.guildId, {
      ...existing,
      [squadIdOf(squad.tag)]: squad,
    });

    await interaction.editReply(
      `Added **${squad.name}** (${squad.tag}) for ${roleMention(squad.roleId)}.`,
    );
  }
}

export { AddSquadCommandHandler };
