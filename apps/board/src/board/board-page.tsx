import { A, useParams, useSearchParams } from '@solidjs/router';
import type { BoardEvent, Encounter, SquadHelper } from '@ulti-project/shared';
import {
  createEffect,
  createMemo,
  createSignal,
  Match,
  onCleanup,
  Show,
  Switch,
} from 'solid-js';
import { api } from '../api/client';
import { formatStart } from '../format';
import { useShell } from '../shell/shell-context';
import { readChoice, storeChoice } from '../stored-choice';
import './board.css';
import { type Claims, createClaims } from './claims';
import { EncounterTabs } from './encounter-tabs';
import { createEventStream } from './event-stream';
import { PartyTable } from './party-table';
import { ProgPointRail } from './prog-point-rail';
import { defaultProgPoint, progPointsOf, type SquadFilter } from './roster';
import { createRosterActions, type RosterActions } from './rosters';
import { TeamsSection } from './teams-section';
import { type Grouping, Toolbar } from './toolbar';
import { UndoStrip } from './undo-strip';

function Board(props: {
  readonly event: BoardEvent;
  readonly claims: Claims | undefined;
  readonly rosters: RosterActions | undefined;
  readonly helpers: readonly SquadHelper[];
}) {
  const shell = useShell();
  const [searchParams, setSearchParams] = useSearchParams<{
    enc: string;
    pp: string;
  }>();
  const [chosenFilter, setFilter] = createSignal<SquadFilter>({ kind: 'all' });
  // A squad a fresh snapshot removed falls back to All players.
  const filter = (): SquadFilter => {
    const chosen = chosenFilter();
    return chosen.kind === 'squad' &&
      !props.event.squads.some((squad) => squad.id === chosen.squadId)
      ? { kind: 'all' }
      : chosen;
  };
  const [grouping, setGrouping] = createSignal<Grouping>(
    readChoice('board-grouping', ['none', 'squad']) ?? 'none',
  );
  // A missing or unknown `?enc=` (or one a fresh snapshot removed) falls back to the first.
  const selected = () =>
    props.event.encounters.find((e) => e.id === searchParams.enc) ??
    props.event.encounters[0];
  const signedUp = (encounter: Encounter) =>
    props.event.participants.filter((row) => row.encounter === encounter)
      .length;
  const select = (encounter: Encounter) =>
    setSearchParams({ enc: encounter, pp: undefined }, { replace: true });
  // Read live: a refused claim re-asks /api/me, which may take the squad away.
  const claiming = () => {
    const { access } = shell.me;
    return props.claims &&
      access.kind === 'squad' &&
      props.event.status !== 'closed'
      ? { claims: props.claims, squad: access.squad }
      : undefined;
  };
  const ownSquad = () => {
    const { access } = shell.me;
    return access.kind === 'squad' ? access.squad : undefined;
  };

  return (
    <main class="board">
      <div class="board-head">
        <h1>{props.event.title}</h1>
        <time datetime={props.event.startsAt}>
          {formatStart(props.event.startsAt)}
        </time>
        <Show when={props.event.status === 'signups-closed'}>
          <span class="status-badge">Sign-ups closed</span>
        </Show>
        <Show when={props.event.status === 'closed'}>
          <span class="status-badge">Closed</span>
        </Show>
      </div>
      <Toolbar
        squads={props.event.squads}
        filter={filter()}
        onFilter={setFilter}
        grouping={grouping()}
        onGrouping={(choice) => {
          setGrouping(choice);
          storeChoice('board-grouping', choice);
        }}
      />
      <Show when={selected()}>
        {(encounter) => (
          <>
            <EncounterTabs
              encounters={props.event.encounters}
              selected={encounter().id}
              signedUp={signedUp}
              onSelect={select}
            />
            <section
              class="enc-panel"
              role="tabpanel"
              id="encounter-panel"
              aria-labelledby={`tab-${encounter().id}`}
            >
              <div class="enc-head">
                <h2>{encounter().name}</h2>
                <span class="signed">{signedUp(encounter().id)} signed up</span>
              </div>
              {/* Keyed by encounter: a tab switch draws a fresh board, so its rows don't animate as changes. */}
              <Show when={encounter().id} keyed>
                {(encounterId) => {
                  const points = createMemo(() =>
                    progPointsOf(props.event.participants, encounterId),
                  );
                  const point = () =>
                    points().find(
                      (item) => String(item.order) === searchParams.pp,
                    ) ?? defaultProgPoint(points());
                  // Pins the shown point in the URL, so claiming its last unclaimed player doesn't move the board to another point.
                  createEffect(() => {
                    const shown = point();
                    if (
                      shown !== undefined &&
                      String(shown.order) !== searchParams.pp
                    )
                      setSearchParams(
                        { pp: String(shown.order) },
                        { replace: true },
                      );
                  });
                  return (
                    <div class="enc-split">
                      <div class="enc-main">
                        <Show
                          when={point()}
                          fallback={
                            <div class="sub-empty">No players yet.</div>
                          }
                        >
                          {(shown) => (
                            <div class="party-layout">
                              <ProgPointRail
                                items={points()}
                                selected={shown().order}
                                onSelect={(order) =>
                                  setSearchParams(
                                    { pp: String(order) },
                                    { replace: true },
                                  )
                                }
                              />
                              {/* Keyed by point, as a string (order 0 is falsy): switching points draws a fresh table, so its rows don't animate as changes. */}
                              <Show when={String(shown().order)} keyed>
                                {(_order) => (
                                  <PartyTable
                                    event={props.event}
                                    encounter={encounter()}
                                    item={shown()}
                                    filter={filter()}
                                    grouped={grouping() === 'squad'}
                                    claiming={claiming()}
                                  />
                                )}
                              </Show>
                            </div>
                          )}
                        </Show>
                        <Show when={props.claims}>
                          {(claims) => (
                            <UndoStrip
                              notice={claims().notice()}
                              onDismiss={() => claims().dismiss()}
                            />
                          )}
                        </Show>
                      </div>
                      <TeamsSection
                        event={props.event}
                        encounter={encounterId}
                        squad={ownSquad()}
                        helpers={props.helpers}
                        // Same rule as claiming: a squad member on an event that isn't closed.
                        actions={claiming() ? props.rosters : undefined}
                      />
                    </div>
                  );
                }}
              </Show>
            </section>
          </>
        )}
      </Show>
    </main>
  );
}

/** `/events/:id`: the live board for one event. */
export function BoardPage() {
  const params = useParams<{ id: string }>();
  const { me, refetchMe, setLiveStatus } = useShell();
  // shortcut: the stream is bound to the first :id; key the page on params.id if boards ever link to each other.
  const stream = createEventStream(params.id);
  const event = () => {
    const state = stream.state();
    return state.kind === 'live' || state.kind === 'reconnecting'
      ? state.event
      : undefined;
  };
  // shortcut: claims exist only if the user was a squad member when the board opened; gaining a squad later needs a reload.
  const claims =
    me.access.kind === 'squad'
      ? createClaims(
          params.id,
          stream,
          { discordId: me.discordId, squad: me.access.squad },
          (squadId) =>
            event()?.squads.find((squad) => squad.id === squadId)?.name ??
            'another squad',
        )
      : undefined;

  const rosters =
    me.access.kind === 'squad'
      ? createRosterActions(params.id, stream)
      : undefined;
  // Fetched once per board; a failure leaves the Helpers group out.
  const [helpers, setHelpers] = createSignal<readonly SquadHelper[]>([]);
  if (me.access.kind === 'squad')
    void api<SquadHelper[]>('/api/squads/mine/helpers').then((result) => {
      if (result.ok) setHelpers(result.body);
    });

  createEffect(() => {
    const { kind } = stream.state();
    setLiveStatus(
      kind === 'live' || kind === 'reconnecting' ? kind : undefined,
    );
    // The shell then shows the sign-in or no-access screen in place of this page.
    if (kind === 'refused') refetchMe();
  });
  onCleanup(() => setLiveStatus(undefined));

  return (
    <Switch>
      <Match when={event()}>
        {(live) => (
          <Board
            event={live()}
            claims={claims}
            rosters={rosters}
            helpers={helpers()}
          />
        )}
      </Match>
      <Match when={stream.state().kind === 'connecting'}>
        <main class="screen">
          <p>Loading…</p>
        </main>
      </Match>
      <Match when={stream.state().kind === 'not-found'}>
        <main class="screen">
          <h1>This event doesn't exist or was removed</h1>
          <A href="/">Back to events</A>
        </main>
      </Match>
      {/* Shown while /api/me is asked again, and kept if it still lets the user in. */}
      <Match when={stream.state().kind === 'refused'}>
        <main class="screen">
          <h1>You can't view this board right now.</h1>
          <A href="/">Back to events</A>
        </main>
      </Match>
    </Switch>
  );
}
