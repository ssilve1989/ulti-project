import { Injectable, Logger } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import type { SignupDocument } from '@ulti-project/shared';
import { Encounter } from '@ulti-project/shared';
import type {
  ChatInputCommandInteraction,
  MessageComponentInteraction,
} from 'discord.js';
import {
  ActionRowBuilder,
  ButtonBuilder,
  Colors,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
} from 'discord.js';
import { isSameUserFilter } from '../../../common/collection-filters.js';
import { characterField } from '../../../common/components/fields.js';
import { type ApplicationModeConfig, appConfig } from '../../../config/app.js';
import { EncountersService } from '../../../encounters/encounters.service.js';
import { ErrorService } from '../../../error/error.service.js';
import { SignupCollection } from '../../../firebase/collections/signup.collection.js';
import { SlashCommand } from '../../slash-command.decorator.js';
import type { ISlashCommand } from '../../slash-command.interface.js';
import {
  createEncounterSelectMenu,
  createPaginationRow,
  createProgPointSelectMenu,
  createResetButton,
  SEARCH_ENCOUNTER_SELECTOR_ID,
  SEARCH_NEXT_PAGE_BUTTON_ID,
  SEARCH_PREV_PAGE_BUTTON_ID,
  SEARCH_PROG_POINT_SELECT_ID,
  SEARCH_RESET_BUTTON_ID,
} from '../search.components.js';
import { SearchSlashCommand } from '../search.slash-command.js';

type SearchSessionState = {
  selectedEncounter: Encounter | null;
  selectedProgPoint: string | null;
  resultPages: SignupDocument[][];
  totalResults: number;
  currentPage: number;
};

@Injectable()
@SlashCommand({ builder: SearchSlashCommand })
class SearchCommandHandler implements ISlashCommand {
  private readonly logger = new Logger(SearchCommandHandler.name);
  private readonly applicationMode: ApplicationModeConfig;

  constructor(
    private readonly signupsCollection: SignupCollection,
    private readonly encountersService: EncountersService,
    private readonly errorService: ErrorService,
  ) {
    this.applicationMode = appConfig.APPLICATION_MODE;
  }

  @SentryTraced()
  async execute(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
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
    const state: SearchSessionState = {
      selectedEncounter: null,
      selectedProgPoint: null,
      resultPages: [],
      totalResults: 0,
      currentPage: 0,
    };

    // a rejection escaping this listener would hit the process-level
    // unhandledRejection handler in main.ts and take the bot down
    collector.on('collect', async (i) => {
      try {
        await i.deferUpdate();
        await this.handleSearchComponentInteraction(
          i,
          interaction.guildId,
          state,
          initialEmbed,
          initialRow,
        );
      } catch (error) {
        this.logger.error(
          'Failed to handle search component interaction',
          error,
        );
        this.errorService.captureError(error);
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

  private async handleSearchComponentInteraction(
    i: MessageComponentInteraction<'cached'>,
    guildId: string,
    state: SearchSessionState,
    initialEmbed: EmbedBuilder,
    initialRow: ActionRowBuilder<StringSelectMenuBuilder>,
  ): Promise<void> {
    if (i.customId === SEARCH_ENCOUNTER_SELECTOR_ID && i.isStringSelectMenu()) {
      // User selected an encounter
      state.selectedEncounter = i.values[0] as Encounter;
      state.selectedProgPoint = null;

      const embed = new EmbedBuilder()
        .setTitle('Search Signups')
        .setDescription(
          `Selected encounter: ${state.selectedEncounter}\nNow select a prog point`,
        )
        .setColor(Colors.Blue);

      // Create a row with the prog point selection menu
      const progPointOptions =
        await this.encountersService.getProgPointsAsOptions(
          guildId,
          state.selectedEncounter,
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
      state.selectedProgPoint = i.values[0];

      // Search for signups matching the encounter and prog point
      const searchResults = await this.searchSignups(
        guildId,
        state.selectedEncounter as Encounter,
        state.selectedProgPoint,
      );

      state.resultPages = this.paginateSignups(searchResults);
      state.totalResults = searchResults.length;
      state.currentPage = 0;

      await i.editReply(
        this.buildResultsPage(
          state.selectedEncounter as Encounter,
          state.selectedProgPoint,
          state.totalResults,
          state.resultPages,
          state.currentPage,
        ),
      );
    } else if (
      i.customId === SEARCH_PREV_PAGE_BUTTON_ID ||
      i.customId === SEARCH_NEXT_PAGE_BUTTON_ID
    ) {
      // Navigate between result pages
      state.currentPage =
        i.customId === SEARCH_PREV_PAGE_BUTTON_ID
          ? Math.max(state.currentPage - 1, 0)
          : Math.min(state.currentPage + 1, state.resultPages.length - 1);

      await i.editReply(
        this.buildResultsPage(
          state.selectedEncounter as Encounter,
          state.selectedProgPoint as string,
          state.totalResults,
          state.resultPages,
          state.currentPage,
        ),
      );
    } else if (i.customId === SEARCH_RESET_BUTTON_ID) {
      // Reset the selections
      state.selectedEncounter = null;
      state.selectedProgPoint = null;
      state.resultPages = [];
      state.totalResults = 0;
      state.currentPage = 0;

      // Return to initial state
      await i.editReply({
        embeds: [initialEmbed],
        components: [initialRow],
      });
    }
  }

  /**
   * Search for signups matching the encounter and prog point (at least)
   */
  private async searchSignups(
    guildId: string,
    encounter: Encounter,
    progPoint: string,
  ) {
    // Get all prog points for the encounter
    const allProgPoints = await this.encountersService.getProgPoints(
      guildId,
      encounter,
    );

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
      this.signupsCollection.findAll(guildId, {
        encounter,
        progPoint: progPointId,
      }),
    );

    const signupArrays = await Promise.all(signupPromises);

    // Flatten the arrays (no deduplication needed since each user can only have one signup per encounter)
    return signupArrays.flat();
  }

  /**
   * Split the search results into pages of PLAYERS_PER_PAGE signups each.
   * Each player takes 3 fields (character, discord, spacer), and embeds have
   * a 25 field limit, so we can show 8 players per page.
   */
  private paginateSignups(signups: SignupDocument[]): SignupDocument[][] {
    const PLAYERS_PER_PAGE = 8;
    const totalPages = Math.ceil(signups.length / PLAYERS_PER_PAGE);

    return Array.from({ length: totalPages }, (_, pageIndex) => {
      const startIdx = pageIndex * PLAYERS_PER_PAGE;
      const endIdx = Math.min(startIdx + PLAYERS_PER_PAGE, signups.length);
      return signups.slice(startIdx, endIdx);
    });
  }

  /**
   * Build the embed + components payload for a single page of search results
   */
  private buildResultsPage(
    encounter: Encounter,
    progPoint: string,
    totalResults: number,
    resultPages: SignupDocument[][],
    currentPage: number,
  ) {
    const resetRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      createResetButton(),
    );

    if (totalResults === 0) {
      const embed = new EmbedBuilder()
        .setTitle('Search Results')
        .setDescription(
          `No signups found for ${encounter} at least at prog point: ${progPoint}`,
        )
        .setColor(Colors.Red);

      return { embeds: [embed], components: [resetRow] };
    }

    const totalPages = resultPages.length;
    const embed = this.createResultsPageEmbed(
      encounter,
      progPoint,
      totalResults,
      resultPages[currentPage],
      currentPage,
      totalPages,
    );

    const components =
      totalPages > 1
        ? [resetRow, createPaginationRow(currentPage, totalPages)]
        : [resetRow];

    return { embeds: [embed], components };
  }

  /**
   * Create the embed for a single page of search results
   */
  private createResultsPageEmbed(
    encounter: Encounter,
    progPoint: string,
    totalResults: number,
    pageSignups: SignupDocument[],
    pageIndex: number,
    totalPages: number,
  ): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle('Search Results')
      .setDescription(
        `Found ${totalResults} player(s) for **${encounter}** at prog point: **${progPoint} or beyond**${
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
  }
}

export { SearchCommandHandler };
