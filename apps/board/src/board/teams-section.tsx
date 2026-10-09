import type {
  BoardEvent,
  BoardRoster,
  Encounter,
  SquadHelper,
  SquadView,
} from '@ulti-project/shared';
import { Index, Show } from 'solid-js';
import './teams.css';
import type { RosterActions } from './rosters';
import { TeamCard } from './team-card';

const TEAM_LIMIT = 6;

/** The Teams section under an encounter's parties: your squad's teams, editable. */
export function TeamsSection(props: {
  readonly event: BoardEvent;
  readonly encounter: Encounter;
  readonly squad: SquadView;
  readonly helpers: readonly SquadHelper[];
  readonly actions: RosterActions;
}) {
  const roster = (): BoardRoster =>
    props.event.rosters.find(
      (row) =>
        row.encounter === props.encounter && row.squadId === props.squad.id,
    ) ?? { encounter: props.encounter, squadId: props.squad.id, teams: [] };
  const claimed = () =>
    props.event.participants.filter(
      (row) =>
        row.encounter === props.encounter &&
        row.claim?.squadId === props.squad.id,
    );
  const characterOf = (participantId: string) =>
    props.event.participants.find((row) => row.id === participantId)?.character;

  return (
    <section class="teams" aria-labelledby="teams-title">
      <h3 id="teams-title">Teams</h3>
      <div class="team-grid">
        {/* By position, so a saved change updates cards in place and the focused picker stays. */}
        <Index each={roster().teams}>
          {(team, index) => (
            <TeamCard
              team={team()}
              number={index + 1}
              squad={props.squad}
              startsAt={props.event.startsAt}
              roster={roster()}
              claimed={claimed()}
              helpers={props.helpers}
              characterOf={characterOf}
              actions={props.actions}
            />
          )}
        </Index>
        <Show when={roster().teams.length < TEAM_LIMIT}>
          <div class="team-add">
            <button
              type="button"
              disabled={props.actions.pending('add')}
              onClick={() => props.actions.addTeam(props.encounter)}
            >
              Add team
            </button>
            <Show when={props.actions.error('add')}>
              {(message) => (
                <p class="team-error" role="alert">
                  {message()}
                </p>
              )}
            </Show>
          </div>
        </Show>
      </div>
    </section>
  );
}
