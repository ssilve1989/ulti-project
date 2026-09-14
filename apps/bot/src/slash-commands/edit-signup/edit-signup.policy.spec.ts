import {
  Encounter,
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '@ulti-project/shared';
import { describe, expect, it } from 'vitest';
import type { SettingsDocument } from '../../firebase/models/settings.model.js';
import { partialMock } from '../../test-utils/mock-factory.js';
import { buildEditPreview, getEditability } from './edit-signup.policy.js';

const progPointLabels = new Map([
  ['P2', 'P2 Light Rampant'],
  ['P4', 'P4 Crystallize Time'],
]);

const fullSettings = partialMock<SettingsDocument>({
  spreadsheetId: 'sheet-1',
  progRoles: { [Encounter.DSR]: 'prog-role' },
  clearRoles: { [Encounter.DSR]: 'clear-role' },
  progPointRoles: { [Encounter.DSR]: { P2: 'p2-role' } },
  signupChannel: 'signup-channel',
});

const noSettings = partialMock<SettingsDocument>({});

describe('getEditability', () => {
  it.each([
    {
      status: SignupStatus.APPROVED,
      expected: { editable: true, kind: 'correction' },
    },
    {
      status: SignupStatus.DECLINED,
      expected: { editable: true, kind: 'reversal' },
    },
    {
      status: SignupStatus.PENDING,
      expected: { editable: false, reason: 'reviewPending' },
    },
    {
      status: SignupStatus.UPDATE_PENDING,
      expected: { editable: false, reason: 'reviewPending' },
    },
  ])('$status → $expected', ({ status, expected }) => {
    expect(getEditability({ status })).toEqual(expected);
  });
});

describe('buildEditPreview', () => {
  const approvedInClear = partialMock<SignupDocument>({
    encounter: Encounter.DSR,
    progPoint: 'P4',
    partyStatus: PartyStatus.ClearParty,
    approvalMessageId: 'announcement-1',
  });

  it('reports no changes when a correction re-selects the current prog point', () => {
    expect(
      buildEditPreview({
        signup: approvedInClear,
        kind: 'correction',
        selection: { progPoint: 'P4', partyStatus: PartyStatus.ClearParty },
        settings: fullSettings,
        progPointLabels,
      }),
    ).toEqual({ hasChanges: false, rows: [], effects: [] });
  });

  it('describes a correction within the same party with no configured effects', () => {
    const approvedInProg = partialMock<SignupDocument>({
      encounter: Encounter.DSR,
      progPoint: 'P2',
      partyStatus: PartyStatus.ProgParty,
    });

    expect(
      buildEditPreview({
        signup: approvedInProg,
        kind: 'correction',
        selection: { progPoint: 'P3', partyStatus: PartyStatus.ProgParty },
        settings: noSettings,
        progPointLabels,
      }),
    ).toEqual({
      hasChanges: true,
      rows: [{ label: 'Prog Point', from: 'P2 Light Rampant', to: 'P3' }],
      effects: ["Applicant will be DM'd"],
    });
  });

  it('describes a Clear → Prog correction with every effect configured', () => {
    expect(
      buildEditPreview({
        signup: approvedInClear,
        kind: 'correction',
        selection: { progPoint: 'P2', partyStatus: PartyStatus.ProgParty },
        settings: fullSettings,
        progPointLabels,
      }),
    ).toEqual({
      hasChanges: true,
      rows: [
        {
          label: 'Prog Point',
          from: 'P4 Crystallize Time',
          to: 'P2 Light Rampant',
        },
        { label: 'Party', from: 'Clear Party', to: 'Prog Party' },
      ],
      effects: [
        'Google Sheet row moves from Clear Party to Prog Party',
        'Encounter role: <@&clear-role> → <@&prog-role>',
        'Prog-point role updated',
        'Public announcement edited',
        "Applicant will be DM'd",
      ],
    });
  });

  it('renders an unconfigured coarse role as none and omits the announcement without a stored id', () => {
    const signup = partialMock<SignupDocument>({
      encounter: Encounter.DSR,
      progPoint: 'P4',
      partyStatus: PartyStatus.ClearParty,
    });

    const preview = buildEditPreview({
      signup,
      kind: 'correction',
      selection: { progPoint: 'P2', partyStatus: PartyStatus.ProgParty },
      settings: partialMock<SettingsDocument>({
        progRoles: { [Encounter.DSR]: 'prog-role' },
        signupChannel: 'signup-channel',
      }),
      progPointLabels,
    });

    expect(preview.effects).toEqual([
      'Encounter role: none → <@&prog-role>',
      "Applicant will be DM'd",
    ]);
  });

  it('describes a reversal of a never-approved signup', () => {
    const declined = partialMock<SignupDocument>({ encounter: Encounter.DSR });

    expect(
      buildEditPreview({
        signup: declined,
        kind: 'reversal',
        selection: { progPoint: 'P2', partyStatus: PartyStatus.ProgParty },
        settings: fullSettings,
        progPointLabels,
      }),
    ).toEqual({
      hasChanges: true,
      rows: [
        { label: 'Prog Point', from: 'none', to: 'P2 Light Rampant' },
        { label: 'Party', from: 'none', to: 'Prog Party' },
        { label: 'Status', from: 'DECLINED', to: 'APPROVED' },
      ],
      effects: [
        'Google Sheet row updated',
        'Encounter role: <@&prog-role>',
        'Prog-point role updated',
        'New public announcement posted',
        "Applicant will be DM'd",
      ],
    });
  });

  it('keeps the status row for a reversal that re-selects the previous prog point', () => {
    const declinedUpdate = partialMock<SignupDocument>({
      encounter: Encounter.DSR,
      progPoint: 'P2',
      partyStatus: PartyStatus.ProgParty,
    });

    const preview = buildEditPreview({
      signup: declinedUpdate,
      kind: 'reversal',
      selection: { progPoint: 'P2', partyStatus: PartyStatus.ProgParty },
      settings: noSettings,
      progPointLabels,
    });

    expect(preview.hasChanges).toBe(true);
    expect(preview.rows).toEqual([
      { label: 'Status', from: 'DECLINED', to: 'APPROVED' },
    ]);
  });
});
