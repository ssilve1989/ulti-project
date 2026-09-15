import {
  Encounter,
  EncounterFriendlyDescription,
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '@ulti-project/shared';
import { Colors, StringSelectMenuBuilder } from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { partialMock } from '../../test-utils/mock-factory.js';
import {
  createEditButtonsRow,
  createEditConflictEmbed,
  createEditSavedEmbed,
  createEditScreenEmbed,
  describeDecider,
  markSelectedProgPoint,
} from './edit-signup.components.js';
import {
  EDIT_CANCEL_BUTTON_ID,
  EDIT_SAVE_BUTTON_ID,
  EDIT_SAVE_WITH_COMMENT_BUTTON_ID,
  EDIT_SIGNUP_MESSAGES,
} from './edit-signup.consts.js';
import type { EditKind, EditPreview } from './edit-signup.policy.js';

const progPointLabels = new Map([['P2', 'P2 Light Rampant']]);
const title = `Edit Review — Faye Valentine @ Gilgamesh · ${EncounterFriendlyDescription[Encounter.DSR]}`;

const preview: EditPreview = {
  hasChanges: true,
  rows: [{ label: 'Prog Point', from: 'P2 Light Rampant', to: 'P4' }],
  effects: ['Google Sheet row updated', "Applicant will be DM'd"],
};

describe('createEditButtonsRow', () => {
  const cases: { kind: EditKind; commit: string; commitWithComment: string }[] =
    [
      {
        kind: 'correction',
        commit: 'Save',
        commitWithComment: 'Save with Comment',
      },
      {
        kind: 'reversal',
        commit: 'Approve',
        commitWithComment: 'Approve with Comment',
      },
    ];

  it.each(cases)(
    'labels $kind buttons and disables only the commit buttons',
    ({ kind, commit, commitWithComment }) => {
      expect(
        createEditButtonsRow(kind, true).components.map(
          (button) => button.data,
        ),
      ).toEqual([
        expect.objectContaining({
          custom_id: EDIT_SAVE_BUTTON_ID,
          label: commit,
          disabled: true,
        }),
        expect.objectContaining({
          custom_id: EDIT_SAVE_WITH_COMMENT_BUTTON_ID,
          label: commitWithComment,
          disabled: true,
        }),
        expect.objectContaining({
          custom_id: EDIT_CANCEL_BUTTON_ID,
          label: 'Cancel',
          disabled: false,
        }),
      ]);
    },
  );
});

describe('markSelectedProgPoint', () => {
  it('marks only the selected option as default', () => {
    const menu = new StringSelectMenuBuilder()
      .setCustomId('progPointSelect')
      .addOptions({ label: 'P2', value: 'P2' }, { label: 'P4', value: 'P4' });

    markSelectedProgPoint(menu, 'P4');
    expect(menu.options.map((option) => option.data.default)).toEqual([
      false,
      true,
    ]);

    markSelectedProgPoint(menu, undefined);
    expect(menu.options.map((option) => option.data.default)).toEqual([
      false,
      false,
    ]);
  });
});

describe('describeDecider', () => {
  it('mentions the actor of the latest decision', () => {
    expect(
      describeDecider({
        reviewedBy: 'spike',
        reviewHistory: [
          {
            type: 'declined',
            actorId: 'reviewer-2',
            at: Timestamp.fromMillis(1_000),
            via: 'reaction',
          },
        ],
      }),
    ).toBe('<@reviewer-2>');
  });

  it('falls back to reviewedBy, then unknown', () => {
    expect(describeDecider({ reviewedBy: 'spike' })).toBe('spike');
    expect(describeDecider({})).toBe('unknown');
  });
});

describe('createEditScreenEmbed', () => {
  const approved = partialMock<SignupDocument>({
    character: 'faye valentine',
    world: 'gilgamesh',
    encounter: Encounter.DSR,
    status: SignupStatus.APPROVED,
    progPointRequested: 'P3',
    progPoint: 'P2',
    partyStatus: PartyStatus.ProgParty,
    reviewedBy: 'spike',
  });

  it('renders a correction screen', () => {
    const embed = createEditScreenEmbed({
      signup: approved,
      kind: 'correction',
      reviewMessageUrl: 'https://discord.com/channels/g/c/m',
      progPointLabels,
    });

    expect(embed.data).toEqual({
      title,
      color: Colors.Yellow,
      fields: [
        { name: 'Status', value: 'APPROVED by spike', inline: true },
        { name: 'Requested Prog Point', value: 'P3', inline: true },
        {
          name: 'Approved Prog Point',
          value: 'P2 Light Rampant',
          inline: true,
        },
        {
          name: 'Review Message',
          value: '[View](https://discord.com/channels/g/c/m)',
          inline: true,
        },
      ],
    });
  });

  it('renders a reversal screen with the decline reason', () => {
    const declined = partialMock<SignupDocument>({
      ...approved,
      status: SignupStatus.DECLINED,
      declineReason: 'Signup lacks valid proof of requested prog point',
    });

    const embed = createEditScreenEmbed({
      signup: declined,
      kind: 'reversal',
      progPointLabels,
    });

    expect(embed.data.fields).toEqual([
      { name: 'Status', value: 'DECLINED by spike', inline: true },
      { name: 'Requested Prog Point', value: 'P3', inline: true },
      {
        name: 'Decline Reason',
        value: 'Signup lacks valid proof of requested prog point',
        inline: false,
      },
    ]);
  });

  it('appends changes and effects when the preview has changes', () => {
    const embed = createEditScreenEmbed({
      signup: approved,
      kind: 'correction',
      progPointLabels,
      preview,
    });

    expect(embed.data.fields?.slice(-2)).toEqual([
      {
        name: 'Changes',
        value: '**Prog Point:** P2 Light Rampant → P4',
        inline: false,
      },
      {
        name: 'Effects',
        value: "• Google Sheet row updated\n• Applicant will be DM'd",
        inline: false,
      },
    ]);
  });

  it('shows no changes when the preview is unchanged', () => {
    const embed = createEditScreenEmbed({
      signup: approved,
      kind: 'correction',
      progPointLabels,
      preview: { hasChanges: false, rows: [], effects: [] },
    });

    expect(embed.data.fields?.at(-1)).toEqual({
      name: 'Changes',
      value: EDIT_SIGNUP_MESSAGES.NO_CHANGES,
      inline: false,
    });
  });
});

describe('result embeds', () => {
  it('renders a saved edit', () => {
    expect(createEditSavedEmbed(preview).data).toEqual({
      title: 'Signup Updated',
      color: Colors.Green,
      description: "Applicant will be DM'd",
      fields: [
        {
          name: 'Changes',
          value: '**Prog Point:** P2 Light Rampant → P4',
          inline: false,
        },
      ],
    });
  });

  it('renders a saved edit with a Sheets warning', () => {
    const embed = createEditSavedEmbed(preview, 'Sheet broke');

    expect(embed.data.color).toBe(Colors.Yellow);
    expect(embed.data.description).toBe(
      "Sheet broke\n\nApplicant will be DM'd",
    );
  });

  it('renders a conflict', () => {
    expect(createEditConflictEmbed().data).toEqual({
      color: Colors.Red,
      description: EDIT_SIGNUP_MESSAGES.CONFLICT,
    });
  });
});
