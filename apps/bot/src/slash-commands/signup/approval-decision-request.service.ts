import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import type { SignupDocument } from '@ulti-project/shared';
import {
  ActionRowBuilder,
  type ButtonInteraction,
  DiscordjsErrorCodes,
  type Embed,
  EmbedBuilder,
  type Message,
  type MessageComponentInteraction,
  MessageFlags,
  type ModalMessageModalSubmitInteraction,
  type StringSelectMenuBuilder,
  type User,
} from 'discord.js';
import { isSameUserFilter } from '../../common/collection-filters.js';
import { DiscordService } from '../../discord/discord.service.js';
import { PROG_POINT_SELECT_ID } from '../../encounters/encounters.components.js';
import { EncountersComponentsService } from '../../encounters/encounters-components.service.js';
import { collectApprovalComment } from './approval-comment.js';
import {
  APPROVAL_CANCEL_BUTTON_ID,
  APPROVE_BUTTON_ID,
  APPROVE_WITH_COMMENT_BUTTON_ID,
  createApprovalButtonsRow,
} from './approval-decision.components.js';
import { SIGNUP_MESSAGES } from './signup.consts.js';

export const APPROVAL_DECISION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export type ApprovalDecision =
  | { type: 'approved'; progPoint: string; comment?: string }
  | { type: 'cancelled' };

interface DecisionState {
  progPoint?: string;
  // bumped on every "Approve with Comment" click, so a modal listener left
  // parked by an earlier click can tell it is stale
  modalGeneration: number;
}

// discord.js's own DiscordjsError has a private constructor (library-internal
// use only), but `getErrorReplyMessage` only pattern-matches on `{ code }`
// structurally — so a plain Error with the same code is all callers need.
class ApprovalDecisionTimeoutError extends Error {
  readonly code = DiscordjsErrorCodes.InteractionCollectorError;

  constructor(reason: string) {
    super(`Approval decision collector ended before resolving: ${reason}`);
  }
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

  // interaction.update() re-sends the whole select menu, and Discord only
  // shows a selection as "picked" for options flagged `default` in that
  // payload — without this the menu visually resets to its placeholder on
  // every update even though `state.progPoint` is still tracked internally.
  private markSelectedProgPoint(
    selectRow: ActionRowBuilder<StringSelectMenuBuilder>,
    progPoint: string,
  ): void {
    const [menu] = selectRow.components;
    for (const option of menu.options) {
      option.setDefault(option.data.value === progPoint);
    }
  }

  // A single collector stays registered for the whole decision window,
  // rather than repeated awaitMessageComponent() calls each opening a fresh
  // one — that would leave a gap between one collector ending and the next
  // starting, in which a fast follow-up click has nothing listening for it.
  private collectDecision(
    message: Message,
    reviewer: User,
    selectRow: ActionRowBuilder<StringSelectMenuBuilder>,
  ): Promise<ApprovalDecision> {
    const deadline = Date.now() + APPROVAL_DECISION_TIMEOUT_MS;
    const state: DecisionState = { modalGeneration: 0 };

    return new Promise<ApprovalDecision>((resolve, reject) => {
      let settled = false;

      const collector = message.createMessageComponentCollector({
        filter: isSameUserFilter(reviewer),
        time: APPROVAL_DECISION_TIMEOUT_MS,
      });

      const settle = (action: () => void) => {
        settled = true;
        collector.stop();
        action();
      };

      collector.on('collect', async (interaction) => {
        try {
          const decision = await this.processInteraction(
            interaction,
            state,
            selectRow,
            deadline,
          );
          if (decision) {
            settle(() => resolve(decision));
          }
        } catch (error) {
          settle(() => reject(error));
        }
      });

      collector.on('end', (_collected, reason) => {
        if (!settled) {
          reject(new ApprovalDecisionTimeoutError(reason));
        }
      });
    });
  }

  // Handles one collected interaction against the decision so far, mutating
  // `state` as the prog point is (re)selected. Returns the final decision
  // once a button resolves it, or undefined while still collecting.
  private async processInteraction(
    interaction: MessageComponentInteraction,
    state: DecisionState,
    selectRow: ActionRowBuilder<StringSelectMenuBuilder>,
    deadline: number,
  ): Promise<ApprovalDecision | undefined> {
    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === PROG_POINT_SELECT_ID
    ) {
      state.progPoint = interaction.values.at(0);
      if (state.progPoint) {
        this.markSelectedProgPoint(selectRow, state.progPoint);
      }
      await interaction.update({
        components: [selectRow, createApprovalButtonsRow(false)],
      });
      return undefined;
    }

    if (!interaction.isButton()) {
      return undefined;
    }

    if (interaction.customId === APPROVAL_CANCEL_BUTTON_ID) {
      await this.clearAndNotify(
        interaction,
        SIGNUP_MESSAGES.APPROVAL_CANCELLATION_RECEIVED,
      );
      return { type: 'cancelled' };
    }

    if (!state.progPoint) {
      await interaction.reply({
        content: SIGNUP_MESSAGES.PROG_POINT_REQUIRED_BEFORE_DECISION,
        flags: MessageFlags.Ephemeral,
      });
      return undefined;
    }
    const progPoint = state.progPoint;

    if (interaction.customId === APPROVE_BUTTON_ID) {
      await this.clearAndNotify(
        interaction,
        SIGNUP_MESSAGES.APPROVAL_CONFIRMATION_RECEIVED,
      );
      return { type: 'approved', progPoint };
    }

    if (interaction.customId === APPROVE_WITH_COMMENT_BUTTON_ID) {
      return this.collectComment(interaction, state, deadline);
    }

    return undefined;
  }

  private async collectComment(
    interaction: ButtonInteraction,
    state: DecisionState,
    deadline: number,
  ): Promise<ApprovalDecision | undefined> {
    const collected = await collectApprovalComment(interaction, state, {
      deadline,
      expiredMessage:
        'That took a moment too long to open — please click "Approve with Comment" again.',
    });

    // read at submit time, never from a value captured at click time
    const progPoint = state.progPoint;

    if (!collected || !progPoint) {
      return undefined;
    }

    if (collected.submission.isFromMessage()) {
      await this.clearAndNotify(
        collected.submission,
        SIGNUP_MESSAGES.APPROVAL_CONFIRMATION_RECEIVED,
      );
    }

    return { type: 'approved', progPoint, comment: collected.comment };
  }

  private async clearAndNotify(
    interaction: ButtonInteraction | ModalMessageModalSubmitInteraction,
    message: string,
  ): Promise<void> {
    await interaction.update({ components: [] });
    await interaction.followUp(message);
  }
}
