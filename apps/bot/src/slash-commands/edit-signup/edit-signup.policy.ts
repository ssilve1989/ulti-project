import {
  type Encounter,
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '@ulti-project/shared';
import { roleMention } from 'discord.js';
import { match } from 'ts-pattern';
import type { SettingsDocument } from '../../firebase/models/settings.model.js';

export type EditKind = 'correction' | 'reversal';

type Editability =
  | { editable: true; kind: EditKind }
  | { editable: false; reason: 'reviewPending' | 'announcementNotLinked' };

export interface EditSelection {
  progPoint: string;
  partyStatus: PartyStatus;
}

export interface EditPreviewRow {
  label: 'Prog Point' | 'Party' | 'Status';
  from: string;
  to: string;
}

export interface EditPreview {
  hasChanges: boolean;
  rows: EditPreviewRow[];
  effects: string[];
}

type PreviewSettings = Pick<
  SettingsDocument,
  | 'spreadsheetId'
  | 'progRoles'
  | 'clearRoles'
  | 'progPointRoles'
  | 'signupChannel'
>;

interface EditPreviewInput {
  signup: Pick<SignupDocument, 'encounter' | 'progPoint' | 'partyStatus'>;
  kind: EditKind;
  selection: EditSelection;
  settings: PreviewSettings;
  progPointLabels: ReadonlyMap<string, string>;
  announcementExists: boolean;
}

export const APPLICANT_DM_EFFECT = "Applicant will be DM'd";

const NONE = 'none';

export function getEditability(
  signup: Pick<SignupDocument, 'status' | 'approvalMessageId'>,
  settings: Pick<SettingsDocument, 'signupChannel'>,
): Editability {
  return match(signup.status)
    .returnType<Editability>()
    .with(SignupStatus.APPROVED, () =>
      settings.signupChannel && !signup.approvalMessageId
        ? { editable: false, reason: 'announcementNotLinked' }
        : { editable: true, kind: 'correction' },
    )
    .with(SignupStatus.DECLINED, () => ({ editable: true, kind: 'reversal' }))
    .with(SignupStatus.PENDING, SignupStatus.UPDATE_PENDING, () => ({
      editable: false,
      reason: 'reviewPending',
    }))
    .exhaustive();
}

export function buildEditPreview(input: EditPreviewInput): EditPreview {
  const { signup, kind, selection } = input;

  if (kind === 'correction' && selection.progPoint === signup.progPoint) {
    return { hasChanges: false, rows: [], effects: [] };
  }

  return {
    hasChanges: true,
    rows: buildRows(input),
    effects: buildEffects(input),
  };
}

function buildRows({
  signup,
  kind,
  selection,
  progPointLabels,
}: EditPreviewInput): EditPreviewRow[] {
  const label = (progPoint: string | undefined) =>
    progPoint ? (progPointLabels.get(progPoint) ?? progPoint) : NONE;
  const rows: EditPreviewRow[] = [];

  if (selection.progPoint !== signup.progPoint) {
    rows.push({
      label: 'Prog Point',
      from: label(signup.progPoint),
      to: label(selection.progPoint),
    });
  }

  if (selection.partyStatus !== signup.partyStatus) {
    rows.push({
      label: 'Party',
      from: signup.partyStatus ?? NONE,
      to: selection.partyStatus,
    });
  }

  if (kind === 'reversal') {
    rows.push({
      label: 'Status',
      from: SignupStatus.DECLINED,
      to: SignupStatus.APPROVED,
    });
  }

  return rows;
}

function buildEffects(input: EditPreviewInput): string[] {
  return [
    sheetEffect(input),
    coarseRoleEffect(input),
    progPointRoleEffect(input),
    announcementEffect(input),
    APPLICANT_DM_EFFECT,
  ].filter((effect): effect is string => effect !== undefined);
}

function sheetEffect({
  signup,
  selection,
  settings,
}: EditPreviewInput): string | undefined {
  if (!settings.spreadsheetId) {
    return undefined;
  }

  return signup.partyStatus && signup.partyStatus !== selection.partyStatus
    ? `Google Sheet row moves from ${signup.partyStatus} to ${selection.partyStatus}`
    : 'Google Sheet row updated';
}

function coarseRoleEffect({
  signup: { encounter, partyStatus },
  kind,
  selection,
  settings,
}: EditPreviewInput): string | undefined {
  if (!settings.progRoles?.[encounter] && !settings.clearRoles?.[encounter]) {
    return undefined;
  }

  const to = impliedCoarseRole(settings, encounter, selection.partyStatus);

  if (kind === 'reversal') {
    return to ? `Encounter role: ${roleMention(to)}` : undefined;
  }

  const from = impliedCoarseRole(settings, encounter, partyStatus);

  return from === to
    ? undefined
    : `Encounter role: ${mentionOrNone(from)} → ${mentionOrNone(to)}`;
}

function progPointRoleEffect({
  signup,
  settings,
}: EditPreviewInput): string | undefined {
  return settings.progPointRoles?.[signup.encounter]
    ? 'Prog-point role updated'
    : undefined;
}

function announcementEffect({
  kind,
  settings,
  announcementExists,
}: EditPreviewInput): string | undefined {
  if (!settings.signupChannel) {
    return undefined;
  }

  if (kind === 'reversal') {
    return 'New public announcement posted';
  }

  return announcementExists
    ? 'Public announcement edited'
    : "Public announcement was deleted — it won't be updated";
}

function impliedCoarseRole(
  settings: PreviewSettings,
  encounter: Encounter,
  partyStatus: PartyStatus | undefined,
): string | undefined {
  if (!partyStatus) {
    return undefined;
  }

  return partyStatus === PartyStatus.ClearParty
    ? settings.clearRoles?.[encounter]
    : settings.progRoles?.[encounter];
}

function mentionOrNone(roleId: string | undefined): string {
  return roleId ? roleMention(roleId) : NONE;
}
