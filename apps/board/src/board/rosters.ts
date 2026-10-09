import type {
  BoardErrorBody,
  BoardParticipant,
  BoardRoster,
  Encounter,
  RosterSlot,
  SquadHelper,
} from '@ulti-project/shared';
import { ROSTER_SLOTS } from '@ulti-project/shared/rosters';
import { createSignal } from 'solid-js';
import { api } from '../api/client';
import { isAccessRefusal, useShell } from '../shell/shell-context';
import type { EventStream } from './event-stream';

/** Who a lead picks for a slot; the name is only for the card's error message. */
export type SlotChoice =
  | { kind: 'progger'; participantId: string }
  | { kind: 'helper'; discordId: string; displayName: string };

export interface RosterActions {
  /** By `${teamId}:${slot}` for a slot, `teamId` for removing a team, or 'add'. */
  readonly pending: (key: string) => boolean;
  /** The card's error, by team id, or 'add' for a refused new team. */
  readonly error: (teamId: string) => string | undefined;
  readonly addTeam: (encounter: Encounter) => void;
  readonly removeTeam: (encounter: Encounter, teamId: string) => void;
  readonly fill: (
    encounter: Encounter,
    teamId: string,
    slot: RosterSlot,
    choice: SlotChoice | null,
  ) => void;
}

/** Changes to `me`'s squad's rosters. The API's answer is what renders: no optimistic update. */
export function createRosterActions(
  eventId: string,
  stream: EventStream,
): RosterActions {
  const { refetchMe } = useShell();
  const [pendingKeys, setPendingKeys] = createSignal<ReadonlySet<string>>(
    new Set(),
  );
  const [errors, setErrors] = createSignal<
    Readonly<Record<string, string | undefined>>
  >({});

  const setPending = (key: string, pending: boolean) =>
    setPendingKeys((keys) => {
      const next = new Set(keys);
      if (pending) next.add(key);
      else next.delete(key);
      return next;
    });
  const setError = (key: string, message: string | undefined) =>
    setErrors((all) => ({ ...all, [key]: message }));

  async function send(
    key: string,
    errorKey: string,
    path: string,
    init: RequestInit,
    name?: string,
  ): Promise<void> {
    setPending(key, true);
    setError(errorKey, undefined);
    const result = await api<BoardRoster>(
      `/api/events/${eventId}/rosters/${path}`,
      init,
    );
    setPending(key, false);
    if (result.ok) {
      stream.putRoster(result.body);
      return;
    }
    if (isAccessRefusal(result)) {
      // The shell then shows the sign-in or no-access screen.
      refetchMe();
      return;
    }
    const { reason } = result.body;
    if (reason === 'no-squad' || reason === 'squad-conflict') refetchMe();
    setError(errorKey, refusalMessage(reason, name ?? 'This player'));
  }

  return {
    pending: (key) => pendingKeys().has(key),
    error: (teamId) => errors()[teamId],
    addTeam: (encounter) =>
      void send('add', 'add', `${encounter}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
    removeTeam: (encounter, teamId) =>
      void send(teamId, teamId, `${encounter}/teams/${teamId}`, {
        method: 'DELETE',
      }),
    fill: (encounter, teamId, slot, choice) => {
      const path = `${encounter}/teams/${teamId}/slots/${slot}`;
      const key = `${teamId}:${slot}`;
      if (choice === null) {
        void send(key, teamId, path, { method: 'DELETE' });
        return;
      }
      const [body, name] =
        choice.kind === 'progger'
          ? [
              { kind: 'progger', participantId: choice.participantId },
              stream.participant(choice.participantId)?.character,
            ]
          : [
              { kind: 'helper', discordId: choice.discordId },
              choice.displayName,
            ];
      void send(
        key,
        teamId,
        path,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        name,
      );
    },
  };
}

/** What a refused roster change tells the user, as the spec words it. */
function refusalMessage(
  reason: BoardErrorBody['reason'],
  name: string,
): string {
  switch (reason) {
    case 'not-claimed':
      return `${name} isn't claimed by your squad any more.`;
    case 'not-a-helper':
      return `${name} doesn't have the squad role.`;
    case 'closed':
      return 'This event is closed.';
    default:
      return "Couldn't save. Try again.";
  }
}

interface Option {
  readonly value: string;
  readonly label: string;
}

/** A slot picker's option groups. Values are `progger:<participantId>` or `helper:<discordId>`. */
export function slotOptions(
  slot: RosterSlot,
  claimed: readonly BoardParticipant[],
  helpers: readonly SquadHelper[],
  roster: BoardRoster,
): { suggested: Option[]; otherProggers: Option[]; helpers: Option[] } {
  const jobs = ROSTER_SLOTS.find((row) => row.slot === slot)?.jobs ?? [];
  // Where each placed person is, by Discord id: placing them again moves them.
  const placed = new Map<string, string>();
  roster.teams.forEach((team, index) => {
    for (const { slot: key, label } of ROSTER_SLOTS) {
      const fill = team.slots[key];
      if (fill) placed.set(fill.discordId, ` (Team ${index + 1} · ${label})`);
    }
  });
  const labelled = (discordId: string, name: string) =>
    `${name}${placed.get(discordId) ?? ''}`;
  const progger = (p: BoardParticipant): Option => ({
    value: `progger:${p.id}`,
    label: labelled(p.discordId, p.character),
  });

  return {
    suggested: claimed.filter((p) => jobs.includes(p.job)).map(progger),
    otherProggers: claimed.filter((p) => !jobs.includes(p.job)).map(progger),
    helpers: helpers.map((helper) => ({
      value: `helper:${helper.discordId}`,
      label: labelled(helper.discordId, helper.displayName),
    })),
  };
}
