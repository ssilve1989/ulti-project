import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { Encounter } from '../../../encounters/encounters.consts.js';
import {
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '../../../firebase/models/signup.model.js';
import { SheetsService } from '../../../sheets/sheets.service.js';
import { createAutoMock } from '../../../test-utils/mock-factory.js';
import { turboProgSignupSchema } from '../turbo-prog-signup.schema.js';
import { TURBO_PROG_SIGNUP_INVALID } from '../turboprog.consts.js';
import { TurboProgCommandHandler } from './turbo-prog.command-handler.js';

const approvedCases = [
  { status: SignupStatus.APPROVED, partyStatus: PartyStatus.ClearParty },
  { status: SignupStatus.APPROVED, partyStatus: PartyStatus.ProgParty },
] as const;

const declinedCases = [
  { status: SignupStatus.APPROVED, partyStatus: PartyStatus.EarlyProgParty },
  { status: SignupStatus.APPROVED, partyStatus: PartyStatus.Cleared },
] as const;

const searchableCases = [
  { status: SignupStatus.APPROVED, partyStatus: undefined },
  { status: SignupStatus.PENDING },
  { status: SignupStatus.UPDATE_PENDING },
  { status: SignupStatus.DECLINED },
] as const;

describe('TurboProgCommandHandler', () => {
  let handler: TurboProgCommandHandler;
  let sheetsService: Mocked<SheetsService>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [TurboProgCommandHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    handler = fixture.get(TurboProgCommandHandler);
    sheetsService = fixture.get(SheetsService);
  });

  it('is defined', () => {
    expect(handler).toBeDefined();
  });

  it.each(
    approvedCases,
  )('should return allowed for $status $partyStatus signups', async (signup) => {
    const mockSignup = {
      ...signup,
      character: 'TestCharacter',
      discordId: 'testDiscordId',
      encounter: Encounter.DSR,
      expiresAt: {} as any,
      progPointRequested: 'RequestedProgPoint',
      reviewedBy: 'reviewer-id',
      role: 'TestRole',
      username: 'TestUser',
      world: 'TestWorld',
      progPoint: 'TestProgPoint',
    } as const;

    const options = turboProgSignupSchema.parse({
      encounter: Encounter.DSR,
    });

    // Pass the signup directly to isProggerAllowed
    const response = await handler.isProggerAllowed(
      options,
      'spreadsheetId',
      mockSignup,
    );

    expect(response).toEqual({
      allowed: true,
      data: expect.objectContaining({
        job: 'TestRole', // Check that role is properly mapped to job
        progPoint: 'TestProgPoint',
        character: 'TestCharacter',
      }),
    });
  });

  it.each(
    declinedCases,
  )('should return rejected for $status $partyStatus signups', async (signup) => {
    const mockSignup = {
      ...signup,
      character: 'TestCharacter',
      discordId: 'testDiscordId',
      encounter: Encounter.DSR,
      expiresAt: {} as any,
      progPointRequested: 'RequestedProgPoint',
      reviewedBy: 'reviewer-id',
      role: 'TestRole',
      username: 'TestUser',
      world: 'TestWorld',
      progPoint: 'TestProgPoint',
    } as const;

    const options = turboProgSignupSchema.parse({
      encounter: Encounter.DSR,
    });

    // Pass the signup directly to isProggerAllowed
    const response = await handler.isProggerAllowed(
      options,
      'spreadsheetId',
      mockSignup,
    );

    expect(response).toEqual({
      allowed: undefined,
      error: TURBO_PROG_SIGNUP_INVALID,
    });
  });

  it.each(
    searchableCases,
  )('should search the sheet for signups for $status $partyStatus signups', async (signup) => {
    const mockSignup = {
      ...signup,
      character: 'TestCharacter',
      discordId: 'testDiscordId',
      encounter: Encounter.DSR,
      expiresAt: {} as any,
      progPointRequested: 'RequestedProgPoint',
      role: 'TestRole',
      username: 'TestUser',
      world: 'TestWorld',
    } as unknown as SignupDocument;

    const options = turboProgSignupSchema.parse({
      encounter: Encounter.DSR,
    });

    // Spy on the findCharacterRowValues method
    const spy = vi.spyOn(handler as any, 'findCharacterRowValues');
    spy.mockImplementationOnce(() => Promise.resolve({}));

    // Pass the signup directly to isProggerAllowed
    await handler.isProggerAllowed(options, 'spreadsheetId', mockSignup);

    expect(spy).toHaveBeenCalledWith(options, 'spreadsheetId', mockSignup);
  });

  it('should handle character row values lookup correctly', async () => {
    // Mock the SheetsService response
    sheetsService.findCharacterRowValues.mockResolvedValueOnce([
      'TestCharacter',
      'World',
      'TestJob',
      'P4',
    ]);

    // Create options for the test
    const options = turboProgSignupSchema.parse({
      encounter: Encounter.DSR,
    });

    // Create a mock signup to pass directly
    const mockSignup = {
      encounter: Encounter.DSR,
      character: 'TestCharacter',
      world: 'TestWorld',
      discordId: 'testDiscordId',
    } as SignupDocument;

    // Call the private method directly
    const response = await (handler as any).findCharacterRowValues(
      options,
      'spreadsheetId',
      mockSignup,
    );

    // Verify the sheets service was called correctly
    expect(sheetsService.findCharacterRowValues).toHaveBeenCalledWith(
      expect.objectContaining({
        character: 'TestCharacter',
        world: 'TestWorld',
      }),
      'spreadsheetId',
    );

    // Check that the response is correct
    expect(response).toEqual({
      allowed: true,
      data: expect.objectContaining({
        job: 'TestJob',
        progPoint: 'P4',
        character: 'TestCharacter',
      }),
    });
  });

  it('should return error if no signups found for user', async () => {
    // Create options for the test
    const options = turboProgSignupSchema.parse({
      encounter: Encounter.DSR,
    });

    // Create a mock signup without required sheet data
    const mockSignup = {
      encounter: Encounter.DSR,
      character: 'TestCharacter',
      world: 'TestWorld',
      discordId: 'testDiscordId',
    } as SignupDocument;

    // Mock the sheet service to return null (no data found)
    sheetsService.findCharacterRowValues.mockResolvedValueOnce(
      null as unknown as string[],
    );

    // Call the private method directly
    const response = await (handler as any).findCharacterRowValues(
      options,
      'spreadsheetId',
      mockSignup,
    );

    expect(response).toEqual({
      allowed: undefined,
      error: expect.any(String),
    });
  });

  it('should return error if sheet data is in wrong format', async () => {
    // Create options for the test
    const options = turboProgSignupSchema.parse({
      encounter: Encounter.DSR,
    });

    // Create a mock signup
    const mockSignup = {
      encounter: Encounter.DSR,
      character: 'TestCharacter',
      world: 'TestWorld',
      discordId: 'testDiscordId',
    } as SignupDocument;

    // Mock the sheet service to return invalid data
    sheetsService.findCharacterRowValues.mockResolvedValueOnce([
      'Invalid',
      'Data',
    ]);

    // Call the private method directly with an expect-to-throw wrapper
    await expect(
      (handler as any).findCharacterRowValues(
        options,
        'spreadsheetId',
        mockSignup,
      ),
    ).rejects.toThrow(
      /Data found on Google Sheet is not in the correct format/,
    );
  });
});
