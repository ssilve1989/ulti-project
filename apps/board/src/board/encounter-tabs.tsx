import type { BoardEvent, Encounter } from '@ulti-project/shared';
import { For } from 'solid-js';

/** One tab per encounter, in event order, with its sign-up count; arrow keys move (with wrap-around), focus and select. Every tab controls the one panel, which shows the selected encounter. */
export function EncounterTabs(props: {
  readonly encounters: BoardEvent['encounters'];
  readonly selected: Encounter;
  readonly signedUp: (encounter: Encounter) => number;
  readonly onSelect: (encounter: Encounter) => void;
}) {
  function move(from: number, step: number): void {
    const count = props.encounters.length;
    const next = (from + step + count) % count;
    const encounter = props.encounters[next];
    if (encounter === undefined) return;
    props.onSelect(encounter.id);
    document.getElementById(`tab-${encounter.id}`)?.focus();
  }

  return (
    <div class="tabs" role="tablist" aria-label="Encounters">
      <For each={props.encounters}>
        {(encounter, index) => (
          <button
            type="button"
            role="tab"
            id={`tab-${encounter.id}`}
            class="tab"
            classList={{ 'is-active': encounter.id === props.selected }}
            aria-selected={encounter.id === props.selected}
            aria-controls="encounter-panel"
            aria-label={`${encounter.id}, ${props.signedUp(encounter.id)} signed up`}
            tabIndex={encounter.id === props.selected ? 0 : -1}
            onClick={() => props.onSelect(encounter.id)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') move(index(), 1);
              if (event.key === 'ArrowLeft') move(index(), -1);
            }}
          >
            <span class="tab-crystal" aria-hidden="true" />
            {encounter.id}
            <span class="tab-count">{props.signedUp(encounter.id)}</span>
          </button>
        )}
      </For>
    </div>
  );
}
