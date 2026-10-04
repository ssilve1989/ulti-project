import type { Role } from 'discord.js';
import type {
  BaseRoleResult,
  ProcessingContext,
  RoleRemovalPlan,
} from './clean-roles.interfaces.js';

/**
 * Splits each role's holders by what the clean-up does to them. A role the
 * bot may not edit (managed, above its highest role, or no Manage Roles) is
 * never requested, since Discord would refuse the member's whole request.
 */
export function planRoleRemovals(
  roles: Role[],
  activeSignupDiscordIds: Set<string>,
): RoleRemovalPlan[] {
  return roles.map((role) => {
    const {
      kept = [],
      toRemove = [],
      unremovable = [],
    } = Object.groupBy(role.members.values(), (member) => {
      if (activeSignupDiscordIds.has(member.id)) return 'kept';
      return role.editable ? 'toRemove' : 'unremovable';
    });
    return { role, kept, toRemove, unremovable };
  });
}

export function summarizeProcessedRoles(
  context: ProcessingContext,
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
    totalActiveSignups: context.activeSignups.length,
    uniqueMembersWithRoles: context.allMembersWithRoles.size,
    uniqueMembersAfterRemoval: context.membersKeepingRoles.size,
  };
}
