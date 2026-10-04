import type { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { GuildMember, Role } from 'discord.js';
import { from, lastValueFrom, mergeMap } from 'rxjs';
import type {
  NormalResult,
  NormalRoleResult,
  ProcessingContext,
  ProcessingStrategy,
  RoleRemovalPlan,
} from './clean-roles.interfaces.js';
import { summarizeProcessedRoles } from './clean-roles.utils.js';

interface PendingRemoval {
  role: Role;
  roleResult: NormalRoleResult;
}

interface MemberRemovals {
  member: GuildMember;
  removals: PendingRemoval[];
}

export class NormalStrategy implements ProcessingStrategy<NormalRoleResult> {
  constructor(private readonly logger: Logger) {}

  /**
   * Removes every role a member should lose in one request per member, so a
   * member holding several stale roles costs one REST call, not one per role.
   */
  async processRoles(plans: RoleRemovalPlan[]): Promise<NormalRoleResult[]> {
    const roleResults: NormalRoleResult[] = [];
    const removalsByMember = new Map<string, MemberRemovals>();

    for (const { role, kept, toRemove, unremovable } of plans) {
      this.logger.log(
        `Processing role ${role.name} (${role.id}) with ${role.members.size} members`,
      );

      const roleResult: NormalRoleResult = {
        roleId: role.id,
        roleName: role.name,
        membersProcessed: role.members.size,
        rolesRemoved: 0,
        failedRemovals: unremovable.length,
        skippedActiveSignups: kept.length,
      };
      roleResults.push(roleResult);

      if (unremovable.length > 0) {
        this.logger.warn(
          `Cannot remove role ${role.name} (${role.id}) from ${unremovable.length} member(s): it is managed, above the bot's highest role, or the bot lacks Manage Roles`,
        );
      }

      for (const member of toRemove) {
        const memberRemovals = removalsByMember.get(member.id) ?? {
          member,
          removals: [],
        };
        memberRemovals.removals.push({ role, roleResult });
        removalsByMember.set(member.id, memberRemovals);
      }
    }

    const removalTask$ = from(removalsByMember.values()).pipe(
      mergeMap(
        (memberRemovals) => this.removeRoles(memberRemovals),
        5, // Process max 5 members concurrently to avoid rate limits
      ),
    );

    await lastValueFrom(removalTask$, { defaultValue: undefined });
    return roleResults;
  }

  createResult(
    context: ProcessingContext,
    processedRoles: NormalRoleResult[],
  ): NormalResult {
    return {
      isDryRun: false,
      ...summarizeProcessedRoles(context, processedRoles),
      totalFailedRemovals: processedRoles.reduce(
        (sum, result) => sum + result.failedRemovals,
        0,
      ),
      processedRoles,
    };
  }

  private async removeRoles({
    member,
    removals,
  }: MemberRemovals): Promise<void> {
    const roleNames = removals.map(({ role }) => role.name).join(', ');

    try {
      await member.roles.remove(
        removals.map(({ role }) => role.id),
        'Cleaned by clean-roles command - no active signups',
      );
      for (const { roleResult } of removals) roleResult.rolesRemoved++;
      this.logger.log(
        `Removed roles ${roleNames} from ${member.displayName} (${member.id}) - no active signups`,
      );
    } catch (error) {
      for (const { roleResult } of removals) roleResult.failedRemovals++;
      this.logger.error(
        error,
        `Failed to remove roles ${roleNames} from member ${member.displayName} (${member.id})`,
      );
      Sentry.getCurrentScope().captureException(error);
    }
  }
}
