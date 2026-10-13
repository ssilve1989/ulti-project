import type { RosterTeam } from '@ulti-project/shared';
import { ROSTER_SLOTS } from '@ulti-project/shared/rosters';

/** The Discord message a lead pastes for a team: start time, data center, then each slot's shortcode and mention. */
export function formatTeamMessage(startsAt: string, team: RosterTeam): string {
  const unix = Math.floor(Date.parse(startsAt) / 1000);
  return [
    `Starts at <t:${unix}:F>`,
    'Data Center: Aether',
    ...ROSTER_SLOTS.map(({ slot, shortcode }) => {
      const fill = team.slots[slot];
      return fill ? `${shortcode} <@${fill.discordId}>` : shortcode;
    }),
  ].join('\n');
}
