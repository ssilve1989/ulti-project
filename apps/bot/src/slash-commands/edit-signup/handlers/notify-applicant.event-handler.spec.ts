import { Test } from '@nestjs/testing';
import {
  Encounter,
  EncounterFriendlyDescription,
  PartyStatus,
  type ProgPointDocument,
  type SignupDocument,
  SignupStatus,
} from '@ulti-project/shared';
import type { User } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked } from 'vitest';
import { DiscordService } from '../../../discord/discord.service.js';
import { EncountersService } from '../../../encounters/encounters.service.js';
import { ErrorService } from '../../../error/error.service.js';
import type { SettingsDocument } from '../../../firebase/models/settings.model.js';
import {
  createAutoMock,
  mockOf,
  partialMock,
} from '../../../test-utils/mock-factory.js';
import type { EditKind } from '../edit-signup.policy.js';
import { SignupEditedEvent } from '../events/signup-edited.event.js';
import { NotifyApplicantEventHandler } from './notify-applicant.event-handler.js';

describe('NotifyApplicantEventHandler', () => {
  let handler: NotifyApplicantEventHandler;
  let discordService: Mocked<DiscordService>;
  let encountersService: Mocked<EncountersService>;
  let errorService: Mocked<ErrorService>;

  const encounterName = EncounterFriendlyDescription[Encounter.DSR];
  const editor = mockOf<User>({ id: 'editor-1' });
  const settings = partialMock<SettingsDocument>({});

  const eventFor = (kind: EditKind, comment?: string) => {
    const before = partialMock<SignupDocument>({
      discordId: 'applicant-1',
      encounter: Encounter.DSR,
      status:
        kind === 'correction' ? SignupStatus.APPROVED : SignupStatus.DECLINED,
      progPoint: kind === 'correction' ? 'P2' : undefined,
    });

    return new SignupEditedEvent(
      kind,
      before,
      {
        ...before,
        status: SignupStatus.APPROVED,
        progPoint: 'P4',
        partyStatus: PartyStatus.ClearParty,
      },
      editor,
      settings,
      'guild-1',
      comment,
    );
  };

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [NotifyApplicantEventHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    handler = fixture.get(NotifyApplicantEventHandler);
    discordService = fixture.get(DiscordService);
    encountersService = fixture.get(EncountersService);
    errorService = fixture.get(ErrorService);

    encountersService.getProgPoints.mockResolvedValue([
      partialMock<ProgPointDocument>({ id: 'P2', label: 'P2 Light Rampant' }),
      partialMock<ProgPointDocument>({
        id: 'P4',
        label: 'P4 Crystallize Time',
      }),
    ]);
  });

  it('tells the applicant their approved prog point was corrected', async () => {
    await handler.handle(eventFor('correction'));

    expect(discordService.sendDirectMessage).toHaveBeenCalledWith(
      'applicant-1',
      {
        content: `Your approved prog point for **${encounterName}** was updated: P2 Light Rampant → P4 Crystallize Time.`,
      },
    );
  });

  it('tells the applicant an earlier decline was reversed', async () => {
    await handler.handle(eventFor('reversal'));

    expect(discordService.sendDirectMessage).toHaveBeenCalledWith(
      'applicant-1',
      {
        content: `Your signup for **${encounterName}** has been approved at **P4 Crystallize Time**. This replaces the earlier decline.`,
      },
    );
  });

  it('quotes every line of the reviewer comment', async () => {
    await handler.handle(eventFor('correction', 'sorry\nmis-click'));

    expect(discordService.sendDirectMessage).toHaveBeenCalledWith(
      'applicant-1',
      {
        content: `Your approved prog point for **${encounterName}** was updated: P2 Light Rampant → P4 Crystallize Time.\n\nThe reviewer left you a comment:\n\n> sorry\n> mis-click`,
      },
    );
  });

  it('captures DM failures without throwing', async () => {
    const failure = new Error('Cannot send messages to this user');
    discordService.sendDirectMessage.mockRejectedValue(failure);

    await expect(handler.handle(eventFor('reversal'))).resolves.toBeUndefined();

    expect(errorService.captureError).toHaveBeenCalledWith(failure);
  });
});
