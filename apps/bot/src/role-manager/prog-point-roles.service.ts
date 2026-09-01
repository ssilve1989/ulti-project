import { Injectable, Logger } from '@nestjs/common';
import type { GuildMember } from 'discord.js';

export interface ProgPointRoleChanges {
  roleToAdd?: string;
  rolesToRemove: string[];
}

@Injectable()
class ProgPointRolesService {
  private readonly logger = new Logger(ProgPointRolesService.name);

  /**
   * Pure decision logic shared by signup approval and /sync-prog-roles.
   * Mirrors approval semantics exactly: unmapped prog point, missing
   * mapping, or missing prog point → no changes.
   */
  computeChanges(
    member: GuildMember,
    mapping: Record<string, string> | undefined,
    progPoint: string | undefined,
  ): ProgPointRoleChanges {
    if (!mapping || !progPoint) {
      return { rolesToRemove: [] };
    }

    const newRole = mapping[progPoint];

    if (!newRole) {
      // unmapped prog point: leave existing prog point roles untouched
      return { rolesToRemove: [] };
    }

    // a role can be shared by several prog points (one role per phase),
    // so never remove the role we are about to assign
    const rolesToRemove = [...new Set(Object.values(mapping))].filter(
      (roleId) => roleId !== newRole && member.roles.cache.has(roleId),
    );

    return {
      roleToAdd: member.roles.cache.has(newRole) ? undefined : newRole,
      rolesToRemove,
    };
  }

  async applyChanges(
    member: GuildMember,
    { roleToAdd, rolesToRemove }: ProgPointRoleChanges,
  ): Promise<void> {
    if (rolesToRemove.length > 0) {
      await member.roles.remove(rolesToRemove);
      this.logger.log(
        `Removed prog point roles ${rolesToRemove.join(', ')} from ${member.user.username}`,
      );
    }

    if (roleToAdd) {
      await member.roles.add(roleToAdd);
      this.logger.log(
        `Assigned prog point role ${roleToAdd} to ${member.user.username}`,
      );
    }
  }
}

export { ProgPointRolesService };
