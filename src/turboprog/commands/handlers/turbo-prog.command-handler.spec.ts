import { type DeepMocked, createMock } from '@golevelup/ts-vitest';
import { Test } from '@nestjs/testing';
import { SignupCollection } from '../../../firebase/collections/signup.collection.js';
import {
  PartyStatus,
  type SignupDocument,
  SignupStatus,
} from '../../../firebase/models/signup.model.js';
import { TURBO_PROG_SIGNUP_INVALID } from '../../turboprog.consts.js';
import { TurboProgCommandHandler } from './turbo-prog.command-handler.js';

const approvedCases: Pick<SignupDocument, 'status' | 'partyStatus'>[] = [
  { status: SignupStatus.APPROVED, partyStatus: PartyStatus.ClearParty },
];

const declinedCases: Pick<SignupDocument, 'status' | 'partyStatus'>[] = [
  { status: SignupStatus.APPROVED, partyStatus: PartyStatus.EarlyProgParty },
  // any where status is cleared
  { status: SignupStatus.APPROVED, partyStatus: PartyStatus.Cleared },
  { status: SignupStatus.APPROVED, partyStatus: PartyStatus.ProgParty },
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

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [TurboProgCommandHandler],
    })
      .useMocker(() => createMock())
      .compile();

    handler = fixture.get(TurboProgCommandHandler);
    collection = fixture.get(SignupCollection);
  });

  it('is defined', () => {
    expect(handler).toBeDefined();
  });

  it.each(approvedCases)(
    'should return allowed for $status $partyStatus signups',
    async (signup) => {
      collection.findOne.mockResolvedValueOnce(
        createMock<SignupDocument>({ ...signup, partyType: undefined }),
      );

      const response = await handler.isProggerAllowed(
        createMock(),
        'spreadsheetId',
      );

      expect(response).toEqual({
        allowed: true,
        data: expect.any(Object),
      });
    },
  );

  it.each(declinedCases)(
    'should return rejected for $status $partyStatus signups',
    async (signup) => {
      collection.findOne.mockResolvedValueOnce(
        createMock<SignupDocument>({ ...signup, partyType: undefined }),
      );

      const response = await handler.isProggerAllowed(
        createMock(),
        'spreadsheetId',
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
      collection.findOne.mockResolvedValueOnce(
        createMock<SignupDocument>({ ...signup, partyType: undefined }),
      );

      const spy = vi.spyOn(handler, 'findCharacterRowValues' as any);
      spy.mockImplementationOnce(() => Promise.resolve({}));

      await handler.isProggerAllowed(createMock(), 'spreadsheetId');

      expect(spy).toHaveBeenCalled();
    },
  );
});
