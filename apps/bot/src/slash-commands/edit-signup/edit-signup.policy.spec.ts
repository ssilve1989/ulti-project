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
  const withChannel = partialMock<SettingsDocument>({
    signupChannel: 'signup-channel',
  });
  const withoutChannel = partialMock<SettingsDocument>({});

  it.each([
    {
      name: 'approved, no signup channel configured',
      status: SignupStatus.APPROVED,
      approvalMessageId: undefined,
      settings: withoutChannel,
      expected: { editable: true, kind: 'correction' },
    },
    {
      name: 'approved, channel configured, no linked announcement',
      status: SignupStatus.APPROVED,
      approvalMessageId: undefined,
      settings: withChannel,
      expected: { editable: false, reason: 'announcementNotLinked' },
    },
    {
      name: 'approved, channel configured, linked announcement',
      status: SignupStatus.APPROVED,
      approvalMessageId: 'announcement-1',
      settings: withChannel,
      expected: { editable: true, kind: 'correction' },
    },
    {
      name: 'declined, channel configured, no linked announcement — reversals unaffected',
      status: SignupStatus.DECLINED,
      approvalMessageId: undefined,
      settings: withChannel,
      expected: { editable: true, kind: 'reversal' },
    },
    {
      name: 'pending review',
      status: SignupStatus.PENDING,
      approvalMessageId: undefined,
      settings: withChannel,
      expected: { editable: false, reason: 'reviewPending' },
    },
    {
      name: 'update-pending review',
      status: SignupStatus.UPDATE_PENDING,
      approvalMessageId: undefined,
      settings: withChannel,
      expected: { editable: false, reason: 'reviewPending' },
    },
  ])('$name', ({ status, approvalMessageId, settings, expected }) => {
    expect(getEditability({ status, approvalMessageId }, settings)).toEqual(
      expected,
    );
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
        announcementExists: true,
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
        announcementExists: true,
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
        announcementExists: true,
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

  it('renders an unconfigured coarse role as none', () => {
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
      }),
      progPointLabels,
      announcementExists: true,
    });

    expect(preview.effects).toEqual([
      'Encounter role: none → <@&prog-role>',
      "Applicant will be DM'd",
    ]);
  });

  it('describes a correction announcement edit when the linked post still exists', () => {
    const preview = buildEditPreview({
      signup: approvedInClear,
      kind: 'correction',
      selection: { progPoint: 'P2', partyStatus: PartyStatus.ClearParty },
      settings: partialMock<SettingsDocument>({
        signupChannel: 'signup-channel',
      }),
      progPointLabels,
      announcementExists: true,
    });

    expect(preview.effects).toContain('Public announcement edited');
  });

  it('flags a deleted announcement post instead of claiming it will be edited', () => {
    const preview = buildEditPreview({
      signup: approvedInClear,
      kind: 'correction',
      selection: { progPoint: 'P2', partyStatus: PartyStatus.ClearParty },
      settings: partialMock<SettingsDocument>({
        signupChannel: 'signup-channel',
      }),
      progPointLabels,
      announcementExists: false,
    });

    expect(preview.effects).toContain(
      "Public announcement was deleted — it won't be updated",
    );
    expect(preview.effects).not.toContain('Public announcement edited');
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
        announcementExists: true,
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
      announcementExists: true,
    });

    expect(preview.hasChanges).toBe(true);
    expect(preview.rows).toEqual([
      { label: 'Status', from: 'DECLINED', to: 'APPROVED' },
    ]);
  });
});
