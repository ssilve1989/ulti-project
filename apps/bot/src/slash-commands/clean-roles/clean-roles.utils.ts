import type {
  BaseRoleResult,
  ProcessingContext,
} from './clean-roles.interfaces.js';

export function summarizeProcessedRoles(
  context: ProcessingContext,
  processedRoles: BaseRoleResult[],
) {
  let membersWhoWillKeepRoles = 0;
  for (const memberId of context.allMembersWithRoles) {
    if (context.activeSignupDiscordIds.has(memberId)) {
      membersWhoWillKeepRoles++;
    }
  }

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
    uniqueMembersAfterRemoval: membersWhoWillKeepRoles,
  };
}
