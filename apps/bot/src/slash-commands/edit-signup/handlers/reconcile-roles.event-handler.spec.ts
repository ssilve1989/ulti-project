import { Test } from '@nestjs/testing';
import {
  Encounter,
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '@ulti-project/shared';
import type { GuildMember, User } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { DiscordService } from '../../../discord/discord.service.js';
import { ErrorService } from '../../../error/error.service.js';
import type { SettingsDocument } from '../../../firebase/models/settings.model.js';
import { ProgPointRolesService } from '../../../role-manager/prog-point-roles.service.js';
import {
  createAutoMock,
  mockOf,
  partialMock,
} from '../../../test-utils/mock-factory.js';
import {
  type EditedSignup,
  SignupEditedEvent,
} from '../events/signup-edited.event.js';
import { ReconcileRolesEventHandler } from './reconcile-roles.event-handler.js';

describe('ReconcileRolesEventHandler', () => {
  let handler: ReconcileRolesEventHandler;
  let discordService: Mocked<DiscordService>;
  let errorService: Mocked<ErrorService>;
  let member: {
    user: { username: string };
    roles: {
      cache: Map<string, unknown>;
      add: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
    };
  };

  const editor = mockOf<User>({ id: 'editor-1' });
  const settings = partialMock<SettingsDocument>({
    progRoles: { [Encounter.DSR]: 'prog-role' },
    clearRoles: { [Encounter.DSR]: 'clear-role' },
    progPointRoles: { [Encounter.DSR]: { P2: 'p2-role', P4: 'p4-role' } },
  });

  const before = partialMock<SignupDocument>({
    discordId: 'applicant-1',
    encounter: Encounter.DSR,
    status: SignupStatus.APPROVED,
    progPoint: 'P4',
    partyStatus: PartyStatus.ClearParty,
  });

  const eventFor = (
    after: Pick<EditedSignup, 'progPoint' | 'partyStatus'>,
    eventSettings: SettingsDocument = settings,
  ) =>
    new SignupEditedEvent(
      'correction',
      before,
      { ...before, ...after },
      editor,
      eventSettings,
      'guild-1',
    );

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [ReconcileRolesEventHandler, ProgPointRolesService],
    })
      .useMocker(createAutoMock)
      .compile();

    handler = fixture.get(ReconcileRolesEventHandler);
    discordService = fixture.get(DiscordService);
    errorService = fixture.get(ErrorService);

    member = {
      user: { username: 'faye' },
      roles: {
        cache: new Map(),
        add: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    };
    discordService.getGuildMember.mockImplementation(() =>
      Promise.resolve(mockOf<GuildMember>(member)),
    );
  });

  it('swaps coarse and prog-point roles when a correction moves Clear → Prog', async () => {
    member.roles.cache.set('clear-role', {});
    member.roles.cache.set('p4-role', {});

    await handler.handle(
      eventFor({ progPoint: 'P2', partyStatus: PartyStatus.ProgParty }),
    );

    expect(discordService.getGuildMember).toHaveBeenCalledWith({
      memberId: 'applicant-1',
      guildId: 'guild-1',
    });
    expect(member.roles.remove).toHaveBeenCalledWith(['clear-role']);
    expect(member.roles.add).toHaveBeenCalledWith('prog-role');
    expect(member.roles.remove).toHaveBeenCalledWith(['p4-role']);
    expect(member.roles.add).toHaveBeenCalledWith('p2-role');
  });

  it('removes the old prog-point role when the new prog point is unmapped', async () => {
    member.roles.cache.set('prog-role', {});
    member.roles.cache.set('p4-role', {});

    await handler.handle(
      eventFor({ progPoint: 'P3', partyStatus: PartyStatus.ProgParty }),
    );

    expect(member.roles.remove).toHaveBeenCalledTimes(1);
    expect(member.roles.remove).toHaveBeenCalledWith(['p4-role']);
    expect(member.roles.add).not.toHaveBeenCalled();
  });

  it('keeps a held prog-point role when a reversal approves at an unmapped prog point', async () => {
    member.roles.cache.set('prog-role', {});
    member.roles.cache.set('p4-role', {});
    const declined = { ...before, status: SignupStatus.DECLINED };

    await handler.handle(
      new SignupEditedEvent(
        'reversal',
        declined,
        {
          ...declined,
          status: SignupStatus.APPROVED,
          progPoint: 'P3',
          partyStatus: PartyStatus.ProgParty,
        },
        editor,
        settings,
        'guild-1',
      ),
    );

    expect(member.roles.remove).not.toHaveBeenCalled();
    expect(member.roles.add).not.toHaveBeenCalled();
  });

  it('does nothing when no roles are configured for the encounter', async () => {
    await handler.handle(
      eventFor(
        { progPoint: 'P2', partyStatus: PartyStatus.ProgParty },
        partialMock<SettingsDocument>({}),
      ),
    );

    expect(discordService.getGuildMember).not.toHaveBeenCalled();
  });

  it('does nothing when the applicant has left the server', async () => {
    discordService.getGuildMember.mockResolvedValue(undefined);

    await handler.handle(
      eventFor({ progPoint: 'P2', partyStatus: PartyStatus.ProgParty }),
    );

    expect(errorService.captureError).not.toHaveBeenCalled();
  });

  it('captures role update failures without throwing', async () => {
    const failure = new Error('Missing Permissions');
    member.roles.cache.set('clear-role', {});
    member.roles.remove.mockRejectedValue(failure);

    await expect(
      handler.handle(
        eventFor({ progPoint: 'P2', partyStatus: PartyStatus.ProgParty }),
      ),
    ).resolves.toBeUndefined();

    expect(errorService.captureError).toHaveBeenCalledWith(failure);
  });
});
