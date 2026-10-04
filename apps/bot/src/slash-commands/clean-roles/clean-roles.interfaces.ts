import type { SignupDocument } from '@ulti-project/shared';
import type { GuildMember, Role } from 'discord.js';

interface MemberToRemove {
  id: string;
  displayName: string;
  username: string;
}

export interface BaseRoleResult {
  roleId: string;
  roleName: string;
  membersProcessed: number;
  rolesRemoved: number;
}

export interface DryRunRoleResult extends BaseRoleResult {
  unremovable: number;
  membersToRemove: MemberToRemove[];
}

export interface NormalRoleResult extends BaseRoleResult {
  failedRemovals: number;
  skippedActiveSignups: number;
}

interface BaseCleanRolesResult {
  totalRolesProcessed: number;
  totalMembersProcessed: number;
  totalRolesRemoved: number;
  totalActiveSignups: number;
  uniqueMembersWithRoles: number;
  uniqueMembersAfterRemoval: number;
}

export interface DryRunResult extends BaseCleanRolesResult {
  isDryRun: true;
  totalUnremovable: number;
  processedRoles: DryRunRoleResult[];
}

export interface NormalResult extends BaseCleanRolesResult {
  isDryRun: false;
  totalFailedRemovals: number;
  processedRoles: NormalRoleResult[];
}

export type CleanRolesResult = DryRunResult | NormalResult;

/** What a clean-up does to one role's holders; both runs follow it. */
export interface RoleRemovalPlan {
  role: Role;
  /** holders with an active signup, who keep the role */
  kept: GuildMember[];
  /** holders without one, whose role the bot removes */
  toRemove: GuildMember[];
  /** holders without one, whose role the bot may not remove */
  unremovable: GuildMember[];
}

export interface ProcessingContext {
  plans: RoleRemovalPlan[];
  activeSignups: SignupDocument[];
  allMembersWithRoles: Set<string>;
  /** members who still hold a configured role after the clean-up */
  membersKeepingRoles: Set<string>;
}

export interface ProcessingStrategy<T extends BaseRoleResult> {
  processRoles(plans: RoleRemovalPlan[]): Promise<T[]>;
  createResult(
    context: ProcessingContext,
    processedRoles: T[],
  ): CleanRolesResult;
}
