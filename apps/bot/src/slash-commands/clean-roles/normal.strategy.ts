import type { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { GuildMember, Role } from 'discord.js';
import { from, lastValueFrom, mergeMap } from 'rxjs';
import type {
  NormalResult,
  NormalRoleResult,
  ProcessingContext,
  ProcessingStrategy,
} from './clean-roles.interfaces.js';
import { summarizeProcessedRoles } from './clean-roles.utils.js';

export class NormalStrategy implements ProcessingStrategy<NormalRoleResult> {
  constructor(private readonly logger: Logger) {}

  async processRole(
    role: Role,
    activeSignupDiscordIds: Set<string>,
  ): Promise<NormalRoleResult> {
    this.logger.log(
      `Processing role ${role.name} (${role.id}) with ${role.members.size} members`,
    );

    const roleResult: NormalRoleResult = {
      roleId: role.id,
      roleName: role.name,
      membersProcessed: role.members.size,
      rolesRemoved: 0,
      failedRemovals: 0,
      skippedActiveSignups: 0,
    };

    const memberProcessingTask$ = from(role.members.values()).pipe(
      mergeMap(
        (member: GuildMember) => {
          return this.processMember(
            member,
            role,
            activeSignupDiscordIds,
            roleResult,
          );
        },
        5, // Process max 5 members concurrently to avoid rate limits
      ),
    );

    await lastValueFrom(memberProcessingTask$, { defaultValue: undefined });
    return roleResult;
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

  private async processMember(
    member: GuildMember,
    role: Role,
    activeSignupDiscordIds: Set<string>,
    roleResult: NormalRoleResult,
  ): Promise<void> {
    const hasActiveSignup = activeSignupDiscordIds.has(member.id);
    if (hasActiveSignup) {
      roleResult.skippedActiveSignups++;
      return;
    }

    try {
      await member.roles.remove(
        role.id,
        'Cleaned by clean-roles command - no active signups',
      );
      roleResult.rolesRemoved++;
      this.logger.log(
        `Removed role ${role.name} from ${member.displayName} (${member.id}) - no active signups`,
      );
    } catch (error) {
      roleResult.failedRemovals++;
      this.logger.error(
        error,
        `Failed to process member ${member.displayName} (${member.id}) for role ${role.name}`,
      );
      Sentry.getCurrentScope().captureException(error);
    }
  }
}
