import { Test } from '@nestjs/testing';
import type { ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { DiscordService } from '../../../discord/discord.service.js';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../../firebase/collections/signup.collection.js';
import {
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '../../../firebase/models/signup.model.js';
import { ProgPointRolesService } from '../../../role-manager/prog-point-roles.service.js';
import { createAutoMock } from '../../../test-utils/mock-factory.js';
import { SyncProgRolesCommandHandler } from './sync-prog-roles.command-handler.js';

type EmbedReply = {
  embeds: { data: { fields: { name: string; value: string }[] } }[];
};

describe('SyncProgRolesCommandHandler', () => {
  let handler: SyncProgRolesCommandHandler;
  let discordService: Mocked<DiscordService>;
  let settingsCollection: Mocked<SettingsCollection>;
  let signupCollection: Mocked<SignupCollection>;

  const guildId = 'guild-1';

  const createMember = (heldRoles: string[] = []) => ({
    user: { username: 'tester' },
    roles: {
      cache: new Map(heldRoles.map((id) => [id, {}])),
      add: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    },
  });

  const createSignup = (overrides: Partial<SignupDocument>): SignupDocument =>
    ({
      discordId: 'user-1',
      encounter: 'TOP',
      progPoint: 'P2',
      partyStatus: PartyStatus.ProgParty,
      status: SignupStatus.APPROVED,
      ...overrides,
    }) as SignupDocument;

  const wireGuild = (members: Map<string, ReturnType<typeof createMember>>) => {
    const guild = {
      members: {
        fetch: vi.fn().mockResolvedValue(undefined),
        cache: members,
      },
    };
    Object.defineProperty(discordService, 'client', {
      value: { guilds: { fetch: vi.fn().mockResolvedValue(guild) } },
      writable: true,
      configurable: true,
    });
    return guild;
  };

  const createInteraction = (dryRun = false) => {
    const editReply = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      guildId,
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply,
      options: { getBoolean: vi.fn().mockReturnValue(dryRun) },
    } as unknown as ChatInputCommandInteraction<'cached'>;
    return { interaction, editReply };
  };

  const summaryValue = (editReply: ReturnType<typeof vi.fn>) => {
    const [reply] = editReply.mock.calls.at(-1) as [EmbedReply];
    const field = reply.embeds[0].data.fields.find((f) => f.name === 'Summary');
    return field?.value ?? '';
  };

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [SyncProgRolesCommandHandler, ProgPointRolesService],
    })
      .useMocker(createAutoMock)
      .compile();

    handler = fixture.get(SyncProgRolesCommandHandler);
    discordService = fixture.get(DiscordService);
    settingsCollection = fixture.get(SettingsCollection);
    signupCollection = fixture.get(SignupCollection);
  });

  it('replies early when no mappings are configured', async () => {
    settingsCollection.getSettings.mockResolvedValue({ progPointRoles: {} });
    const { interaction, editReply } = createInteraction();

    await handler.execute(interaction);

    expect(editReply).toHaveBeenCalledWith(
      expect.stringContaining('No prog point role mappings configured'),
    );
    expect(signupCollection.findByStatusIn).not.toHaveBeenCalled();
  });

  it('applies changes on a real run and reports counts', async () => {
    settingsCollection.getSettings.mockResolvedValue({
      progPointRoles: { TOP: { P1: 'role-p1', P2: 'role-p2' } },
    });
    signupCollection.findByStatusIn.mockResolvedValue([createSignup({})]);
    const member = createMember(['role-p1']);
    wireGuild(new Map([['user-1', member]]));
    const { interaction, editReply } = createInteraction();

    await handler.execute(interaction);

    expect(signupCollection.findByStatusIn).toHaveBeenCalledWith([
      SignupStatus.APPROVED,
      SignupStatus.UPDATE_PENDING,
    ]);
    expect(member.roles.remove).toHaveBeenCalledWith(['role-p1']);
    expect(member.roles.add).toHaveBeenCalledWith('role-p2');
    const summary = summaryValue(editReply);
    expect(summary).toContain('**Members Changed:** 1');
    expect(summary).toContain('**Roles Added:** 1');
    expect(summary).toContain('**Roles Removed:** 1');
  });

  it('computes but never mutates on dry-run', async () => {
    settingsCollection.getSettings.mockResolvedValue({
      progPointRoles: { TOP: { P1: 'role-p1', P2: 'role-p2' } },
    });
    signupCollection.findByStatusIn.mockResolvedValue([createSignup({})]);
    const member = createMember(['role-p1']);
    wireGuild(new Map([['user-1', member]]));
    const { interaction, editReply } = createInteraction(true);

    await handler.execute(interaction);

    expect(member.roles.add).not.toHaveBeenCalled();
    expect(member.roles.remove).not.toHaveBeenCalled();
    const summary = summaryValue(editReply);
    expect(summary).toContain('**Members To Change:** 1');
    expect(summary).toContain('**Roles Added:** 1');
  });

  it('skips members who left, cleared signups, and unmapped prog points', async () => {
    settingsCollection.getSettings.mockResolvedValue({
      progPointRoles: { TOP: { P2: 'role-p2' } },
    });
    signupCollection.findByStatusIn.mockResolvedValue([
      createSignup({ discordId: 'gone-user' }),
      createSignup({
        discordId: 'user-2',
        partyStatus: PartyStatus.Cleared,
        progPoint: PartyStatus.Cleared,
      }),
      createSignup({ discordId: 'user-3', progPoint: 'P9' }),
    ]);
    const member3 = createMember();
    wireGuild(
      new Map([
        ['user-2', createMember()],
        ['user-3', member3],
      ]),
    );
    const { interaction, editReply } = createInteraction();

    await handler.execute(interaction);

    expect(member3.roles.add).not.toHaveBeenCalled();
    const summary = summaryValue(editReply);
    expect(summary).toContain('**Skipped (no mapping/prog point):** 2');
    expect(summary).toContain('**Skipped (member left):** 1');
    expect(summary).toContain('**Members Changed:** 0');
  });

  it('counts already-correct members as skipped without mutating', async () => {
    settingsCollection.getSettings.mockResolvedValue({
      progPointRoles: { TOP: { P2: 'role-p2' } },
    });
    signupCollection.findByStatusIn.mockResolvedValue([createSignup({})]);
    const member = createMember(['role-p2']);
    wireGuild(new Map([['user-1', member]]));
    const { interaction, editReply } = createInteraction();

    await handler.execute(interaction);

    expect(member.roles.add).not.toHaveBeenCalled();
    expect(summaryValue(editReply)).toContain(
      '**Skipped (already correct):** 1',
    );
  });

  it('continues the sweep when applying to one member fails', async () => {
    settingsCollection.getSettings.mockResolvedValue({
      progPointRoles: { TOP: { P2: 'role-p2' } },
    });
    signupCollection.findByStatusIn.mockResolvedValue([
      createSignup({ discordId: 'user-1' }),
      createSignup({ discordId: 'user-2' }),
    ]);
    const failing = createMember();
    failing.roles.add.mockRejectedValue(new Error('missing permissions'));
    const succeeding = createMember();
    wireGuild(
      new Map([
        ['user-1', failing],
        ['user-2', succeeding],
      ]),
    );
    const { interaction, editReply } = createInteraction();

    await handler.execute(interaction);

    expect(succeeding.roles.add).toHaveBeenCalledWith('role-p2');
    const summary = summaryValue(editReply);
    expect(summary).toContain('**Errors:** 1');
    expect(summary).toContain('**Members Changed:** 1');
  });
});
