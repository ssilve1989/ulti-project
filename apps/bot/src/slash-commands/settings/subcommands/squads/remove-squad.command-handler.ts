import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js';
import { squadsOf } from '../../../../board/squads.js';
import { SettingsCollection } from '../../../../firebase/collections/settings-collection.js';
import { SlashCommand } from '../../../slash-command.decorator.js';
import type { ISlashCommand } from '../../../slash-command.interface.js';
import { SettingsSlashCommand } from '../../settings.slash-command.js';

/** Discord's limit on autocomplete choices. */
const MAX_CHOICES = 25;

@Injectable()
@SlashCommand({ builder: SettingsSlashCommand, subcommand: 'squad-remove' })
class RemoveSquadCommandHandler implements ISlashCommand {
  constructor(private readonly settingsCollection: SettingsCollection) {}

  @SentryTraced()
  async execute(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const squadId = interaction.options.getString('squad', true);
    const settings = await this.settingsCollection.getSettings(
      interaction.guildId,
    );
    const { [squadId]: removed, ...others } = settings?.squads ?? {};
    if (!removed) {
      await interaction.editReply("That squad doesn't exist.");
      return;
    }

    await this.settingsCollection.setSquads(interaction.guildId, others);
    await interaction.editReply(`Removed **${removed.name}**.`);
  }

  /** Offers this guild's squads whose `name (TAG)` contains what was typed. */
  async autocomplete(
    interaction: AutocompleteInteraction<'cached'>,
  ): Promise<void> {
    const settings = await this.settingsCollection.getSettings(
      interaction.guildId,
    );
    const typed = interaction.options.getFocused().toLowerCase();
    await interaction.respond(
      squadsOf(settings)
        .map((squad) => ({
          name: `${squad.name} (${squad.tag})`,
          value: squad.id,
        }))
        .filter((choice) => choice.name.toLowerCase().includes(typed))
        .slice(0, MAX_CHOICES),
    );
  }
}

export { RemoveSquadCommandHandler };
