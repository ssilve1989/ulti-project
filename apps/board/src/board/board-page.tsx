import { A, useParams, useSearchParams } from '@solidjs/router';
import type { BoardEvent, Encounter } from '@ulti-project/shared';
import {
  createEffect,
  createSignal,
  Match,
  onCleanup,
  Show,
  Switch,
} from 'solid-js';
import { formatStart } from '../format';
import { useShell } from '../shell/shell-context';
import { readChoice, storeChoice } from '../stored-choice';
import './board.css';
import { EncounterTabs } from './encounter-tabs';
import { createEventStream } from './event-stream';
import { PartyTable } from './party-table';
import type { SquadFilter } from './roster';
import { type ClaimStyle, type Grouping, Toolbar } from './toolbar';

function Board(props: { readonly event: BoardEvent }) {
  const [searchParams, setSearchParams] = useSearchParams<{ enc: string }>();
  const [filter, setFilter] = createSignal<SquadFilter>({ kind: 'all' });
  const [claimStyle, setClaimStyle] = createSignal<ClaimStyle>(
    readChoice('board-indicator', ['rich', 'min']) ?? 'rich',
  );
  const [grouping, setGrouping] = createSignal<Grouping>(
    readChoice('board-grouping', ['none', 'squad']) ?? 'none',
  );
  // A missing or unknown `?enc=` (or one a fresh snapshot removed) falls back to the first.
  const selected = () =>
    props.event.encounters.find((e) => e.id === searchParams.enc) ??
    props.event.encounters[0];
  const select = (encounter: Encounter) =>
    setSearchParams({ enc: encounter }, { replace: true });

  return (
    <main class="board" data-claim-style={claimStyle()}>
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
        onFilter={setFilter}
        claimStyle={claimStyle()}
        onClaimStyle={(style) => {
          setClaimStyle(style);
          storeChoice('board-indicator', style);
        }}
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
              onSelect={select}
            />
            <section
              class="enc-panel"
              role="tabpanel"
              id={`panel-${encounter().id}`}
              aria-labelledby={`tab-${encounter().id}`}
            >
              <div class="enc-head">
                <h2>{encounter().name}</h2>
                <span class="signed">
                  {
                    props.event.participants.filter(
                      (row) => row.encounter === encounter().id,
                    ).length
                  }{' '}
                  signed up
                </span>
              </div>
              <div class="sub-grid">
                <PartyTable
                  event={props.event}
                  encounter={encounter()}
                  bucket="prog"
                  filter={filter()}
                  grouped={grouping() === 'squad'}
                />
                <PartyTable
                  event={props.event}
                  encounter={encounter()}
                  bucket="clear"
                  filter={filter()}
                  grouped={grouping() === 'squad'}
                />
              </div>
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
  const { refetchMe, setLiveStatus } = useShell();
  const stream = createEventStream(params.id);
  const event = () => {
    const state = stream.state();
    return state.kind === 'live' || state.kind === 'reconnecting'
      ? state.event
      : undefined;
  };

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
      <Match when={event()}>{(live) => <Board event={live()} />}</Match>
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
    </Switch>
  );
}
