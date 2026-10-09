import type {
  BoardErrorBody,
  BoardParticipant,
  SquadView,
} from '@ulti-project/shared';
import { createSignal } from 'solid-js';
import { api } from '../api/client';
import { isAccessRefusal, useShell } from '../shell/shell-context';
import type { EventStream } from './event-stream';
import type { Bucket } from './roster';

export interface ClaimNotice {
  /** Which party's strip shows it. */
  readonly bucket: Bucket;
  readonly message: string;
  /** Present only after a successful claim or release. */
  readonly undo?: () => void;
}

export interface Claims {
  readonly pending: (participantId: string) => boolean;
  readonly claim: (participant: BoardParticipant) => void;
  readonly release: (participant: BoardParticipant) => void;
  readonly notice: (bucket: Bucket) => ClaimNotice | undefined;
  readonly dismiss: (bucket: Bucket) => void;
}

/** Claims and releases for `me`'s squad: applied at once, confirmed or rolled back by the API, with an undo. */
export function createClaims(
  eventId: string,
  stream: EventStream,
  me: { readonly discordId: string; readonly squad: SquadView },
  squadName: (squadId: string) => string,
): Claims {
  const { refetchMe } = useShell();
  const [pendingIds, setPendingIds] = createSignal<ReadonlySet<string>>(
    new Set(),
  );
  const [notices, setNotices] = createSignal<
    Partial<Record<Bucket, ClaimNotice>>
  >({});

  const show = (notice: ClaimNotice) =>
    setNotices((all) => ({ ...all, [notice.bucket]: notice }));
  const setPending = (id: string, pending: boolean) =>
    setPendingIds((ids) => {
      const next = new Set(ids);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });

  function claim(p: BoardParticipant, undoable: boolean): void {
    void change(p, undoable, {
      optimistic: {
        squadId: me.squad.id,
        claimedBy: me.discordId,
        claimedAt: new Date().toISOString(),
      },
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      },
      done: `Claimed ${p.character} for ${me.squad.name}`,
      reverse: release,
    });
  }

  function release(p: BoardParticipant, undoable: boolean): void {
    void change(p, undoable, {
      optimistic: null,
      init: { method: 'DELETE' },
      done: `Released ${p.character}`,
      reverse: claim,
    });
  }

  /** Shows `plan.optimistic` at once, then confirms it or rolls it back by the API's answer. An undo offers no further undo. */
  async function change(
    p: BoardParticipant,
    undoable: boolean,
    plan: {
      readonly optimistic: BoardParticipant['claim'];
      readonly init: RequestInit;
      readonly done: string;
      readonly reverse: (p: BoardParticipant, undoable: boolean) => void;
    },
  ): Promise<void> {
    const { id, character } = p;
    const bucket = p.phase.bucket;
    const before = p.claim;
    stream.putParticipant({ ...p, claim: plan.optimistic });
    setPending(id, true);
    const result = await api<BoardParticipant>(
      `/api/events/${eventId}/participants/${encodeURIComponent(id)}/claim`,
      plan.init,
    );
    setPending(id, false);

    if (result.ok) {
      const confirmed = result.body;
      stream.putParticipant(confirmed);
      show({
        bucket,
        message: plan.done,
        undo: undoable ? () => plan.reverse(confirmed, false) : undefined,
      });
      return;
    }

    const { body } = result;
    if (body.reason === 'claimed') {
      stream.putParticipant({ ...p, claim: body.claim });
      show({
        bucket,
        message: `Already claimed by ${squadName(body.claim.squadId)}`,
      });
      return;
    }
    rollBack(id, plan.optimistic, before);
    if (isAccessRefusal(result)) {
      // The shell then shows the sign-in or no-access screen.
      refetchMe();
      return;
    }
    if (body.reason === 'no-squad' || body.reason === 'squad-conflict')
      refetchMe();
    show({ bucket, message: refusalMessage(body.reason, character) });
  }

  /** Undoes our optimistic change, unless a stream update has replaced it since: that's newer, and wins. */
  function rollBack(
    id: string,
    optimistic: BoardParticipant['claim'],
    before: BoardParticipant['claim'],
  ): void {
    const current = stream.participant(id);
    const stillOurs =
      optimistic === null
        ? current?.claim === null
        : current?.claim?.claimedAt === optimistic.claimedAt;
    if (current && stillOurs)
      stream.putParticipant({ ...current, claim: before });
  }

  return {
    pending: (id) => pendingIds().has(id),
    claim: (p) => claim(p, true),
    release: (p) => release(p, true),
    notice: (bucket) => notices()[bucket],
    dismiss: (bucket) => setNotices((all) => ({ ...all, [bucket]: undefined })),
  };
}

/** What a refused claim or release tells the user; anything unexpected reads as the board being unreachable. */
function refusalMessage(
  reason: BoardErrorBody['reason'],
  character: string,
): string {
  switch (reason) {
    case 'not-found':
      return `${character} is no longer signed up.`;
    case 'closed':
      return 'This event is closed.';
    case 'not-your-claim':
      return `Another squad has claimed ${character}.`;
    case 'no-squad':
    case 'squad-conflict':
      return "You can't claim players right now.";
    default:
      return "Couldn't reach the board. Try again.";
  }
}
