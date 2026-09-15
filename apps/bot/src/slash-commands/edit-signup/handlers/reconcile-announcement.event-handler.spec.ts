import { Test } from '@nestjs/testing';
import {
  Encounter,
  EncounterFriendlyDescription,
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '@ulti-project/shared';
import type { GuildMember, Message, User } from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { DiscordService } from '../../../discord/discord.service.js';
import { ErrorService } from '../../../error/error.service.js';
import { SignupCollection } from '../../../firebase/collections/signup.collection.js';
import type { SettingsDocument } from '../../../firebase/models/settings.model.js';
import {
  createAutoMock,
  mockOf,
  partialMock,
} from '../../../test-utils/mock-factory.js';
import {
  type EditedSignup,
  SignupEditedEvent,
} from '../events/signup-edited.event.js';
import { ReconcileAnnouncementEventHandler } from './reconcile-announcement.event-handler.js';

describe('ReconcileAnnouncementEventHandler', () => {
  let handler: ReconcileAnnouncementEventHandler;
  let discordService: Mocked<DiscordService>;
  let signupCollection: Mocked<SignupCollection>;
  let errorService: Mocked<ErrorService>;
  let edit: ReturnType<typeof vi.fn>;
  let send: ReturnType<typeof vi.fn>;

  const names = new Map([
    ['editor-1', 'Jet'],
    ['reviewer-1', 'Spike'],
  ]);
  const at = Timestamp.fromMillis(1_000);
  const editor = mockOf<User>({
    id: 'editor-1',
    displayAvatarURL: () => 'https://cdn.example/editor.png',
  });
  const settings = partialMock<SettingsDocument>({
    signupChannel: 'signup-channel',
  });

  const approvedBefore = partialMock<SignupDocument>({
    discordId: 'applicant-1',
    encounter: Encounter.DSR,
    character: 'faye valentine',
    world: 'gilgamesh',
    role: 'WHM',
    progPointRequested: 'P3',
    status: SignupStatus.APPROVED,
    progPoint: 'P2',
    partyStatus: PartyStatus.ProgParty,
    approvalMessageId: 'announcement-1',
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

  const afterOf = (before: SignupDocument): EditedSignup => ({
    ...before,
    status: SignupStatus.APPROVED,
    progPoint: 'P4',
    partyStatus: PartyStatus.ClearParty,
  });

  const announcementWithFooter = (footer: string) => ({
    content: '<@applicant-1> Signup Approved!',
    embeds: [
      expect.objectContaining({
        data: expect.objectContaining({
          title: `Signup Approved - ${EncounterFriendlyDescription[Encounter.DSR]}`,
          fields: expect.arrayContaining([
            { name: 'Prog Point', value: 'P4', inline: true },
          ]),
          footer: { text: footer, icon_url: 'https://cdn.example/editor.png' },
        }),
      }),
    ],
  });

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [ReconcileAnnouncementEventHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    handler = fixture.get(ReconcileAnnouncementEventHandler);
    discordService = fixture.get(DiscordService);
    signupCollection = fixture.get(SignupCollection);
    errorService = fixture.get(ErrorService);

    edit = vi.fn().mockResolvedValue(undefined);
    send = vi.fn().mockResolvedValue(mockOf<Message>({ id: 'announcement-2' }));

    discordService.fetchMessage.mockResolvedValue(
      mockOf<Message>({ id: 'announcement-1', edit }),
    );
    discordService.getTextChannel.mockResolvedValue(
      mockOf<
        NonNullable<Awaited<ReturnType<DiscordService['getTextChannel']>>>
      >({ send }),
    );
    discordService.getDisplayName.mockImplementation(({ userId }) =>
      Promise.resolve(names.get(userId) ?? userId),
    );
    discordService.getGuildMember.mockResolvedValue(
      mockOf<GuildMember>({
        displayAvatarURL: () => 'https://cdn.example/applicant.png',
      }),
    );
    discordService.getEmojiString.mockReturnValue('');
    signupCollection.setApprovalMessageId.mockResolvedValue({
      type: 'written',
    });
  });

  it('edits the stored announcement in place for a correction', async () => {
    await handler.handle(
      new SignupEditedEvent(
        'correction',
        approvedBefore,
        afterOf(approvedBefore),
        editor,
        settings,
        'guild-1',
      ),
    );

    expect(discordService.fetchMessage).toHaveBeenCalledWith(
      'guild-1',
      'signup-channel',
      'announcement-1',
    );
    expect(edit).toHaveBeenCalledWith(
      announcementWithFooter('Approved by Spike · edited by Jet'),
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('skips a correction when no announcement id is stored', async () => {
    const untracked = partialMock<SignupDocument>({
      ...approvedBefore,
      approvalMessageId: undefined,
    });

    await handler.handle(
      new SignupEditedEvent(
        'correction',
        untracked,
        afterOf(untracked),
        editor,
        settings,
        'guild-1',
      ),
    );

    expect(discordService.fetchMessage).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('skips a correction when the announcement was deleted', async () => {
    discordService.fetchMessage.mockResolvedValue(undefined);

    await handler.handle(
      new SignupEditedEvent(
        'correction',
        approvedBefore,
        afterOf(approvedBefore),
        editor,
        settings,
        'guild-1',
      ),
    );

    expect(send).not.toHaveBeenCalled();
    expect(errorService.captureError).not.toHaveBeenCalled();
  });

  it('posts a fresh announcement and stores its id against the reversal decision', async () => {
    const declined = partialMock<SignupDocument>({
      ...approvedBefore,
      status: SignupStatus.DECLINED,
      approvalMessageId: undefined,
    });
    const reversalAt = Timestamp.fromMillis(4_000);
    const after: EditedSignup = {
      ...afterOf(declined),
      reviewHistory: [
        ...(declined.reviewHistory ?? []),
        {
          type: 'approved',
          progPoint: 'P4',
          partyStatus: PartyStatus.ClearParty,
          actorId: 'editor-1',
          at: reversalAt,
          via: 'edit',
        },
      ],
    };

    await handler.handle(
      new SignupEditedEvent(
        'reversal',
        declined,
        after,
        editor,
        settings,
        'guild-1',
      ),
    );

    expect(send).toHaveBeenCalledWith(
      announcementWithFooter('Approved by Jet'),
    );
    expect(signupCollection.setApprovalMessageId).toHaveBeenCalledWith(
      after,
      'announcement-2',
      reversalAt,
    );
  });

  it('does nothing without a signup channel', async () => {
    await handler.handle(
      new SignupEditedEvent(
        'reversal',
        approvedBefore,
        afterOf(approvedBefore),
        editor,
        partialMock<SettingsDocument>({}),
        'guild-1',
      ),
    );

    expect(discordService.getTextChannel).not.toHaveBeenCalled();
    expect(discordService.fetchMessage).not.toHaveBeenCalled();
  });

  it('captures errors without throwing', async () => {
    const failure = new Error('Missing Access');
    send.mockRejectedValue(failure);

    await expect(
      handler.handle(
        new SignupEditedEvent(
          'reversal',
          approvedBefore,
          afterOf(approvedBefore),
          editor,
          settings,
          'guild-1',
        ),
      ),
    ).resolves.toBeUndefined();

    expect(errorService.captureError).toHaveBeenCalledWith(failure);
  });
});
