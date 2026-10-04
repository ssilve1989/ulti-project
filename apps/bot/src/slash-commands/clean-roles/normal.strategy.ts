import type { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { GuildMember } from 'discord.js';
import { from, lastValueFrom, mergeMap } from 'rxjs';
import type {
  NormalResult,
  NormalRoleResult,
  ProcessingContext,
  ProcessingStrategy,
  RoleRemovalPlan,
} from './clean-roles.interfaces.js';
import {
  summarizeProcessedRoles,
  UNREMOVABLE_REASON,
} from './clean-roles.utils.js';

interface MemberRemovals {
  member: GuildMember;
  roleResults: NormalRoleResult[];
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

    for (const { role, kept, stale, removable } of plans) {
      const membersProcessed = kept.length + stale.length;
      this.logger.log(
        `Processing role ${role.name} (${role.id}) with ${membersProcessed} members`,
      );

      const roleResult: NormalRoleResult = {
        roleId: role.id,
        roleName: role.name,
        membersProcessed,
        rolesRemoved: 0,
        failedRemovals: removable ? 0 : stale.length,
        skippedActiveSignups: kept.length,
      };
      roleResults.push(roleResult);

      if (!removable) {
        if (stale.length > 0) {
          this.logger.warn(
            `Cannot remove role ${role.name} (${role.id}) from ${stale.length} member(s): ${UNREMOVABLE_REASON}`,
          );
        }
        continue;
      }

      for (const member of stale) {
        const memberRemovals = removalsByMember.get(member.id) ?? {
          member,
          roleResults: [],
        };
        memberRemovals.roleResults.push(roleResult);
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
    roleResults,
  }: MemberRemovals): Promise<void> {
    const roleNames = roleResults.map(({ roleName }) => roleName).join(', ');

    try {
      await member.roles.remove(
        roleResults.map(({ roleId }) => roleId),
        'Cleaned by clean-roles command - no active signups',
      );
      for (const roleResult of roleResults) roleResult.rolesRemoved++;
      this.logger.log(
        `Removed roles ${roleNames} from ${member.displayName} (${member.id}) - no active signups`,
      );
    } catch (error) {
      for (const roleResult of roleResults) roleResult.failedRemovals++;
      this.logger.error(
        error,
        `Failed to remove roles ${roleNames} from member ${member.displayName} (${member.id})`,
      );
      Sentry.getCurrentScope().captureException(error);
    }
  }
}
