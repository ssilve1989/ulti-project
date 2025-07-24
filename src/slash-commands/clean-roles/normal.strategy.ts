import type { Logger } from '@nestjs/common';
import type { GuildMember, Role } from 'discord.js';
import { from, lastValueFrom, mergeMap } from 'rxjs';
import { sentryReport } from '../../sentry/sentry.consts.js';
import type {
  NormalResult,
  NormalRoleResult,
  ProcessingContext,
  ProcessingStrategy,
} from './clean-roles.interfaces.js';

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
    };

    if (role.members.size === 0) {
      return roleResult;
    }

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
    const totalRolesProcessed = processedRoles.length;
    const totalMembersProcessed = processedRoles.reduce(
      (sum, result) => sum + result.membersProcessed,
      0,
    );
    const totalRolesRemoved = processedRoles.reduce(
      (sum, result) => sum + result.rolesRemoved,
      0,
    );

    const membersWhoWillKeepRoles = new Set<string>();
    for (const memberId of context.allMembersWithRoles) {
      if (context.activeSignupDiscordIds.has(memberId)) {
        membersWhoWillKeepRoles.add(memberId);
      }
    }

    return {
      isDryRun: false,
      totalRolesProcessed,
      totalMembersProcessed,
      totalRolesRemoved,
      totalActiveSignups: context.activeSignups.length,
      uniqueMembersWithRoles: context.allMembersWithRoles.size,
      uniqueMembersAfterRemoval: membersWhoWillKeepRoles.size,
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
    if (hasActiveSignup) return;

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
      this.logger.error(
        `Failed to process member ${member.displayName} (${member.id}) for role ${role.name}:`,
        error,
      );
      sentryReport(error);
    }
  }
}
