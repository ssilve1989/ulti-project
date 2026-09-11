import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import type { SignupDocument } from '@ulti-project/shared';
import {
  ActionRowBuilder,
  type ButtonInteraction,
  type Embed,
  EmbedBuilder,
  type Message,
  MessageFlags,
  type StringSelectMenuBuilder,
  type User,
} from 'discord.js';
import { isSameUserFilter } from '../../common/collection-filters.js';
import { DiscordService } from '../../discord/discord.service.js';
import { PROG_POINT_SELECT_ID } from '../../encounters/encounters.components.js';
import { EncountersComponentsService } from '../../encounters/encounters-components.service.js';
import {
  APPROVAL_COMMENT_INPUT_ID,
  APPROVE_BUTTON_ID,
  APPROVE_WITH_COMMENT_BUTTON_ID,
  createApprovalButtonsRow,
  createApprovalCommentModal,
} from './approval-decision.components.js';
import { SIGNUP_MESSAGES } from './signup.consts.js';

const APPROVAL_DECISION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export interface ApprovalDecision {
  progPoint: string;
  comment?: string;
}

@Injectable()
export class ApprovalDecisionRequestService {
  constructor(
    private readonly discordService: DiscordService,
    private readonly encountersComponentsService: EncountersComponentsService,
  ) {}

  @SentryTraced()
  async requestApprovalDecision(
    signup: SignupDocument,
    sourceEmbed: Embed,
    reviewer: User,
  ): Promise<ApprovalDecision> {
    const selectRow = await this.createProgPointRow(signup.encounter);

    const message = await this.discordService.sendDirectMessage(reviewer.id, {
      content: 'Please confirm the prog point of the following signup',
      embeds: [EmbedBuilder.from(sourceEmbed)],
      components: [selectRow, createApprovalButtonsRow(true)],
    });

    try {
      return await this.collectDecision(message, reviewer, selectRow);
    } catch (error) {
      // The resolving interaction already clears components on every
      // success path, so this is only needed to clean up after a timeout.
      await message.edit({ components: [] });
      throw error;
    }
  }

  private async createProgPointRow(
    encounter: SignupDocument['encounter'],
  ): Promise<ActionRowBuilder<StringSelectMenuBuilder>> {
    const menu =
      await this.encountersComponentsService.createProgPointSelectMenu(
        encounter,
      );
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
  }

  private async collectDecision(
    message: Message,
    reviewer: User,
    selectRow: ActionRowBuilder<StringSelectMenuBuilder>,
  ): Promise<ApprovalDecision> {
    const deadline = Date.now() + APPROVAL_DECISION_TIMEOUT_MS;
    const filter = isSameUserFilter(reviewer);
    let progPoint: string | undefined;

    for (;;) {
      const interaction = await message.awaitMessageComponent({
        filter,
        time: this.remainingTime(deadline),
      });

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId === PROG_POINT_SELECT_ID
      ) {
        progPoint = interaction.values.at(0);
        await interaction.update({
          components: [selectRow, createApprovalButtonsRow(false)],
        });
        continue;
      }

      if (interaction.isButton()) {
        if (!progPoint) {
          await interaction.reply({
            content: SIGNUP_MESSAGES.PROG_POINT_REQUIRED_BEFORE_DECISION,
            flags: MessageFlags.Ephemeral,
          });
          continue;
        }

        if (interaction.customId === APPROVE_BUTTON_ID) {
          await interaction.update({ components: [] });
          return { progPoint };
        }

        if (interaction.customId === APPROVE_WITH_COMMENT_BUTTON_ID) {
          const comment = await this.collectComment(interaction, deadline);
          return { progPoint, comment };
        }
      }
    }
  }

  private async collectComment(
    interaction: ButtonInteraction,
    deadline: number,
  ): Promise<string | undefined> {
    await interaction.showModal(createApprovalCommentModal());

    const modalInteraction = await interaction.awaitModalSubmit({
      filter: isSameUserFilter(interaction.user),
      time: this.remainingTime(deadline),
    });

    const comment = modalInteraction.fields
      .getTextInputValue(APPROVAL_COMMENT_INPUT_ID)
      .trim();

    if (modalInteraction.isFromMessage()) {
      await modalInteraction.update({ components: [] });
    }

    return comment || undefined;
  }

  private remainingTime(deadline: number): number {
    // Floor of 1, not 0: discord.js's Collector only arms its timeout timer
    // `if (options.time)`, and 0 is falsy. A deadline already at/past now
    // must still produce a truthy `time` so a timer arms and the call fails
    // fast with the collector's own timeout error, instead of hanging
    // indefinitely.
    return Math.max(deadline - Date.now(), 1);
  }
}
