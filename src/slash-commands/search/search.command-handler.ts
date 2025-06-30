import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SentryTraced } from '@sentry/nestjs';
import {
  ActionRowBuilder,
  ButtonBuilder,
  Colors,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
} from 'discord.js';
import type { AppConfig, ApplicationModeConfig } from '../../app.config.js';
import { isSameUserFilter } from '../../common/collection-filters.js';
import { characterField } from '../../common/components/fields.js';
import { Encounter } from '../../encounters/encounters.consts.js';
import { EncountersService } from '../../encounters/encounters.service.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import { SearchCommand } from './search.command.js';
import {
  SEARCH_ENCOUNTER_SELECTOR_ID,
  SEARCH_PROG_POINT_SELECT_ID,
  SEARCH_RESET_BUTTON_ID,
  createEncounterSelectMenu,
  createProgPointSelectMenu,
  createResetButton,
} from './search.components.js';

@CommandHandler(SearchCommand)
class SearchCommandHandler implements ICommandHandler<SearchCommand> {
  private readonly logger = new Logger(SearchCommandHandler.name);
  private readonly applicationMode: ApplicationModeConfig;

  constructor(
    private readonly signupsCollection: SignupCollection,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly encountersService: EncountersService,
  ) {
    this.applicationMode =
      this.configService.get<ApplicationModeConfig>('APPLICATION_MODE');
  }

  @SentryTraced()
  async execute({ interaction }: SearchCommand): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const initialEmbed = new EmbedBuilder()
      .setTitle('Search Signups')
      .setDescription('Select an encounter to begin your search')
      .setColor(Colors.Blue);

    // Create the initial row with the encounter selection menu
    const initialRow =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        createEncounterSelectMenu(this.applicationMode),
      );

    const replyMessage = await interaction.editReply({
      embeds: [initialEmbed],
      components: [initialRow],
    });

    // Create a collector for the interactions
    const collector = replyMessage.createMessageComponentCollector({
      filter: isSameUserFilter(interaction.user),
      time: 300000, // 5 minutes timeout
    });

    // Keep track of the current state
    let selectedEncounter: Encounter | null = null;
    let selectedProgPoint: string | null = null;

    collector.on('collect', async (i) => {
      await i.deferUpdate();

      if (
        i.customId === SEARCH_ENCOUNTER_SELECTOR_ID &&
        i.isStringSelectMenu()
      ) {
        // User selected an encounter
        selectedEncounter = i.values[0] as Encounter;
        selectedProgPoint = null;

        const embed = new EmbedBuilder()
          .setTitle('Search Signups')
          .setDescription(
            `Selected encounter: ${selectedEncounter}\nNow select a prog point`,
          )
          .setColor(Colors.Blue);

        // Create a row with the prog point selection menu
        const progPointOptions =
          await this.encountersService.getProgPointsAsOptions(
            selectedEncounter,
          );

        const progPointSelectMenu = createProgPointSelectMenu(progPointOptions);

        const progPointRow =
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            progPointSelectMenu,
          );

        // Create a row with the reset button
        const resetRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          createResetButton(),
        );

        await i.editReply({
          embeds: [embed],
          components: [progPointRow, resetRow],
        });
      } else if (
        i.customId === SEARCH_PROG_POINT_SELECT_ID &&
        i.isStringSelectMenu()
      ) {
        // User selected a prog point
        selectedProgPoint = i.values[0];

        // Search for signups matching the encounter and prog point
        const searchResults = await this.searchSignups(
          selectedEncounter as Encounter,
          selectedProgPoint,
        );

        // Format the results
        const embeds = await this.createResultsEmbed(
          selectedEncounter as Encounter,
          selectedProgPoint,
          searchResults,
        );

        // Create a row with the reset button
        const resetRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          createResetButton(),
        );

        await i.editReply({
          embeds: embeds,
          components: [resetRow],
        });
      } else if (i.customId === SEARCH_RESET_BUTTON_ID) {
        // Reset the selections
        selectedEncounter = null;
        selectedProgPoint = null;

        // Return to initial state
        await i.editReply({
          embeds: [initialEmbed],
          components: [initialRow],
        });
      }
    });

    collector.on('end', async () => {
      // When the collector ends (timeout), disable all components
      try {
        await interaction.editReply({
          content:
            'Search session has expired. Please run the command again if needed.',
          components: [],
        });
      } catch (error) {
        this.logger.error('Failed to update expired search message', error);
      }
    });
  }

  /**
   * Search for signups matching the encounter and prog point
   */
  private async searchSignups(encounter: Encounter, progPoint: string) {
    return this.signupsCollection.findAll({
      encounter,
      progPoint,
    });
  }

  /**
   * Create an embed with the search results
   */
  private async createResultsEmbed(
    encounter: Encounter,
    progPoint: string,
    signups: any[],
  ): Promise<EmbedBuilder[]> {
    // If no results found
    if (signups.length === 0) {
      return [
        new EmbedBuilder()
          .setTitle('Search Results')
          .setDescription(
            `No signups found for ${encounter} at prog point: ${progPoint}`,
          )
          .setColor(Colors.Red),
      ];
    }

    // Since each player takes 3 fields (character, discord, spacer),
    // and embeds have a 25 field limit, we can show 8 players per embed
    const PLAYERS_PER_PAGE = 8;
    const totalPages = Math.ceil(signups.length / PLAYERS_PER_PAGE);

    // Create embeds for each page of results
    return Array.from({ length: totalPages }, (_, pageIndex) => {
      const startIdx = pageIndex * PLAYERS_PER_PAGE;
      const endIdx = Math.min(startIdx + PLAYERS_PER_PAGE, signups.length);
      const pageSignups = signups.slice(startIdx, endIdx);

      const embed = new EmbedBuilder()
        .setTitle('Search Results')
        .setDescription(
          `Found ${signups.length} player(s) for **${encounter}** at prog point: **${progPoint}**${
            totalPages > 1 ? `\nPage ${pageIndex + 1}/${totalPages}` : ''
          }`,
        )
        .setColor(Colors.Green);

      // Create fields for each player on this page using flatMap
      const fields = pageSignups.flatMap((signup) => [
        characterField(signup.character),
        {
          name: 'Discord',
          value: `<@${signup.discordId}> (${signup.username})`,
          inline: true,
        },
        { name: 'Role', value: signup.role, inline: true },
      ]);

      return embed.addFields(fields);
    });
  }
}

export { SearchCommandHandler };
