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
import { PARTY_ROLE_NAME } from '@ulti-project/shared/jobs';
import {
  createComputed,
  createSignal,
  For,
  Match,
  Show,
  Switch,
  untrack,
} from 'solid-js';
import type { Claims } from './claims';
import {
  compareRows,
  groupBySquad,
  matchesFilter,
  type ProgPointItem,
  roleCounts,
  type SquadFilter,
} from './roster';

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
});
const column = createColumnHelper<typeof features, BoardParticipant>();
// Only the columns the table sorts and filters by; the cells render from the row itself.
const columns = column.columns([
  column.accessor((row) => row.id, {
    id: 'order',
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
  look: `${row.character}\n${row.job ?? row.role}\n${row.phase.label}`,
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
  return (
    <For each={props.rows}>
      {(row) => {
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
              'is-fresh': fresh() === 'row',
              'is-fresh-claim': fresh() === 'claim',
            }}
            onAnimationEnd={() => setFresh(undefined)}
          >
            <td>
              <span class="p-player">
                <span class="dot" aria-hidden="true" />
                <span class="nm" title={row.displayName}>
                  {row.character}
                </span>{' '}
                <span class="job">{row.job ?? PARTY_ROLE_NAME[row.role]}</span>
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

/** The selected prog point of an encounter: header, then its sorted, filtered players. It is the prog-point rail's tab panel. */
export function PartyTable(props: {
  readonly event: BoardEvent;
  readonly encounter: EncounterInfo;
  readonly item: ProgPointItem;
  readonly filter: SquadFilter;
  readonly grouped: boolean;
  /** Who may claim; undefined shows tokens only. */
  readonly claiming: Claiming | undefined;
}) {
  // Seeded with the rows already there, so opening a point animates nothing.
  const seen: Seen = new Map(
    untrack(() => props.item.rows).map((row) => [row.id, drawn(row)]),
  );
  const table = createTable({
    features,
    columns,
    get data() {
      return props.item.rows;
    },
    initialState: { sorting: [{ id: 'order', desc: false }] },
    get state() {
      return { columnFilters: [{ id: 'squad', value: props.filter }] };
    },
  });
  const displayed = () => table.getRowModel().rows.map((row) => row.original);
  const roles = () => roleCounts(props.item.rows);

  return (
    <section
      class="subtable"
      role="tabpanel"
      id="prog-point-panel"
      aria-labelledby={`pp-tab-${props.item.order}`}
    >
      <header class="sub-head">
        <h3>{props.item.label}</h3>
        <span class="count">{props.item.rows.length}</span>
        <span class="count-claimed">· {props.item.unclaimed} unclaimed</span>
        <span class="role-mix">
          <span class="role-count" data-role="tank">
            Tanks {roles().tank}
          </span>{' '}
          <span class="role-count" data-role="healer">
            Healers {roles().healer}
          </span>{' '}
          <span class="role-count" data-role="dps">
            DPS {roles().dps}
          </span>
        </span>
      </header>
      <div class="grid-wrap">
        <table class="grid">
          <caption class="sr-only">
            {props.encounter.name} {props.item.label}
          </caption>
          <thead>
            <tr>
              <th scope="col">Player</th>
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
                      <th scope="colgroup" colSpan={2}>
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
    </section>
  );
}
