import type { Guild, Role } from 'discord.js';
import type { SignupDocument } from '../../firebase/models/signup.model.js';

export interface MemberToRemove {
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
  membersToRemove: MemberToRemove[];
}

export interface NormalRoleResult extends BaseRoleResult {
  // No additional properties needed for normal execution
}

export interface BaseCleanRolesResult {
  totalRolesProcessed: number;
  totalMembersProcessed: number;
  totalRolesRemoved: number;
  totalActiveSignups: number;
  uniqueMembersWithRoles: number;
  uniqueMembersAfterRemoval: number;
}

export interface DryRunResult extends BaseCleanRolesResult {
  isDryRun: true;
  processedRoles: DryRunRoleResult[];
}

export interface NormalResult extends BaseCleanRolesResult {
  isDryRun: false;
  processedRoles: NormalRoleResult[];
}

export type CleanRolesResult = DryRunResult | NormalResult;

export interface ProcessingContext {
  guild: Guild;
  guildId: string;
  allRoleIds: Set<string>;
  activeSignups: SignupDocument[];
  activeSignupDiscordIds: Set<string>;
  allMembersWithRoles: Set<string>;
}

export interface ProcessingStrategy<T extends BaseRoleResult> {
  processRole(role: Role, activeSignupDiscordIds: Set<string>): Promise<T>;
  createResult(
    context: ProcessingContext,
    processedRoles: T[],
  ): CleanRolesResult;
}
