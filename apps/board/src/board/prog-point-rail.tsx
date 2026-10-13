import { Index } from 'solid-js';
import type { ProgPointItem } from './roster';

/** The encounter's prog points, one tab each with its sign-up count; arrow keys move (with wrap-around), focus and select. Every tab controls the one party panel. */
export function ProgPointRail(props: {
  readonly items: readonly ProgPointItem[];
  readonly selected: number;
  readonly onSelect: (order: number) => void;
}) {
  function move(from: number, step: number): void {
    const count = props.items.length;
    const item = props.items[(from + step + count) % count];
    if (item === undefined) return;
    props.onSelect(item.order);
    document.getElementById(`pp-tab-${item.order}`)?.focus();
  }

  return (
    <div
      class="pp-rail"
      role="tablist"
      aria-label="Prog points"
      aria-orientation="vertical"
    >
      {/* Index keeps each tab's button across live updates (fresh item objects), so keyboard focus stays put. */}
      <Index each={props.items}>
        {(item, index) => (
          <button
            type="button"
            role="tab"
            id={`pp-tab-${item().order}`}
            class="pp-tab"
            classList={{ 'is-active': item().order === props.selected }}
            aria-selected={item().order === props.selected}
            aria-controls="prog-point-panel"
            aria-label={`${item().label}, ${item().rows.length} signed up`}
            tabIndex={item().order === props.selected ? 0 : -1}
            onClick={() => props.onSelect(item().order)}
            onKeyDown={(event) => {
              // Up/Down on the desktop column, Left/Right on the phone's chip row
              if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
                event.preventDefault();
                move(index, 1);
              }
              if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
                event.preventDefault();
                move(index, -1);
              }
            }}
          >
            <span class="pp-label" title={item().label}>
              {item().label}
            </span>
            <span class="pp-count">{item().rows.length}</span>
          </button>
        )}
      </Index>
    </div>
  );
}
