import { EventBus } from '@nestjs/cqrs';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  Encounter,
  PartyStatus,
  type ReviewHistoryEntry,
  type SignupDocument,
  SignupStatus,
} from '@ulti-project/shared';
import type { User } from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, type Mocked } from 'vitest';
import { EncountersService } from '../../encounters/encounters.service.js';
import { ErrorService } from '../../error/error.service.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import type { SettingsDocument } from '../../firebase/models/settings.model.js';
import { SheetsService } from '../../sheets/sheets.service.js';
import {
  createAutoMock,
  mockOf,
  partialMock,
} from '../../test-utils/mock-factory.js';
import { EditSignupService } from './edit-signup.service.js';
import {
  type EditedSignup,
  SignupEditedEvent,
} from './events/signup-edited.event.js';

describe('EditSignupService', () => {
  let service: EditSignupService;
  let encountersService: Mocked<EncountersService>;
  let signupCollection: Mocked<SignupCollection>;
  let sheetsService: Mocked<SheetsService>;
  let errorService: Mocked<ErrorService>;
  let eventBus: Mocked<EventBus>;

  const updateTime = Timestamp.fromMillis(5_000);
  const editor = mockOf<User>({ id: 'editor-1' });
  const settings = partialMock<SettingsDocument>({ spreadsheetId: 'sheet-1' });

  const existingApproval: ReviewHistoryEntry = {
    type: 'approved',
    progPoint: 'P2',
    partyStatus: PartyStatus.ProgParty,
    actorId: 'reviewer-1',
    at: Timestamp.fromMillis(1_000),
    via: 'reaction',
  };

  const approved = partialMock<SignupDocument>({
    discordId: 'applicant-1',
    encounter: Encounter.DSR,
    character: 'faye valentine',
    world: 'gilgamesh',
    status: SignupStatus.APPROVED,
    progPoint: 'P2',
    partyStatus: PartyStatus.ProgParty,
    reviewHistory: [existingApproval],
  });

  const declinedUntracked = partialMock<SignupDocument>({
    discordId: 'applicant-1',
    encounter: Encounter.DSR,
    character: 'faye valentine',
    world: 'gilgamesh',
    status: SignupStatus.DECLINED,
  });

  /**
   * What applyEdit reports it wrote. The service publishes this as-is — which
   * fields a write supersedes is the collection's rule, covered by its spec.
   */
  const written: EditedSignup = {
    ...approved,
    progPoint: 'P4',
    partyStatus: PartyStatus.ClearParty,
  };

  beforeEach(async () => {
    const fixture: TestingModule = await Test.createTestingModule({
      providers: [EditSignupService],
    })
      .useMocker(createAutoMock)
      .compile();

    service = fixture.get(EditSignupService);
    encountersService = fixture.get(EncountersService);
    signupCollection = fixture.get(SignupCollection);
    sheetsService = fixture.get(SheetsService);
    errorService = fixture.get(ErrorService);
    eventBus = fixture.get(EventBus);

    encountersService.getPartyStatusForProgPoint.mockResolvedValue(
      PartyStatus.ClearParty,
    );
    signupCollection.applyEdit.mockResolvedValue({
      type: 'written',
      after: written,
    });
  });

  it('returns conflict without touching Sheets or publishing when the signup changed', async () => {
    signupCollection.applyEdit.mockResolvedValue({ type: 'conflict' });

    await expect(
      service.apply({
        kind: 'correction',
        signup: approved,
        updateTime,
        progPoint: 'P4',
        editor,
        settings,
        guildId: 'guild-1',
      }),
    ).resolves.toEqual({ type: 'conflict' });

    expect(sheetsService.upsertSignup).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('appends a progPointEdited entry for a correction of a tracked signup', async () => {
    await service.apply({
      kind: 'correction',
      signup: approved,
      updateTime,
      progPoint: 'P4',
      editor,
      settings,
      guildId: 'guild-1',
    });

    expect(encountersService.getPartyStatusForProgPoint).toHaveBeenCalledWith(
      Encounter.DSR,
      'P4',
    );
    expect(signupCollection.applyEdit).toHaveBeenCalledWith(
      approved,
      {
        progPoint: 'P4',
        partyStatus: PartyStatus.ClearParty,
        historyEntries: [
          {
            type: 'progPointEdited',
            progPoint: 'P4',
            partyStatus: PartyStatus.ClearParty,
            actorId: 'editor-1',
            at: expect.any(Timestamp),
            via: 'edit',
          },
        ],
      },
      updateTime,
    );
  });

  it('appends a seeded approved entry for a reversal of an untracked signup', async () => {
    await service.apply({
      kind: 'reversal',
      signup: declinedUntracked,
      updateTime,
      progPoint: 'P4',
      editor,
      settings,
      guildId: 'guild-1',
    });

    expect(signupCollection.applyEdit).toHaveBeenCalledWith(
      declinedUntracked,
      expect.objectContaining({
        historyEntries: [
          { type: 'trackingStarted', at: expect.any(Timestamp) },
          {
            type: 'approved',
            progPoint: 'P4',
            partyStatus: PartyStatus.ClearParty,
            actorId: 'editor-1',
            at: expect.any(Timestamp),
            via: 'edit',
          },
        ],
      }),
      updateTime,
    );
  });

  it('writes Firestore before Sheets and publishes the edit', async () => {
    const result = await service.apply({
      kind: 'correction',
      signup: approved,
      updateTime,
      progPoint: 'P4',
      editor,
      comment: 'sorry, mis-click',
      settings,
      guildId: 'guild-1',
    });

    expect(result).toEqual({ type: 'saved' });
    expect(signupCollection.applyEdit.mock.invocationCallOrder[0]).toBeLessThan(
      sheetsService.upsertSignup.mock.invocationCallOrder[0],
    );
    // the written document goes to Sheets and to subscribers, not a local copy
    expect(sheetsService.upsertSignup).toHaveBeenCalledWith(written, 'sheet-1');

    const [event] = eventBus.publish.mock.calls[0];
    expect(event).toBeInstanceOf(SignupEditedEvent);
    expect(event).toMatchObject({
      kind: 'correction',
      before: approved,
      after: written,
      editor,
      settings,
      guildId: 'guild-1',
      comment: 'sorry, mis-click',
    });
  });

  it('reports a Sheets failure but still publishes the saved edit', async () => {
    const failure = new Error('Sheets quota exceeded');
    sheetsService.upsertSignup.mockRejectedValue(failure);

    await expect(
      service.apply({
        kind: 'correction',
        signup: approved,
        updateTime,
        progPoint: 'P4',
        editor,
        settings,
        guildId: 'guild-1',
      }),
    ).resolves.toEqual({ type: 'savedWithSheetsError' });

    expect(errorService.captureError).toHaveBeenCalledWith(failure);
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.any(SignupEditedEvent),
    );
  });

  it('skips Sheets when no spreadsheet is configured', async () => {
    await expect(
      service.apply({
        kind: 'correction',
        signup: approved,
        updateTime,
        progPoint: 'P4',
        editor,
        settings: partialMock<SettingsDocument>({}),
        guildId: 'guild-1',
      }),
    ).resolves.toEqual({ type: 'saved' });

    expect(sheetsService.upsertSignup).not.toHaveBeenCalled();
  });
});
