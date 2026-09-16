import { Injectable, Logger } from '@nestjs/common';
import { PartyStatus } from '@ulti-project/shared';
import type { GuildMember } from 'discord.js';

export interface ProgPointRoleChanges {
  roleToAdd?: string;
  rolesToRemove: string[];
}

/**
 * The single coarse encounter role a party status implies: the clear role for
 * Clear Party, the prog role otherwise. Shared so /edit-signup's preview and
 * the role reconciliation that follows it can't disagree.
 */
export function coarseRoleFor(
  partyStatus: PartyStatus,
  { progRole, clearRole }: { progRole?: string; clearRole?: string },
): string | undefined {
  return partyStatus === PartyStatus.ClearParty ? clearRole : progRole;
}

interface ComputeChangesOptions {
  /**
   * When the prog point has no mapped role, remove every mapped role the
   * member holds instead of leaving them untouched. Used when the previous
   * prog point is known to be wrong (/edit-signup).
   */
  pruneUnmapped?: boolean;
}

@Injectable()
class ProgPointRolesService {
  private readonly logger = new Logger(ProgPointRolesService.name);

  /**
   * Pure decision logic shared by signup approval, /sync-prog-roles and
   * /edit-signup. Without options it mirrors approval semantics exactly:
   * unmapped prog point, missing mapping, or missing prog point → no changes.
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

    const newRole = mapping[progPoint];

    if (!newRole) {
      // unmapped prog point: leave existing prog point roles untouched unless pruning
      return {
        rolesToRemove: pruneUnmapped
          ? this.heldMappedRoles(member, mapping)
          : [],
      };
    }

    // a role can be shared by several prog points (one role per phase),
    // so never remove the role we are about to assign
    const rolesToRemove = this.heldMappedRoles(member, mapping).filter(
      (roleId) => roleId !== newRole,
    );

    return {
      roleToAdd: member.roles.cache.has(newRole) ? undefined : newRole,
      rolesToRemove,
    };
  }

  /**
   * Reconciles the single coarse encounter role. Callers never pass Cleared —
   * role removal for a cleared signup is owned by RemoveRolesCommandHandler.
   */
  computeCoarseRoleChanges(
    member: GuildMember,
    roles: { progRole?: string; clearRole?: string },
    partyStatus: PartyStatus,
  ): ProgPointRoleChanges {
    const { progRole, clearRole } = roles;
    const desiredRole = coarseRoleFor(partyStatus, roles);

    const rolesToRemove = [progRole, clearRole].filter(
      (roleId): roleId is string =>
        roleId !== undefined &&
        roleId !== desiredRole &&
        member.roles.cache.has(roleId),
    );

    return {
      roleToAdd:
        desiredRole && !member.roles.cache.has(desiredRole)
          ? desiredRole
          : undefined,
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

  private heldMappedRoles(
    member: GuildMember,
    mapping: Record<string, string>,
  ): string[] {
    return [...new Set(Object.values(mapping))].filter((roleId) =>
      member.roles.cache.has(roleId),
    );
  }
}

export { ProgPointRolesService };
