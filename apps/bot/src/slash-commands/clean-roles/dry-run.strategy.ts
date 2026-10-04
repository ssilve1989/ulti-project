import type { Logger } from '@nestjs/common';
import type { GuildMember, Role } from 'discord.js';
import type {
  DryRunResult,
  DryRunRoleResult,
  ProcessingContext,
  ProcessingStrategy,
} from './clean-roles.interfaces.js';
import { summarizeProcessedRoles } from './clean-roles.utils.js';

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

    for (const member of role.members.values()) {
      this.processMember(member, role, activeSignupDiscordIds, roleResult);
    }

    return Promise.resolve(roleResult);
  }

  createResult(
    context: ProcessingContext,
    processedRoles: DryRunRoleResult[],
  ): DryRunResult {
    return {
      isDryRun: true,
      ...summarizeProcessedRoles(context, processedRoles),
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

    roleResult.membersToRemove.push({
      id: member.id,
      displayName: member.displayName,
      username: member.user.username,
    });
    roleResult.rolesRemoved++;
    this.logger.log(
      `[DRY-RUN] Would remove role ${role.name} from ${member.displayName} (${member.id}) - no active signups`,
    );
  }
}
