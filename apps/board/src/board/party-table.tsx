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
import { createMemo, For, Show } from 'solid-js';
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

function Rows(props: {
  readonly rows: readonly BoardParticipant[];
  readonly squads: readonly SquadView[];
}) {
  const marks = createMemo(() => rowMarks(props.rows));
  return (
    <For each={props.rows}>
      {(row, index) => {
        const squad = () =>
          props.squads.find((squad) => squad.id === row.claim?.squadId);
        return (
          <tr
            data-role={row.jobRole}
            classList={{
              'is-phase-start': marks()[index()]?.phaseStart,
              'is-claimed': squad() !== undefined,
            }}
            style={{ '--sq': squad()?.color }}
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
                <Show when={squad()}>
                  {(claimer) => <SquadToken squad={claimer()} />}
                </Show>
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
}) {
  const title = () => (props.bucket === 'prog' ? 'Prog Party' : 'Clear Party');
  const threshold = () =>
    props.bucket === 'prog'
      ? props.encounter.progPartyThreshold
      : props.encounter.clearPartyThreshold;
  const party = createMemo(() =>
    partyOf(props.event.participants, props.encounter.id, props.bucket),
  );
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
                  <Rows rows={displayed()} squads={props.event.squads} />
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
                      <Rows rows={section.rows} squads={props.event.squads} />
                    </>
                  )}
                </For>
              </Show>
            </tbody>
          </table>
        </div>
      </Show>
    </section>
  );
}
