import type { GuildMember, Role } from 'discord.js';
import type {
  BaseRoleResult,
  ProcessingContext,
  RoleRemovalPlan,
} from './clean-roles.interfaces.js';

/** Why Role.editable is false, for the bot's reports. */
export const UNREMOVABLE_REASON =
  "it's managed, above the bot's highest role, or the bot lacks Manage Roles";

/**
 * Splits each role's holders by whether they have an active signup. A role
 * the bot may not edit is never requested, since Discord would refuse the
 * member's whole request (see UNREMOVABLE_REASON).
 */
export function planRoleRemovals(
  roles: Role[],
  activeSignupDiscordIds: Set<string>,
): RoleRemovalPlan[] {
  return roles.map((role) => {
    const { kept = [], stale = [] } = Object.groupBy(
      role.members.values(),
      (member) => (activeSignupDiscordIds.has(member.id) ? 'kept' : 'stale'),
    );
    return { role, kept, stale, removable: role.editable };
  });
}

const memberIds = (members: GuildMember[]) =>
  new Set(members.map(({ id }) => id));

export function summarizeProcessedRoles(
  { plans, activeSignups }: ProcessingContext,
  processedRoles: BaseRoleResult[],
) {
  return {
    totalRolesProcessed: processedRoles.length,
    totalMembersProcessed: processedRoles.reduce(
      (sum, result) => sum + result.membersProcessed,
      0,
    ),
    totalRolesRemoved: processedRoles.reduce(
      (sum, result) => sum + result.rolesRemoved,
      0,
    ),
    totalActiveSignups: activeSignups.length,
    uniqueMembersWithRoles: memberIds(
      plans.flatMap(({ kept, stale }) => [...kept, ...stale]),
    ).size,
    // members keep a role they have an active signup for, or the bot can't remove
    uniqueMembersAfterRemoval: memberIds(
      plans.flatMap(({ kept, stale, removable }) =>
        removable ? kept : [...kept, ...stale],
      ),
    ).size,
  };
}
