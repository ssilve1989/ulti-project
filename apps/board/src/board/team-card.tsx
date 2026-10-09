import type {
  BoardParticipant,
  BoardRoster,
  RosterSlot,
  RosterTeam,
  SlotFill,
  SquadHelper,
  SquadView,
} from '@ulti-project/shared';
import { ROSTER_SLOTS } from '@ulti-project/shared/rosters';
import { createMemo, createSignal, For, onCleanup, Show } from 'solid-js';
import { type RosterActions, type SlotChoice, slotOptions } from './rosters';
import { formatTeamMessage } from './team-message';

const roleOf = (slot: RosterSlot) =>
  slot.startsWith('tank') ? 'tank' : slot.endsWith('healer') ? 'healer' : 'dps';

const pickerValue = (fill: SlotFill | undefined) =>
  fill === undefined
    ? ''
    : fill.kind === 'progger'
      ? `progger:${fill.participantId}`
      : `helper:${fill.discordId}`;

const GROUPS: readonly {
  label: string;
  key: keyof ReturnType<typeof slotOptions>;
}[] = Object.freeze([
  { label: 'Suggested', key: 'suggested' },
  { label: 'Other claimed proggers', key: 'otherProggers' },
  { label: 'Helpers', key: 'helpers' },
]);

/** A picker's value back as a choice; '' (Empty) is null. */
function choiceOf(
  value: string,
  helpers: readonly SquadHelper[],
): SlotChoice | null {
  if (value.startsWith('progger:'))
    return { kind: 'progger', participantId: value.slice('progger:'.length) };
  const helper = helpers.find((h) => `helper:${h.discordId}` === value);
  return helper ? { kind: 'helper', ...helper } : null;
}

/** Your squad's teams can be edited (pickers, Remove team) or, on a closed event, only copied. Other squads' are only viewed. */
export type TeamCardMode =
  | {
      readonly kind: 'edit';
      readonly roster: BoardRoster;
      readonly claimed: readonly BoardParticipant[];
      readonly helpers: readonly SquadHelper[];
      readonly actions: RosterActions;
    }
  | { readonly kind: 'copy' }
  | { readonly kind: 'view' };

type Editing = Extract<TeamCardMode, { kind: 'edit' }>;

/** One team: its 8 slots, as pickers when editing; another squad's is a collapsed summary. */
export function TeamCard(props: {
  readonly team: RosterTeam;
  readonly number: number;
  readonly squad: SquadView;
  readonly startsAt: string;
  readonly characterOf: (participantId: string) => string | undefined;
  readonly mode: TeamCardMode;
}) {
  const heading = () => `${props.squad.name} · Team ${props.number}`;
  const filled = () => Object.keys(props.team.slots).length;
  const editing = () => (props.mode.kind === 'edit' ? props.mode : undefined);
  const [copied, setCopied] = createSignal<'copied' | 'failed'>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timer));

  const copy = () => {
    clearTimeout(timer);
    navigator.clipboard
      .writeText(formatTeamMessage(props.startsAt, props.team))
      .then(
        () => {
          setCopied('copied');
          timer = setTimeout(() => setCopied(undefined), 2000);
        },
        () => setCopied('failed'),
      );
  };

  const slots = () => (
    <ul class="slots">
      <For each={ROSTER_SLOTS}>
        {({ slot, label }) => {
          const fill = () => props.team.slots[slot];
          const busy = () =>
            editing()?.actions.pending(`${props.team.id}:${slot}`) ?? false;
          const name = () => {
            const current = fill();
            if (current === undefined) return undefined;
            return current.kind === 'helper'
              ? current.displayName
              : (props.characterOf(current.participantId) ?? 'Unknown player');
          };
          return (
            <li
              class="slot"
              data-role={roleOf(slot)}
              classList={{ 'is-busy': busy() }}
              aria-busy={busy()}
            >
              <span class="slot-label">{label}</span>
              <span class="slot-who">
                <Show
                  when={name()}
                  fallback={<span class="slot-name is-empty">—</span>}
                >
                  {(shown) => (
                    <>
                      <span class="slot-name">{shown()}</span>
                      <span class="slot-tag">{fill()?.kind}</span>
                    </>
                  )}
                </Show>
              </span>
              <Show when={editing()}>
                {(edit) => (
                  <SlotPicker
                    edit={edit()}
                    teamId={props.team.id}
                    number={props.number}
                    slot={slot}
                    label={label}
                    fill={fill()}
                    busy={busy()}
                  />
                )}
              </Show>
            </li>
          );
        }}
      </For>
    </ul>
  );

  return (
    <Show
      when={props.mode.kind !== 'view'}
      fallback={
        <details class="team team-other" style={{ '--sq': props.squad.color }}>
          <summary class="team-head">
            {heading()} · <span class="team-count">{filled()}/8</span>
          </summary>
          {slots()}
        </details>
      }
    >
      <article
        class="team"
        aria-labelledby={`team-${props.team.id}`}
        style={{ '--sq': props.squad.color }}
      >
        <header class="team-head">
          <h4 id={`team-${props.team.id}`}>{heading()}</h4>
          <span class="team-count">{filled()}/8</span>
        </header>
        {slots()}
        <Show when={editing()?.actions.error(props.team.id)}>
          {(message) => (
            <p class="team-error" role="alert">
              {message()}
            </p>
          )}
        </Show>
        <footer class="team-foot">
          <button type="button" class="primary" onClick={copy}>
            Copy message
          </button>
          <span class="team-copied" role="status">
            {copied() === 'copied'
              ? 'Copied'
              : copied() === 'failed'
                ? "Couldn't copy."
                : ''}
          </span>
          <Show when={editing()}>
            {(edit) => (
              <button
                type="button"
                class="team-remove"
                disabled={filled() > 0 || edit().actions.pending(props.team.id)}
                title={
                  filled() === 0
                    ? undefined
                    : 'Empty every slot to remove this team.'
                }
                onClick={() =>
                  edit().actions.removeTeam(
                    edit().roster.encounter,
                    props.team.id,
                  )
                }
              >
                Remove team
              </button>
            )}
          </Show>
        </footer>
      </article>
    </Show>
  );
}

const NAVIGATION_KEYS: ReadonlySet<string> = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

/** Chromium on Windows/Linux picks (and so saves) as you arrow or type through a closed select; open its list instead. */
function openInsteadOfPicking(
  event: KeyboardEvent & { currentTarget: HTMLSelectElement },
) {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const typing = event.key.length === 1 && event.key !== ' ';
  if (!typing && !NAVIGATION_KEYS.has(event.key)) return;
  event.preventDefault();
  const select = event.currentTarget;
  if (!('showPicker' in select)) return;
  try {
    select.showPicker();
  } catch {
    // Unsupported here, or not a user activation: the key just does nothing.
  }
}

/** A slot's native picker, laid transparently over its row. */
function SlotPicker(props: {
  readonly edit: Editing;
  readonly teamId: string;
  readonly number: number;
  readonly slot: RosterSlot;
  readonly label: string;
  readonly fill: SlotFill | undefined;
  readonly busy: boolean;
}) {
  // A placed helper who has since left the role still shows as the picker's value.
  const helpers = () => {
    const current = props.fill;
    return current?.kind === 'helper' &&
      !props.edit.helpers.some((h) => h.discordId === current.discordId)
      ? [...props.edit.helpers, current]
      : props.edit.helpers;
  };
  const options = createMemo(() =>
    slotOptions(props.slot, props.edit.claimed, helpers(), props.edit.roster),
  );
  // Tracks the options too: an option moving group is recreated, and the select loses its value.
  const selected = () => {
    options();
    return pickerValue(props.fill);
  };
  const labelOf = (value: string) =>
    GROUPS.flatMap(({ key }) => options()[key]).find(
      (option) => option.value === value,
    )?.label;
  return (
    <>
      <span class="slot-hint" aria-hidden="true">
        {props.busy ? 'Saving…' : '▾'}
      </span>
      <select
        class="slot-pick"
        aria-label={`${props.label} for Team ${props.number}`}
        value={selected()}
        // aria-disabled, not disabled: disabling the focused picker would drop focus to the page.
        aria-disabled={props.busy}
        onKeyDown={openInsteadOfPicking}
        onChange={(event) => {
          const select = event.currentTarget;
          if (props.busy) {
            select.value = pickerValue(props.fill);
            return;
          }
          props.edit.actions.fill(
            props.edit.roster.encounter,
            props.teamId,
            props.slot,
            choiceOf(select.value, helpers()),
          );
          // No optimistic update: the picker shows what's saved until the answer.
          select.value = pickerValue(props.fill);
        }}
      >
        {/* Options keyed by value: a live update relabels them in place, so the chosen one is never swapped out. */}
        <For each={GROUPS}>
          {(group) => {
            const values = () =>
              options()[group.key].map((option) => option.value);
            return (
              <Show when={values().length > 0}>
                <optgroup label={group.label}>
                  <For each={values()}>
                    {(value) => <option value={value}>{labelOf(value)}</option>}
                  </For>
                </optgroup>
              </Show>
            );
          }}
        </For>
        <option value="">Empty</option>
      </select>
    </>
  );
}
