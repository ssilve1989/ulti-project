import { type DeepMocked, createMock } from '@golevelup/ts-vitest';
import { Test } from '@nestjs/testing';
import { Encounter } from '../../../../encounters/encounters.consts.js';
import { SignupCollection } from '../../../../firebase/collections/signup.collection.js';
import {
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '../../../../firebase/models/signup.model.js';
import { SheetsService } from '../../../../sheets/sheets.service.js';
import { turboProgSignupSchema } from '../../turbo-prog-signup.schema.js';
import { TURBO_PROG_SIGNUP_INVALID } from '../../turboprog.consts.js';
import { TurboProgCommandHandler } from './turbo-prog.command-handler.js';

const approvedCases: Pick<SignupDocument, 'status' | 'partyStatus'>[] = [
  { status: SignupStatus.APPROVED, partyStatus: PartyStatus.ClearParty },
  { status: SignupStatus.APPROVED, partyStatus: PartyStatus.ProgParty },
];

const declinedCases: Pick<SignupDocument, 'status' | 'partyStatus'>[] = [
  { status: SignupStatus.APPROVED, partyStatus: PartyStatus.EarlyProgParty },
  // any where status is cleared
  { status: SignupStatus.APPROVED, partyStatus: PartyStatus.Cleared },
  { status: SignupStatus.PENDING, partyStatus: PartyStatus.Cleared },
  { status: SignupStatus.UPDATE_PENDING, partyStatus: PartyStatus.Cleared },
  { status: SignupStatus.DECLINED, partyStatus: PartyStatus.Cleared },
];

const searchableCases: Pick<SignupDocument, 'status' | 'partyStatus'>[] = [
  { status: SignupStatus.APPROVED, partyStatus: undefined },
  // any pending signups might have had one prior to the bot and need to look at the sheet
  { status: SignupStatus.PENDING, partyStatus: PartyStatus.ClearParty },
  { status: SignupStatus.PENDING, partyStatus: PartyStatus.ProgParty },
  { status: SignupStatus.PENDING, partyStatus: PartyStatus.EarlyProgParty },
  { status: SignupStatus.PENDING, partyStatus: undefined },
  { status: SignupStatus.UPDATE_PENDING, partyStatus: PartyStatus.ClearParty },
  { status: SignupStatus.UPDATE_PENDING, partyStatus: PartyStatus.ProgParty },
  {
    status: SignupStatus.UPDATE_PENDING,
    partyStatus: PartyStatus.EarlyProgParty,
  },
  { status: SignupStatus.UPDATE_PENDING, partyStatus: undefined },
  // any signups that have been declined may be getting declined for a different reason
  // and could still have a prior valid signup on the sheet
  { status: SignupStatus.DECLINED, partyStatus: PartyStatus.ClearParty },
  { status: SignupStatus.DECLINED, partyStatus: PartyStatus.ProgParty },
  { status: SignupStatus.DECLINED, partyStatus: PartyStatus.EarlyProgParty },
  { status: SignupStatus.DECLINED, partyStatus: undefined },
];

describe('TurboProgCommandHandler', () => {
  let handler: TurboProgCommandHandler;
  let collection: DeepMocked<SignupCollection>;
  let sheetsService: DeepMocked<SheetsService>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [TurboProgCommandHandler],
    })
      .useMocker(() => createMock())
      .compile();

    handler = fixture.get(TurboProgCommandHandler);
    collection = fixture.get(SignupCollection);
    sheetsService = fixture.get(SheetsService);
  });

  it('is defined', () => {
    expect(handler).toBeDefined();
  });

  it.each(approvedCases)(
    'should return allowed for $status $partyStatus signups',
    async (signup) => {
      // Include role in the mock to ensure it's used properly in mapSignupToRowData
      const mockSignup = createMock<SignupDocument>({
        ...signup,
        partyType: undefined,
        role: 'TestRole',
        progPoint: 'TestProgPoint',
        character: 'TestCharacter',
        encounter: Encounter.DSR,
        discordId: 'testDiscordId',
      });

      const options = turboProgSignupSchema.parse({
        availability: 'Weekends',
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
    },
  );

  it.each(declinedCases)(
    'should return rejected for $status $partyStatus signups',
    async (signup) => {
      const mockSignup = createMock<SignupDocument>({
        ...signup,
        partyType: undefined,
        encounter: Encounter.DSR,
        discordId: 'testDiscordId',
      });

      const options = turboProgSignupSchema.parse({
        availability: 'Weekends',
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
    },
  );

  it.each(searchableCases)(
    'should search the sheet for signups for $status $partyStatus signups',
    async (signup) => {
      const mockSignup = createMock<SignupDocument>({
        ...signup,
        partyType: undefined,
        encounter: Encounter.DSR,
        discordId: 'testDiscordId',
        character: 'TestCharacter',
        world: 'TestWorld',
      });

      const options = turboProgSignupSchema.parse({
        availability: 'Weekends',
        encounter: Encounter.DSR,
      });

      // Spy on the findCharacterRowValues method
      const spy = vi.spyOn(handler as any, 'findCharacterRowValues');
      spy.mockImplementationOnce(() => Promise.resolve({}));

      // Pass the signup directly to isProggerAllowed
      await handler.isProggerAllowed(options, 'spreadsheetId', mockSignup);

      expect(spy).toHaveBeenCalledWith(options, 'spreadsheetId', mockSignup);
    },
  );

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
      availability: 'Weekends',
      encounter: Encounter.DSR,
    });

    // Create a mock signup to pass directly
    const mockSignup = createMock<SignupDocument>({
      encounter: Encounter.DSR,
      character: 'TestCharacter',
      world: 'TestWorld',
      discordId: 'testDiscordId',
    });

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
      availability: 'Weekends',
      encounter: Encounter.DSR,
    });

    // Create a mock signup without required sheet data
    const mockSignup = createMock<SignupDocument>({
      encounter: Encounter.DSR,
      character: 'TestCharacter',
      world: 'TestWorld',
      discordId: 'testDiscordId',
    });

    // Mock the sheet service to return null (no data found)
    sheetsService.findCharacterRowValues.mockResolvedValueOnce(null);

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
      availability: 'Weekends',
      encounter: Encounter.DSR,
    });

    // Create a mock signup
    const mockSignup = createMock<SignupDocument>({
      encounter: Encounter.DSR,
      character: 'TestCharacter',
      world: 'TestWorld',
      discordId: 'testDiscordId',
    });

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
      // biome-ignore lint/performance/useTopLevelRegex: <explanation>
      /Data found on Google Sheet is not in the correct format/,
    );
  });
});
