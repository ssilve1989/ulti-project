import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  createTable,
  rowSortingFeature,
  tableFeatures,
} from '@tanstack/solid-table';
import type {
  BoardEvent,
  BoardParticipant,
  SquadView,
} from '@ulti-project/shared';
import {
  createComputed,
  createMemo,
  createSignal,
  For,
  Match,
  Show,
  Switch,
  untrack,
} from 'solid-js';
import type { Claims } from './claims';
import {
  type Bucket,
  claimedCount,
  compareRows,
  groupBySquad,
  matchesFilter,
  partyOf,
  rowMarks,
  type SquadFilter,
} from './roster';
import { UndoStrip } from './undo-strip';

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
});
const column = createColumnHelper<typeof features, BoardParticipant>();
// Only the columns the table sorts and filters by; the cells render from the row itself.
const columns = column.columns([
  column.accessor((row) => row.phase.order, {
    id: 'phase',
    sortFn: (a, b) => compareRows(a.original, b.original),
  }),
  column.accessor((row) => row.claim?.squadId, {
    id: 'squad',
    filterFn: (row, _id, filter: SquadFilter) =>
      matchesFilter(row.original, filter),
  }),
]);

type EncounterInfo = BoardEvent['encounters'][number];

/** What a row was last drawn with: its look, and the squad holding it. */
interface Drawn {
  readonly look: string;
  readonly squadId: string | undefined;
}
/** The rows of a party as last drawn, by id. */
type Seen = Map<string, Drawn>;

const drawn = (row: BoardParticipant): Drawn => ({
  look: `${row.character}\n${row.job}\n${row.phase.label}`,
  squadId: row.claim?.squadId,
});

/** Present when the user may claim on this board: their squad, and the claims to make with it. */
export interface Claiming {
  readonly claims: Claims;
  readonly squad: SquadView;
}

function SquadToken(props: { readonly squad: SquadView }) {
  return (
    <span
      class="tok"
      title={props.squad.name}
      style={{ '--sq': props.squad.color }}
    >
      {props.squad.tag}
    </span>
  );
}

/** The Squad cell: a claim or release control for the user's squad, otherwise the claimer's token. */
function SquadCell(props: {
  readonly row: BoardParticipant;
  readonly squad: SquadView | undefined;
  readonly claiming: Claiming | undefined;
}) {
  const pending = () => props.claiming?.claims.pending(props.row.id) ?? false;
  return (
    <Switch
      fallback={
        <Show when={props.squad}>
          {(claimer) => <SquadToken squad={claimer()} />}
        </Show>
      }
    >
      <Match when={props.row.claim === null && props.claiming}>
        {(claiming) => (
          <button
            type="button"
            class="claim-btn"
            aria-label={`Claim ${props.row.character} for ${claiming().squad.name}`}
            disabled={pending()}
            onClick={() => claiming().claims.claim(props.row)}
          >
            ＋
          </button>
        )}
      </Match>
      <Match
        when={
          props.row.claim?.squadId === props.claiming?.squad.id &&
          props.claiming
        }
      >
        {(claiming) => (
          <button
            type="button"
            class="tok is-mine"
            style={{ '--sq': claiming().squad.color }}
            aria-label={`Release ${props.row.character} from ${claiming().squad.name}`}
            disabled={pending()}
            onClick={() => claiming().claims.release(props.row)}
          >
            {claiming().squad.tag}
          </button>
        )}
      </Match>
    </Switch>
  );
}

function Rows(props: {
  readonly rows: readonly BoardParticipant[];
  readonly squads: readonly SquadView[];
  readonly claiming: Claiming | undefined;
  readonly seen: Seen;
}) {
  const marks = createMemo(() => rowMarks(props.rows));
  return (
    <For each={props.rows}>
      {(row, index) => {
        const squad = () =>
          props.squads.find((squad) => squad.id === row.claim?.squadId);
        // Compared with what the party last drew, so a remounted row (regrouped, refiltered) stays still.
        const [fresh, setFresh] = createSignal<'row' | 'claim'>();
        createComputed(() => {
          const now = drawn(row);
          const before = props.seen.get(row.id);
          props.seen.set(row.id, now);
          if (before?.look !== now.look) setFresh('row');
          else if (now.squadId !== undefined && now.squadId !== before?.squadId)
            setFresh('claim');
        });
        return (
          <tr
            data-role={row.jobRole}
            classList={{
              'is-phase-start': marks()[index()]?.phaseStart,
              'is-claimed': squad() !== undefined,
              'is-fresh': fresh() === 'row',
              'is-fresh-claim': fresh() === 'claim',
            }}
            style={{ '--sq': squad()?.color }}
            onAnimationEnd={() => setFresh(undefined)}
          >
            <td>
              <span class="p-player">
                <span class="dot" aria-hidden="true" />
                <span class="nm" title={row.displayName}>
                  {row.character}
                </span>{' '}
                <span class="job">{row.job}</span>
              </span>
            </td>
            <td>
              <span
                class="p-phase"
                classList={{ 'is-repeat': marks()[index()]?.repeat }}
              >
                {row.phase.label}
              </span>
            </td>
            <td>
              <span class="sq-cell">
                <SquadCell
                  row={row}
                  squad={squad()}
                  claiming={props.claiming}
                />
              </span>
            </td>
          </tr>
        );
      }}
    </For>
  );
}

/** One party (Prog or Clear) of an encounter: header, then its sorted, filtered rows. */
export function PartyTable(props: {
  readonly event: BoardEvent;
  readonly encounter: EncounterInfo;
  readonly bucket: Bucket;
  readonly filter: SquadFilter;
  readonly grouped: boolean;
  /** Who may claim; undefined shows tokens only. */
  readonly claiming: Claiming | undefined;
  /** Where this party's claim notices come from, even once the user can no longer claim. */
  readonly claims: Claims | undefined;
}) {
  const title = () => (props.bucket === 'prog' ? 'Prog Party' : 'Clear Party');
  const threshold = () =>
    props.bucket === 'prog'
      ? props.encounter.progPartyThreshold
      : props.encounter.clearPartyThreshold;
  const party = createMemo(() =>
    partyOf(props.event.participants, props.encounter.id, props.bucket),
  );
  // Seeded with the rows already there, so opening the board animates nothing.
  const seen: Seen = new Map(untrack(party).map((row) => [row.id, drawn(row)]));
  const table = createTable({
    features,
    columns,
    get data() {
      return party();
    },
    initialState: { sorting: [{ id: 'phase', desc: false }] },
    get state() {
      return { columnFilters: [{ id: 'squad', value: props.filter }] };
    },
  });
  const displayed = () => table.getRowModel().rows.map((row) => row.original);
  const headingId = () => `party-${props.encounter.id}-${props.bucket}`;

  return (
    <section class="subtable" aria-labelledby={headingId()}>
      <header
        class="sub-head"
        classList={{ 'sub-head--clear': props.bucket === 'clear' }}
      >
        <h3 id={headingId()}>{title()}</h3>
        <span class="count">{party().length}</span>
        <span class="count-claimed">· {claimedCount(party())} claimed</span>
        <Show when={threshold()}>
          {(from) => <span class="from">from {from()}</span>}
        </Show>
      </header>
      <Show
        when={party().length > 0}
        fallback={<div class="sub-empty">No players yet.</div>}
      >
        <div class="grid-wrap">
          <table class="grid">
            <caption class="sr-only">
              {props.encounter.name}{' '}
              {props.bucket === 'prog' ? 'Prog' : 'Clear'} party
            </caption>
            <thead>
              <tr>
                <th scope="col">Player</th>
                <th scope="col" class="col-point">
                  Phase
                </th>
                <th scope="col" class="col-squad">
                  Squad
                </th>
              </tr>
            </thead>
            <tbody>
              <Show
                when={props.grouped}
                fallback={
                  <Rows
                    rows={displayed()}
                    squads={props.event.squads}
                    claiming={props.claiming}
                    seen={seen}
                  />
                }
              >
                <For each={groupBySquad(displayed(), props.event.squads)}>
                  {(section) => (
                    <>
                      <tr class="squad-group">
                        <th scope="colgroup" colSpan={3}>
                          <Show when={section.squad}>
                            {(squad) => (
                              <span aria-hidden="true">
                                <SquadToken squad={squad()} />{' '}
                              </span>
                            )}
                          </Show>
                          {section.squad?.name ?? 'Unclaimed'} ·{' '}
                          {section.rows.length}
                        </th>
                      </tr>
                      <Rows
                        rows={section.rows}
                        squads={props.event.squads}
                        claiming={props.claiming}
                        seen={seen}
                      />
                    </>
                  )}
                </For>
              </Show>
            </tbody>
          </table>
        </div>
      </Show>
      <Show when={props.claims}>
        {(claims) => (
          <UndoStrip
            notice={claims().notice(props.bucket)}
            onDismiss={() => claims().dismiss(props.bucket)}
          />
        )}
      </Show>
    </section>
  );
}
