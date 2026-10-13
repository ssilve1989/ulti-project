import type {
  BoardErrorBody,
  BoardParticipant,
  SquadView,
} from '@ulti-project/shared';
import { createSignal } from 'solid-js';
import { type ApiInit, api } from '../api/client';
import { refetchOnRefusal, useShell } from '../shell/shell-context';
import type { EventStream } from './event-stream';
import { createPendingKeys } from './pending-keys';

export interface ClaimNotice {
  readonly message: string;
}

export interface Claims {
  readonly pending: (participantId: string) => boolean;
  readonly claim: (participant: BoardParticipant) => void;
  readonly release: (participant: BoardParticipant) => void;
  readonly notice: () => ClaimNotice | undefined;
  readonly dismiss: () => void;
}

/** Claims and releases for `me`'s squad: applied at once, confirmed or rolled back by the API. */
export function createClaims(
  eventId: string,
  stream: EventStream,
  me: { readonly discordId: string; readonly squad: SquadView },
  squadName: (squadId: string) => string,
): Claims {
  const { refetchMe } = useShell();
  const { pending, setPending } = createPendingKeys();
  const [notice, setNotice] = createSignal<ClaimNotice>();

  function claim(p: BoardParticipant): void {
    void change(p, {
      optimistic: {
        squadId: me.squad.id,
        claimedBy: me.discordId,
        claimedAt: new Date().toISOString(),
      },
      init: { method: 'POST', json: {} },
      done: `Claimed ${p.character} for ${me.squad.name}`,
    });
  }

  function release(p: BoardParticipant): void {
    void change(p, {
      optimistic: null,
      init: { method: 'DELETE' },
      done: `Released ${p.character}`,
    });
  }

  /** Shows `plan.optimistic` at once, then confirms it or rolls it back by the API's answer. */
  async function change(
    p: BoardParticipant,
    plan: {
      readonly optimistic: BoardParticipant['claim'];
      readonly init: ApiInit;
      readonly done: string;
    },
  ): Promise<void> {
    const { id, character } = p;
    const before = p.claim;
    stream.putParticipant({ ...p, claim: plan.optimistic });
    setPending(id, true);
    const result = await api<BoardParticipant>(
      `/api/events/${eventId}/participants/${encodeURIComponent(id)}/claim`,
      plan.init,
    );
    setPending(id, false);

    if (result.ok) {
      stream.putParticipant(result.body);
      setNotice({ message: plan.done });
      return;
    }

    const { body } = result;
    if (body.reason === 'claimed') {
      stream.putParticipant({ ...p, claim: body.claim });
      setNotice({
        message: `Already claimed by ${squadName(body.claim.squadId)}`,
      });
      return;
    }
    rollBack(id, plan.optimistic, before);
    if (refetchOnRefusal(result, refetchMe)) return;
    setNotice({ message: refusalMessage(body.reason, character) });
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
    pending,
    claim,
    release,
    notice: () => notice(),
    dismiss: () => setNotice(undefined),
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
    case 'rate-limited':
      return 'Too many requests. Try again in a minute.';
    default:
      return "Couldn't reach the board. Try again.";
  }
}
