import type { SquadView } from '@ulti-project/shared';
import { For } from 'solid-js';
import type { SquadFilter } from './roster';

export type ClaimStyle = 'rich' | 'min';
export type Grouping = 'none' | 'squad';

function Segmented<T extends string>(props: {
  readonly label: string;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly value: T;
  readonly onChange: (value: T) => void;
}) {
  return (
    <fieldset class="seg-field">
      <legend class="lbl">{props.label}</legend>
      <div class="seg">
        <For each={props.options}>
          {(option) => (
            <button
              type="button"
              class="seg-btn"
              classList={{ 'is-on': option.value === props.value }}
              aria-pressed={option.value === props.value}
              onClick={() => props.onChange(option.value)}
            >
              {option.label}
            </button>
          )}
        </For>
      </div>
    </fieldset>
  );
}

function toFilter(value: string): SquadFilter {
  if (value === 'all' || value === 'unclaimed') return { kind: value };
  return { kind: 'squad', squadId: value };
}

/** Show filter (not stored), claim indicator and grouping. */
export function Toolbar(props: {
  readonly squads: readonly SquadView[];
  readonly filter: SquadFilter;
  readonly onFilter: (filter: SquadFilter) => void;
  readonly claimStyle: ClaimStyle;
  readonly onClaimStyle: (style: ClaimStyle) => void;
  readonly grouping: Grouping;
  readonly onGrouping: (grouping: Grouping) => void;
}) {
  return (
    <div class="board-tools">
      <label class="lbl" for="board-show">
        Show
      </label>
      <select
        id="board-show"
        class="sel"
        onChange={(event) =>
          props.onFilter(toFilter(event.currentTarget.value))
        }
      >
        {/* Selected per option, so an option a fresh snapshot recreates stays selected. */}
        <option value="all" selected={props.filter.kind === 'all'}>
          All players
        </option>
        <For each={props.squads}>
          {(squad) => (
            <option
              value={squad.id}
              selected={
                props.filter.kind === 'squad' &&
                props.filter.squadId === squad.id
              }
            >
              {squad.name} only
            </option>
          )}
        </For>
        <option value="unclaimed" selected={props.filter.kind === 'unclaimed'}>
          Unclaimed only
        </option>
      </select>
      <Segmented
        label="Indicator"
        options={[
          { value: 'rich', label: 'Bar + tint' },
          { value: 'min', label: 'Token only' },
        ]}
        value={props.claimStyle}
        onChange={props.onClaimStyle}
      />
      <Segmented
        label="Group"
        options={[
          { value: 'none', label: 'None' },
          { value: 'squad', label: 'By squad' },
        ]}
        value={props.grouping}
        onChange={props.onGrouping}
      />
    </div>
  );
}
