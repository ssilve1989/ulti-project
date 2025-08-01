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
import type { AppConfig, ApplicationModeConfig } from '../../../app.config.js';
import { isSameUserFilter } from '../../../common/collection-filters.js';
import { characterField } from '../../../common/components/fields.js';
import { Encounter } from '../../../encounters/encounters.consts.js';
import { EncountersService } from '../../../encounters/encounters.service.js';
import { SignupCollection } from '../../../firebase/collections/signup.collection.js';
import type { SignupDocument } from '../../../firebase/models/signup.model.js';
import { SearchCommand } from '../commands/search.command.js';
import {
  createEncounterSelectMenu,
  createProgPointSelectMenu,
  createResetButton,
  SEARCH_ENCOUNTER_SELECTOR_ID,
  SEARCH_PROG_POINT_SELECT_ID,
  SEARCH_RESET_BUTTON_ID,
} from '../search.components.js';

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
        const embeds = this.createResultsEmbed(
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
   * Search for signups matching the encounter and prog point (at least)
   */
  private async searchSignups(encounter: Encounter, progPoint: string) {
    // Get all prog points for the encounter
    const allProgPoints = await this.encountersService.getProgPoints(encounter);

    // Find the order of the selected prog point
    const selectedOrder = allProgPoints.find((p) => p.id === progPoint)?.order;
    if (selectedOrder === undefined) {
      // If prog point not found, return empty array
      return [];
    }

    // Get all prog points with order >= selected prog point order
    const eligibleProgPoints = allProgPoints.reduce((acc, p) => {
      if (p.order >= selectedOrder) {
        acc.push(p.id);
      }
      return acc;
    }, [] as string[]);

    // If no eligible prog points, return empty array
    if (eligibleProgPoints.length === 0) {
      return [];
    }

    // Query for signups with any of the eligible prog points
    // Using multiple queries since Firestore has limitations on complex queries
    const signupPromises = eligibleProgPoints.map((progPointId) =>
      this.signupsCollection.findAll({
        encounter,
        progPoint: progPointId,
      }),
    );

    const signupArrays = await Promise.all(signupPromises);

    // Flatten the arrays (no deduplication needed since each user can only have one signup per encounter)
    return signupArrays.flat();
  }

  /**
   * Create an embed with the search results
   */
  private createResultsEmbed(
    encounter: Encounter,
    progPoint: string,
    signups: SignupDocument[],
  ): EmbedBuilder[] {
    // If no results found
    if (signups.length === 0) {
      return [
        new EmbedBuilder()
          .setTitle('Search Results')
          .setDescription(
            `No signups found for ${encounter} at least at prog point: ${progPoint}`,
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
          `Found ${signups.length} player(s) for **${encounter}** at prog point: **${progPoint} or beyond**${
            totalPages > 1 ? `\nPage ${pageIndex + 1}/${totalPages}` : ''
          }`,
        )
        .setColor(Colors.Green);

      // Create fields for each player on this page using flatMap
      const fields = pageSignups.flatMap((signup) => [
        characterField(signup.character, { memberId: signup.discordId }),
        { name: 'Role', value: signup.role, inline: true },
        // biome-ignore lint/style/noNonNullAssertion: prog point won't be undefined here but we should improve types of Signups to fix this kind of issue
        { name: 'Prog Point', value: signup.progPoint!, inline: true },
      ]);

      return embed.addFields(fields);
    });
  }
}

export { SearchCommandHandler };
