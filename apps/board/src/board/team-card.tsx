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

/** One of your squad's teams: a picker per slot, Copy message and Remove team. */
export function TeamCard(props: {
  readonly team: RosterTeam;
  readonly number: number;
  readonly squad: SquadView;
  readonly startsAt: string;
  readonly roster: BoardRoster;
  readonly claimed: readonly BoardParticipant[];
  readonly helpers: readonly SquadHelper[];
  readonly characterOf: (participantId: string) => string | undefined;
  readonly actions: RosterActions;
}) {
  const heading = () => `${props.squad.name} · Team ${props.number}`;
  const isEmpty = () => Object.keys(props.team.slots).length === 0;
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

  return (
    <article
      class="team"
      aria-labelledby={`team-${props.team.id}`}
      style={{ '--sq': props.squad.color }}
    >
      <header class="team-head">
        <h4 id={`team-${props.team.id}`}>{heading()}</h4>
        <span class="team-count">{Object.keys(props.team.slots).length}/8</span>
      </header>
      <ul class="slots">
        <For each={ROSTER_SLOTS}>
          {({ slot, label }) => {
            const fill = () => props.team.slots[slot];
            const busy = () =>
              props.actions.pending(`${props.team.id}:${slot}`);
            // A placed helper who has since left the role still shows as the picker's value.
            const helpers = () => {
              const current = fill();
              return current?.kind === 'helper' &&
                !props.helpers.some((h) => h.discordId === current.discordId)
                ? [...props.helpers, current]
                : props.helpers;
            };
            const options = createMemo(() =>
              slotOptions(slot, props.claimed, helpers(), props.roster),
            );
            const labelOf = (value: string) =>
              GROUPS.flatMap(({ key }) => options()[key]).find(
                (option) => option.value === value,
              )?.label;
            const name = () => {
              const current = fill();
              if (current === undefined) return undefined;
              return current.kind === 'helper'
                ? current.displayName
                : (props.characterOf(current.participantId) ??
                    'Unknown player');
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
                <span class="slot-hint" aria-hidden="true">
                  {busy() ? 'Saving…' : '▾'}
                </span>
                <select
                  class="slot-pick"
                  aria-label={`${label} for Team ${props.number}`}
                  value={pickerValue(fill())}
                  // aria-disabled, not disabled: disabling the focused picker would drop focus to the page.
                  aria-disabled={busy()}
                  onChange={(event) => {
                    const select = event.currentTarget;
                    if (busy()) {
                      select.value = pickerValue(fill());
                      return;
                    }
                    props.actions.fill(
                      props.roster.encounter,
                      props.team.id,
                      slot,
                      choiceOf(select.value, helpers()),
                    );
                    // No optimistic update: the picker shows what's saved until the answer.
                    select.value = pickerValue(fill());
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
                              {(value) => (
                                <option value={value}>{labelOf(value)}</option>
                              )}
                            </For>
                          </optgroup>
                        </Show>
                      );
                    }}
                  </For>
                  <option value="">Empty</option>
                </select>
              </li>
            );
          }}
        </For>
      </ul>
      <Show when={props.actions.error(props.team.id)}>
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
        <button
          type="button"
          class="team-remove"
          disabled={!isEmpty() || props.actions.pending(props.team.id)}
          title={
            isEmpty() ? undefined : 'Empty every slot to remove this team.'
          }
          onClick={() =>
            props.actions.removeTeam(props.roster.encounter, props.team.id)
          }
        >
          Remove team
        </button>
      </footer>
    </article>
  );
}
