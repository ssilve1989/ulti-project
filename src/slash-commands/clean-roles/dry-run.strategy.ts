import type { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { GuildMember, Role } from 'discord.js';
import type {
  DryRunResult,
  DryRunRoleResult,
  ProcessingContext,
  ProcessingStrategy,
} from './clean-roles.interfaces.js';

export class DryRunStrategy implements ProcessingStrategy<DryRunRoleResult> {
  constructor(private readonly logger: Logger) {}

  processRole(
    role: Role,
    activeSignupDiscordIds: Set<string>,
  ): Promise<DryRunRoleResult> {
    this.logger.log(
      `Processing role ${role.name} (${role.id}) with ${role.members.size} members`,
    );

    const roleResult: DryRunRoleResult = {
      roleId: role.id,
      roleName: role.name,
      membersProcessed: role.members.size,
      rolesRemoved: 0,
      membersToRemove: [],
    };

    if (role.members.size === 0) {
      return Promise.resolve(roleResult);
    }

    for (const member of role.members.values()) {
      this.processMember(member, role, activeSignupDiscordIds, roleResult);
    }

    return Promise.resolve(roleResult);
  }

  createResult(
    context: ProcessingContext,
    processedRoles: DryRunRoleResult[],
  ): DryRunResult {
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
      isDryRun: true,
      totalRolesProcessed,
      totalMembersProcessed,
      totalRolesRemoved,
      totalActiveSignups: context.activeSignups.length,
      uniqueMembersWithRoles: context.allMembersWithRoles.size,
      uniqueMembersAfterRemoval: membersWhoWillKeepRoles.size,
      processedRoles,
    };
  }

  private processMember(
    member: GuildMember,
    role: Role,
    activeSignupDiscordIds: Set<string>,
    roleResult: DryRunRoleResult,
  ): void {
    const hasActiveSignup = activeSignupDiscordIds.has(member.id);
    if (hasActiveSignup) return;

    try {
      roleResult.membersToRemove.push({
        id: member.id,
        displayName: member.displayName,
        username: member.user.username,
      });
      roleResult.rolesRemoved++;
      this.logger.log(
        `[DRY-RUN] Would remove role ${role.name} from ${member.displayName} (${member.id}) - no active signups`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process member ${member.displayName} (${member.id}) for role ${role.name}:`,
        error,
      );
      Sentry.getCurrentScope().captureException(error);
    }
  }
}
