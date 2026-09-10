import { Injectable, Logger } from '@nestjs/common';
import type { GuildMember } from 'discord.js';

export interface ProgPointRoleChanges {
  roleToAdd?: string;
  rolesToRemove: string[];
}

interface ComputeChangesOptions {
  /**
   * When the current prog point maps to no role, remove every mapped
   * prog-point role the member still holds instead of leaving them alone.
   * The approval/edit event path passes this so a signup moved to an
   * unmapped prog point does not keep a stale phase role;
   * `/sync-prog-roles` leaves it off (its `skippedNoMapping` contract).
   */
  pruneUnmapped?: boolean;
}

interface ReconcileRoleOptions {
  /**
   * When there is no desired role, remove every held candidate role instead
   * of leaving the member as-is.
   */
  pruneWhenNoDesired?: boolean;
}

@Injectable()
class ProgPointRolesService {
  private readonly logger = new Logger(ProgPointRolesService.name);

  /**
   * The shared reconcile kernel: given a set of candidate roles and the one
   * the member should end up with (or none), return the add/remove delta.
   * Never removes the desired role (a role can be shared by several inputs),
   * never re-adds a role already held.
   */
  reconcileRole(
    member: GuildMember,
    candidateRoles: readonly (string | undefined)[],
    desiredRole: string | undefined,
    { pruneWhenNoDesired = false }: ReconcileRoleOptions = {},
  ): ProgPointRoleChanges {
    const candidates = [...new Set(candidateRoles)].filter(
      (role): role is string => role !== undefined,
    );

    if (!desiredRole) {
      return {
        rolesToRemove: pruneWhenNoDesired
          ? candidates.filter((role) => member.roles.cache.has(role))
          : [],
      };
    }

    return {
      roleToAdd: member.roles.cache.has(desiredRole) ? undefined : desiredRole,
      rolesToRemove: candidates.filter(
        (role) => role !== desiredRole && member.roles.cache.has(role),
      ),
    };
  }

  /**
   * Prog-point-role decision logic shared by signup approval and
   * /sync-prog-roles. Missing mapping or missing prog point → no changes. An
   * unmapped prog point is left untouched by default; pass `pruneUnmapped` to
   * instead strip the member's stale mapped roles for the encounter.
   */
  computeChanges(
    member: GuildMember,
    mapping: Record<string, string> | undefined,
    progPoint: string | undefined,
    { pruneUnmapped = false }: ComputeChangesOptions = {},
  ): ProgPointRoleChanges {
    if (!mapping || !progPoint) {
      return { rolesToRemove: [] };
    }

    return this.reconcileRole(
      member,
      Object.values(mapping),
      mapping[progPoint],
      {
        pruneWhenNoDesired: pruneUnmapped,
      },
    );
  }

  async applyChanges(
    member: GuildMember,
    { roleToAdd, rolesToRemove }: ProgPointRoleChanges,
  ): Promise<void> {
    if (rolesToRemove.length > 0) {
      await member.roles.remove(rolesToRemove);
      this.logger.log(
        `Removed roles ${rolesToRemove.join(', ')} from ${member.user.username}`,
      );
    }

    if (roleToAdd) {
      await member.roles.add(roleToAdd);
      this.logger.log(`Assigned role ${roleToAdd} to ${member.user.username}`);
    }
  }
}

export { ProgPointRolesService };
