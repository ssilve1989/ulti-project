import type {
  GuildMember,
  GuildMemberRoleManager,
  Role,
  User,
} from 'discord.js';
import { vi } from 'vitest';
import { mockOf } from '#src/test-utils/mock-factory.js';
import type {
  BaseRoleResult,
  ProcessingStrategy,
} from './clean-roles.interfaces.js';
import { planRoleRemovals } from './clean-roles.utils.js';

/** A cached guild member whose role removals resolve, unless Discord rejects them. */
export const memberWith = (
  id: string,
  { rejectWith }: { rejectWith?: Error } = {},
) =>
  mockOf<GuildMember>({
    id,
    displayName: `Nick ${id}`,
    user: mockOf<User>({ username: id }),
    roles: mockOf<GuildMemberRoleManager>({
      remove: rejectWith
        ? vi.fn().mockRejectedValue(rejectWith)
        : vi.fn().mockResolvedValue(undefined),
    }),
  });

/** A role held by `members`, which the bot may remove unless `editable` is false. */
export const roleHeldBy = (
  id: string,
  members: GuildMember[],
  { editable = true }: { editable?: boolean } = {},
) =>
  mockOf<Role>({
    id,
    name: `Role ${id}`,
    editable,
    members: new Map(members.map((member) => [member.id, member])),
  });

/** Runs a strategy on the plan the handler would make for `roles`. */
export const processRoles = <T extends BaseRoleResult>(
  strategy: ProcessingStrategy<T>,
  roles: Role[],
  activeSignupDiscordIds: Set<string>,
) => strategy.processRoles(planRoleRemovals(roles, activeSignupDiscordIds));
