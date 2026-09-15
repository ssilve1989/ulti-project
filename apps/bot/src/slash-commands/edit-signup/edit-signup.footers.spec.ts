import {
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '@ulti-project/shared';
import type { User } from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, type Mocked } from 'vitest';
import type { DiscordService } from '../../discord/discord.service.js';
import {
  createAutoMock,
  mockOf,
  partialMock,
} from '../../test-utils/mock-factory.js';
import { buildEditedFooterText } from './edit-signup.footers.js';

describe('buildEditedFooterText', () => {
  let discordService: Mocked<DiscordService>;

  const names = new Map([
    ['editor-1', 'Jet'],
    ['reviewer-1', 'Spike'],
  ]);
  const editor = mockOf<User>({ id: 'editor-1' });
  const at = Timestamp.fromMillis(1_000);

  beforeEach(() => {
    discordService = createAutoMock<DiscordService>();
    discordService.getDisplayName.mockImplementation(({ userId }) =>
      Promise.resolve(names.get(userId) ?? userId),
    );
  });

  it('names the current approver and the editor for a correction', async () => {
    const before = partialMock<SignupDocument>({
      status: SignupStatus.APPROVED,
      reviewedBy: 'spike_username',
      reviewHistory: [
        {
          type: 'approved',
          progPoint: 'P2',
          partyStatus: PartyStatus.ProgParty,
          actorId: 'reviewer-1',
          at,
          via: 'reaction',
        },
      ],
    });

    await expect(
      buildEditedFooterText(discordService, {
        kind: 'correction',
        before,
        editor,
        guildId: 'guild-1',
      }),
    ).resolves.toBe('Approved by Spike · edited by Jet');
  });

  it('falls back to reviewedBy for an approval made before tracking', async () => {
    const before = partialMock<SignupDocument>({
      status: SignupStatus.APPROVED,
      reviewedBy: 'spike_username',
    });

    await expect(
      buildEditedFooterText(discordService, {
        kind: 'correction',
        before,
        editor,
        guildId: 'guild-1',
      }),
    ).resolves.toBe('Approved by spike_username · edited by Jet');
  });

  it('names the editor and the previous decliner for a reversal', async () => {
    const before = partialMock<SignupDocument>({
      status: SignupStatus.DECLINED,
      reviewHistory: [
        { type: 'declined', actorId: 'reviewer-1', at, via: 'reaction' },
      ],
    });

    await expect(
      buildEditedFooterText(discordService, {
        kind: 'reversal',
        before,
        editor,
        guildId: 'guild-1',
      }),
    ).resolves.toBe('Approved by Jet · previously declined by Spike');
  });

  it('uses unknown when nobody can be named', async () => {
    await expect(
      buildEditedFooterText(discordService, {
        kind: 'reversal',
        before: partialMock<SignupDocument>({ status: SignupStatus.DECLINED }),
        editor,
        guildId: 'guild-1',
      }),
    ).resolves.toBe('Approved by Jet · previously declined by unknown');
  });
});
