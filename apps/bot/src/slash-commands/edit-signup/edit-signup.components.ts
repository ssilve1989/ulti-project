import {
  EncounterFriendlyDescription,
  type SignupDocument,
} from '@ulti-project/shared';
import {
  ActionRowBuilder,
  type APIEmbedField,
  ButtonBuilder,
  ButtonStyle,
  Colors,
  EmbedBuilder,
  type StringSelectMenuBuilder,
  userMention,
} from 'discord.js';
import { titleCase } from 'title-case';
import { createFields } from '../../common/embed-helpers.js';
import { latestDecision } from '../signup/review-history.js';
import {
  EDIT_CANCEL_BUTTON_ID,
  EDIT_SAVE_BUTTON_ID,
  EDIT_SAVE_WITH_COMMENT_BUTTON_ID,
  EDIT_SIGNUP_MESSAGES,
} from './edit-signup.consts.js';
import {
  APPLICANT_DM_EFFECT,
  type EditKind,
  type EditPreview,
  type EditPreviewRow,
} from './edit-signup.policy.js';

const COMMIT_LABELS: Record<
  EditKind,
  { commit: string; commitWithComment: string }
> = {
  correction: { commit: 'Save', commitWithComment: 'Save with Comment' },
  reversal: { commit: 'Approve', commitWithComment: 'Approve with Comment' },
};

export function createEditButtonsRow(
  kind: EditKind,
  commitDisabled: boolean,
): ActionRowBuilder<ButtonBuilder> {
  const { commit, commitWithComment } = COMMIT_LABELS[kind];

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(EDIT_SAVE_BUTTON_ID)
      .setLabel(commit)
      .setStyle(ButtonStyle.Success)
      .setDisabled(commitDisabled),
    new ButtonBuilder()
      .setCustomId(EDIT_SAVE_WITH_COMMENT_BUTTON_ID)
      .setLabel(commitWithComment)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(commitDisabled),
    new ButtonBuilder()
      .setCustomId(EDIT_CANCEL_BUTTON_ID)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(false),
  );
}

// interaction.update() re-sends the whole menu, and Discord only shows an
// option as picked when it is flagged `default` in that payload.
export function markSelectedProgPoint(
  menu: StringSelectMenuBuilder,
  progPoint: string | undefined,
): void {
  for (const option of menu.options) {
    option.setDefault(option.data.value === progPoint);
  }
}

export function describeDecider(
  signup: Pick<SignupDocument, 'reviewHistory' | 'reviewedBy'>,
): string {
  const decision = latestDecision(signup.reviewHistory);
  return decision
    ? userMention(decision.actorId)
    : (signup.reviewedBy ?? 'unknown');
}

interface EditScreenInput {
  signup: SignupDocument;
  kind: EditKind;
  reviewMessageUrl?: string;
  progPointLabels: ReadonlyMap<string, string>;
  preview?: EditPreview;
}

export function createEditScreenEmbed({
  signup,
  kind,
  reviewMessageUrl,
  progPointLabels,
  preview,
}: EditScreenInput): EmbedBuilder {
  const label = (progPoint: string | undefined) =>
    progPoint ? (progPointLabels.get(progPoint) ?? progPoint) : undefined;

  const embed = new EmbedBuilder()
    .setTitle(
      `Edit Review — ${titleCase(signup.character)} @ ${titleCase(signup.world)} · ${EncounterFriendlyDescription[signup.encounter]}`,
    )
    .setColor(Colors.Yellow)
    .addFields(
      createFields([
        {
          name: 'Status',
          value: `${signup.status} by ${describeDecider(signup)}`,
          inline: true,
        },
        {
          name: 'Requested Prog Point',
          value: signup.progPointRequested,
          inline: true,
        },
        kind === 'correction'
          ? {
              name: 'Approved Prog Point',
              value: label(signup.progPoint),
              inline: true,
            }
          : {
              name: 'Decline Reason',
              value: signup.declineReason,
              inline: false,
            },
        {
          name: 'Review Message',
          value: reviewMessageUrl,
          transform: (url: string) => `[View](${url})`,
          inline: true,
        },
      ]),
    );

  return preview ? embed.addFields(createPreviewFields(preview)) : embed;
}

export function createEditSavedEmbed(
  preview: EditPreview,
  sheetsWarning?: string,
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(EDIT_SIGNUP_MESSAGES.SAVED_TITLE)
    .setColor(sheetsWarning ? Colors.Yellow : Colors.Green)
    .setDescription(
      sheetsWarning
        ? `${sheetsWarning}\n\n${APPLICANT_DM_EFFECT}`
        : APPLICANT_DM_EFFECT,
    )
    .addFields({
      name: 'Changes',
      value: preview.rows.map(formatPreviewRow).join('\n'),
      inline: false,
    });
}

export function createEditConflictEmbed(): EmbedBuilder {
  return createEditGuardEmbed(EDIT_SIGNUP_MESSAGES.CONFLICT);
}

export function createEditGuardEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder().setColor(Colors.Red).setDescription(message);
}

function createPreviewFields({
  hasChanges,
  rows,
  effects,
}: EditPreview): APIEmbedField[] {
  if (!hasChanges) {
    return [
      {
        name: 'Changes',
        value: EDIT_SIGNUP_MESSAGES.NO_CHANGES,
        inline: false,
      },
    ];
  }

  return [
    {
      name: 'Changes',
      value: rows.map(formatPreviewRow).join('\n'),
      inline: false,
    },
    {
      name: 'Effects',
      value: effects.map((effect) => `• ${effect}`).join('\n'),
      inline: false,
    },
  ];
}

function formatPreviewRow({ label, from, to }: EditPreviewRow): string {
  return `**${label}:** ${from} → ${to}`;
}
