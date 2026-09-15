import { Test } from '@nestjs/testing';
import {
  Encounter,
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '@ulti-project/shared';
import { Colors, type Message, type User } from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { DiscordService } from '../../../discord/discord.service.js';
import { ErrorService } from '../../../error/error.service.js';
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
import { UpdateReviewMessageEventHandler } from './update-review-message.event-handler.js';

describe('UpdateReviewMessageEventHandler', () => {
  let handler: UpdateReviewMessageEventHandler;
  let discordService: Mocked<DiscordService>;
  let errorService: Mocked<ErrorService>;
  let edit: ReturnType<typeof vi.fn>;

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
    reviewChannel: 'review-channel',
  });

  const approvedBefore = partialMock<SignupDocument>({
    discordId: 'applicant-1',
    encounter: Encounter.DSR,
    status: SignupStatus.APPROVED,
    progPoint: 'P2',
    partyStatus: PartyStatus.ProgParty,
    reviewMessageId: 'review-msg',
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

  const declinedBefore = partialMock<SignupDocument>({
    ...approvedBefore,
    status: SignupStatus.DECLINED,
    reviewHistory: [
      { type: 'declined', actorId: 'reviewer-1', at, via: 'reaction' },
    ],
  });

  const afterOf = (before: SignupDocument): EditedSignup => ({
    ...before,
    status: SignupStatus.APPROVED,
    progPoint: 'P4',
    partyStatus: PartyStatus.ClearParty,
  });

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [UpdateReviewMessageEventHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    handler = fixture.get(UpdateReviewMessageEventHandler);
    discordService = fixture.get(DiscordService);
    errorService = fixture.get(ErrorService);

    edit = vi.fn().mockResolvedValue(undefined);
    discordService.fetchMessage.mockResolvedValue(
      mockOf<Message>({ id: 'review-msg', embeds: [{}], edit }),
    );
    discordService.getDisplayName.mockImplementation(({ userId }) =>
      Promise.resolve(names.get(userId) ?? userId),
    );
  });

  it('marks a corrected review as edited', async () => {
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
      'review-channel',
      'review-msg',
    );
    expect(edit).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          data: expect.objectContaining({
            color: Colors.Green,
            footer: {
              text: 'Approved by Spike · edited by Jet',
              icon_url: 'https://cdn.example/editor.png',
            },
          }),
        }),
      ],
    });
  });

  it('restores the review content and names both reviewers for a reversal', async () => {
    await handler.handle(
      new SignupEditedEvent(
        'reversal',
        declinedBefore,
        afterOf(declinedBefore),
        editor,
        settings,
        'guild-1',
      ),
    );

    expect(edit).toHaveBeenCalledWith({
      content: 'Signup Review for <@applicant-1>',
      embeds: [
        expect.objectContaining({
          data: expect.objectContaining({
            color: Colors.Green,
            footer: {
              text: 'Approved by Jet · previously declined by Spike',
              icon_url: 'https://cdn.example/editor.png',
            },
          }),
        }),
      ],
    });
  });

  it('skips when no review channel is configured', async () => {
    await handler.handle(
      new SignupEditedEvent(
        'correction',
        approvedBefore,
        afterOf(approvedBefore),
        editor,
        partialMock<SettingsDocument>({}),
        'guild-1',
      ),
    );

    expect(discordService.fetchMessage).not.toHaveBeenCalled();
  });

  it('skips when the signup has no review message', async () => {
    const withoutReview = partialMock<SignupDocument>({
      ...approvedBefore,
      reviewMessageId: undefined,
    });

    await handler.handle(
      new SignupEditedEvent(
        'correction',
        withoutReview,
        afterOf(withoutReview),
        editor,
        settings,
        'guild-1',
      ),
    );

    expect(discordService.fetchMessage).not.toHaveBeenCalled();
  });

  it('skips when the review message was deleted', async () => {
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

    expect(edit).not.toHaveBeenCalled();
    expect(errorService.captureError).not.toHaveBeenCalled();
  });

  it('captures errors without throwing', async () => {
    const failure = new Error('Missing Access');
    discordService.fetchMessage.mockRejectedValue(failure);

    await expect(
      handler.handle(
        new SignupEditedEvent(
          'correction',
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
