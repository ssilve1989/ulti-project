import type {
  BoardEvent,
  BoardRoster,
  Encounter,
  SquadHelper,
  SquadView,
} from '@ulti-project/shared';
import { For, Index, Show } from 'solid-js';
import './teams.css';
import type { RosterActions } from './rosters';
import { TeamCard, type TeamCardMode } from './team-card';

const TEAM_LIMIT = 6;

/**
 * The Teams section under an encounter's parties: your squad's teams first (editable with
 * `actions`, otherwise only copyable), then every other squad's, collapsed and read-only.
 */
export function TeamsSection(props: {
  readonly event: BoardEvent;
  readonly encounter: Encounter;
  readonly squad: SquadView | undefined;
  readonly helpers: readonly SquadHelper[];
  readonly actions: RosterActions | undefined;
}) {
  const rosterOf = (squadId: string): BoardRoster =>
    props.event.rosters.find(
      (row) => row.encounter === props.encounter && row.squadId === squadId,
    ) ?? { encounter: props.encounter, squadId, teams: [] };
  const own = () => (props.squad ? rosterOf(props.squad.id) : undefined);
  // Keyed by squad, so an update doesn't remount the cards and close an expanded one.
  const others = () =>
    props.event.squads.filter(
      (squad) =>
        squad.id !== props.squad?.id && rosterOf(squad.id).teams.length > 0,
    );
  const characterOf = (participantId: string) =>
    props.event.participants.find((row) => row.id === participantId)?.character;
  const ownMode = (squad: SquadView, roster: BoardRoster): TeamCardMode =>
    props.actions
      ? {
          kind: 'edit',
          roster,
          claimed: props.event.participants.filter(
            (row) =>
              row.encounter === props.encounter &&
              row.claim?.squadId === squad.id,
          ),
          helpers: props.helpers,
          actions: props.actions,
        }
      : { kind: 'copy' };

  return (
    <Show
      when={
        props.actions || (own()?.teams.length ?? 0) > 0 || others().length > 0
      }
    >
      <section class="teams" aria-labelledby="teams-title">
        <h3 id="teams-title">Teams</h3>
        <Show when={props.squad}>
          {(squad) => (
            <div class="team-grid">
              {/* By position, so a saved change updates cards in place and the focused picker stays. */}
              <Index each={rosterOf(squad().id).teams}>
                {(team, index) => (
                  <TeamCard
                    team={team()}
                    number={index + 1}
                    squad={squad()}
                    startsAt={props.event.startsAt}
                    characterOf={characterOf}
                    mode={ownMode(squad(), rosterOf(squad().id))}
                  />
                )}
              </Index>
              <Show
                when={
                  rosterOf(squad().id).teams.length < TEAM_LIMIT
                    ? props.actions
                    : undefined
                }
              >
                {(actions) => (
                  <div class="team-add">
                    <button
                      type="button"
                      disabled={actions().pending('add')}
                      onClick={() => actions().addTeam(props.encounter)}
                    >
                      Add team
                    </button>
                    <Show when={actions().error('add')}>
                      {(message) => (
                        <p class="team-error" role="alert">
                          {message()}
                        </p>
                      )}
                    </Show>
                  </div>
                )}
              </Show>
            </div>
          )}
        </Show>
        <Show when={others().length > 0}>
          <div class="team-grid team-others">
            <For each={others()}>
              {(squad) => (
                <Index each={rosterOf(squad.id).teams}>
                  {(team, index) => (
                    <TeamCard
                      team={team()}
                      number={index + 1}
                      squad={squad}
                      startsAt={props.event.startsAt}
                      characterOf={characterOf}
                      mode={{ kind: 'view' }}
                    />
                  )}
                </Index>
              )}
            </For>
          </div>
        </Show>
      </section>
    </Show>
  );
}
