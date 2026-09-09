import { Test } from '@nestjs/testing';
import type { SignupDocument } from '@ulti-project/shared';
import { PartyStatus, SignupStatus } from '@ulti-project/shared';
import type { User } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked } from 'vitest';
import { EncountersService } from '../../encounters/encounters.service.js';
import { SignupCollection } from '../../firebase/collections/signup.collection.js';
import type { SettingsDocument } from '../../firebase/models/settings.model.js';
import { SheetsService } from '../../sheets/sheets.service.js';
import {
  createAutoMock,
  mockOf,
  partialMock,
} from '../../test-utils/mock-factory.js';
import { SignupMutationService } from './signup-mutation.service.js';

describe('SignupMutationService', () => {
  let service: SignupMutationService;
  let encountersService: Mocked<EncountersService>;
  let sheetsService: Mocked<SheetsService>;
  let repository: Mocked<SignupCollection>;
  let reviewer: User;

  beforeEach(async () => {
    encountersService = createAutoMock<EncountersService>();
    sheetsService = createAutoMock<SheetsService>();
    repository = createAutoMock<SignupCollection>();

    const module = await Test.createTestingModule({
      providers: [
        SignupMutationService,
        { provide: EncountersService, useValue: encountersService },
        { provide: SheetsService, useValue: sheetsService },
        { provide: SignupCollection, useValue: repository },
      ],
    }).compile();

    service = module.get(SignupMutationService);
    reviewer = mockOf<User>({ username: 'reviewer-name' });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('resolvePartyStatus', () => {
    it('short-circuits a Cleared prog point without consulting the encounters service', async () => {
      const result = await service.resolvePartyStatus(
        'DSR',
        PartyStatus.Cleared,
      );

      expect(result).toBe(PartyStatus.Cleared);
      expect(
        encountersService.getPartyStatusForProgPoint,
      ).not.toHaveBeenCalled();
    });

    it('delegates any other prog point to the encounters service and returns its value', async () => {
      encountersService.getPartyStatusForProgPoint.mockResolvedValue(
        PartyStatus.ProgParty,
      );

      const result = await service.resolvePartyStatus('DSR', 'p3-thordan');

      expect(result).toBe(PartyStatus.ProgParty);
      expect(encountersService.getPartyStatusForProgPoint).toHaveBeenCalledWith(
        'DSR',
        'p3-thordan',
      );
    });
  });

  describe('buildConfirmedSignup', () => {
    it('spreads the signup and sets progPoint plus the derived partyStatus', async () => {
      const signup = partialMock<SignupDocument>({
        character: 'Tan Gigant',
        world: 'Gilgamesh',
        encounter: 'DSR',
        progPoint: 'p2-sanctity',
      });
      encountersService.getPartyStatusForProgPoint.mockResolvedValue(
        PartyStatus.ProgParty,
      );

      const result = await service.buildConfirmedSignup(signup, 'p3-thordan');

      expect(result).toEqual({
        ...signup,
        progPoint: 'p3-thordan',
        partyStatus: PartyStatus.ProgParty,
      });
    });

    it('leaves partyStatus undefined and does not call the encounters service when progPoint is undefined', async () => {
      const signup = partialMock<SignupDocument>({
        character: 'Tan Gigant',
        world: 'Gilgamesh',
        encounter: 'DSR',
      });

      const result = await service.buildConfirmedSignup(signup, undefined);

      expect(result.progPoint).toBeUndefined();
      expect(result.partyStatus).toBeUndefined();
      expect(
        encountersService.getPartyStatusForProgPoint,
      ).not.toHaveBeenCalled();
    });
  });

  describe('applyApproval', () => {
    const nonClearedSignup = () =>
      partialMock<SignupDocument>({
        character: 'Tan Gigant',
        world: 'Gilgamesh',
        encounter: 'DSR',
        progPoint: 'p3-thordan',
        partyStatus: PartyStatus.ProgParty,
      });

    const clearedSignup = () =>
      partialMock<SignupDocument>({
        character: 'Tan Gigant',
        world: 'Gilgamesh',
        encounter: 'DSR',
        progPoint: PartyStatus.Cleared,
        partyStatus: PartyStatus.Cleared,
      });

    it('upserts to the sheet then writes the APPROVED status when a spreadsheetId is configured and the party has not cleared', async () => {
      const settings = partialMock<SettingsDocument>({
        spreadsheetId: 'sheet-1',
      });
      const confirmedSignup = nonClearedSignup();

      await service.applyApproval(confirmedSignup, settings, reviewer);

      expect(sheetsService.upsertSignup).toHaveBeenCalledWith(
        confirmedSignup,
        'sheet-1',
      );
      expect(repository.updateSignupStatus).toHaveBeenCalledWith(
        SignupStatus.APPROVED,
        confirmedSignup,
        'reviewer-name',
      );
      expect(repository.removeSignup).not.toHaveBeenCalled();

      const upsertOrder =
        sheetsService.upsertSignup.mock.invocationCallOrder[0];
      const statusOrder =
        repository.updateSignupStatus.mock.invocationCallOrder[0];
      expect(upsertOrder).toBeLessThan(statusOrder);
    });

    it('removes the signup and never writes a status when the party has cleared', async () => {
      const settings = partialMock<SettingsDocument>({
        spreadsheetId: 'sheet-1',
      });
      const confirmedSignup = clearedSignup();

      await service.applyApproval(confirmedSignup, settings, reviewer);

      expect(repository.removeSignup).toHaveBeenCalledWith({
        character: 'Tan Gigant',
        world: 'Gilgamesh',
        encounter: 'DSR',
      });
      expect(repository.updateSignupStatus).not.toHaveBeenCalled();
    });

    it('skips the sheet upsert but still writes the status when no spreadsheetId is configured', async () => {
      const settings = partialMock<SettingsDocument>({});
      const confirmedSignup = nonClearedSignup();

      await service.applyApproval(confirmedSignup, settings, reviewer);

      expect(sheetsService.upsertSignup).not.toHaveBeenCalled();
      expect(repository.updateSignupStatus).toHaveBeenCalledWith(
        SignupStatus.APPROVED,
        confirmedSignup,
        'reviewer-name',
      );
    });

    it('rejects and performs no Firestore write when the sheet upsert fails', async () => {
      const settings = partialMock<SettingsDocument>({
        spreadsheetId: 'sheet-1',
      });
      const confirmedSignup = nonClearedSignup();
      sheetsService.upsertSignup.mockRejectedValue(new Error('sheets down'));

      await expect(
        service.applyApproval(confirmedSignup, settings, reviewer),
      ).rejects.toThrow('sheets down');

      expect(repository.updateSignupStatus).not.toHaveBeenCalled();
      expect(repository.removeSignup).not.toHaveBeenCalled();
    });
  });

  describe('applyDecline', () => {
    it('writes the DECLINED status for the signup with the reviewer username', async () => {
      const signup = partialMock<SignupDocument>({
        character: 'Tan Gigant',
        encounter: 'DSR',
      });

      await service.applyDecline(signup, reviewer);

      expect(repository.updateSignupStatus).toHaveBeenCalledWith(
        SignupStatus.DECLINED,
        signup,
        'reviewer-name',
      );
    });
  });
});
