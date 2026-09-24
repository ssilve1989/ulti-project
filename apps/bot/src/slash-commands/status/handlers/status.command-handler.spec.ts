import { Test } from '@nestjs/testing';
import {
  Encounter,
  PartyStatus,
  type ProgPointDocument,
  type SignupDocument,
  SignupStatus,
} from '@ulti-project/shared';
import type {
  ChatInputCommandInteraction,
  InteractionEditReplyOptions,
} from 'discord.js';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mocked,
  vi,
} from 'vitest';
import type { EncountersService } from '../../../encounters/encounters.service.js';
import {
  createAutoMock,
  mockOf,
  partialMock,
} from '../../../test-utils/mock-factory.js';
import type { StatusService } from '../status.service.js';
import type { StatusCommandHandler } from './status.command-handler.js';

const captureMessage = vi.fn();

const DSR_PROG_POINTS = [
  partialMock<ProgPointDocument>({
    id: 'P6 Wroth Flames',
    label: 'Phase 6: Wroth Flames',
  }),
  partialMock<ProgPointDocument>({
    id: 'P7 Dragon King',
    label: 'Phase 7: Dragon King Thordan',
  }),
];

const TOP_PROG_POINTS = [
  partialMock<ProgPointDocument>({ id: 'P5 Delta', label: 'Phase 5: Delta' }),
];

function createSignup(overrides: Partial<SignupDocument>): SignupDocument {
  return partialMock<SignupDocument>({
    discordId: '1',
    encounter: Encounter.DSR,
    status: SignupStatus.APPROVED,
    progPointRequested: 'requested value',
    ...overrides,
  });
}

describe('StatusCommandHandler', () => {
  let handler: StatusCommandHandler;
  let statusService: Mocked<StatusService>;
  let encountersService: Mocked<EncountersService>;
  let editReply: ReturnType<
    typeof vi.fn<(options: InteractionEditReplyOptions) => Promise<void>>
  >;
  let interaction: ChatInputCommandInteraction<'cached'>;
  let EmbedBuilder: typeof import('discord.js')['EmbedBuilder'];

  beforeEach(async () => {
    // The suite runs with `isolate: false`, so a hoisted vi.mock of Sentry would
    // leak into later spec files. Mock it for this file only, and re-import the
    // handler (plus the DI tokens and discord.js it uses) from a fresh graph.
    // @SentryTraced forks the scope, so the handler's scope can't be spied on directly.
    vi.resetModules();
    vi.doMock('@sentry/nestjs', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@sentry/nestjs')>()),
      getCurrentScope: () => ({ setContext: vi.fn(), captureMessage }),
    }));
    ({ EmbedBuilder } = await import('discord.js'));
    const { StatusCommandHandler } = await import(
      './status.command-handler.js'
    );
    const { StatusService } = await import('../status.service.js');
    const { EncountersService } = await import(
      '../../../encounters/encounters.service.js'
    );

    const fixture = await Test.createTestingModule({
      providers: [StatusCommandHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    handler = fixture.get(StatusCommandHandler);
    statusService = fixture.get(StatusService);
    encountersService = fixture.get(EncountersService);

    encountersService.getAllProgPoints.mockImplementation((encounterId) => {
      switch (encounterId) {
        case Encounter.DSR:
          return Promise.resolve(DSR_PROG_POINTS);
        case Encounter.TOP:
          return Promise.resolve(TOP_PROG_POINTS);
        default:
          return Promise.resolve([]);
      }
    });

    editReply = vi.fn().mockResolvedValue(undefined);
    interaction = mockOf<ChatInputCommandInteraction<'cached'>>({
      user: { id: '1' },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply,
    });

    captureMessage.mockClear();
  });

  afterEach(() => {
    vi.doUnmock('@sentry/nestjs');
    vi.resetModules();
  });

  async function getReplyFields() {
    await handler.execute(interaction);
    const [options] = editReply.mock.calls[0];
    const embed = options.embeds?.find((e) => e instanceof EmbedBuilder);
    return embed?.toJSON().fields ?? [];
  }

  it('shows the label of the approved prog point, not the requested one', async () => {
    statusService.getSignups.mockResolvedValue([
      createSignup({
        progPoint: 'P7 Dragon King',
        partyStatus: PartyStatus.ProgParty,
      }),
    ]);

    const fields = await getReplyFields();

    expect(fields).toContainEqual({
      name: 'Prog Point',
      value: 'Phase 7: Dragon King Thordan',
      inline: false,
    });
    expect(JSON.stringify(fields)).not.toContain('requested value');
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('omits the prog point field when the signup has no approved prog point', async () => {
    statusService.getSignups.mockResolvedValue([
      createSignup({ status: SignupStatus.PENDING }),
    ]);

    const fields = await getReplyFields();

    expect(fields.map((f) => f.name)).not.toContain('Prog Point');
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('omits the field and warns Sentry when the prog point id is unknown', async () => {
    statusService.getSignups.mockResolvedValue([
      createSignup({ progPoint: 'deleted-prog-point' }),
    ]);

    const fields = await getReplyFields();

    expect(fields.map((f) => f.name)).toEqual(['Encounter', 'Status', '​']);
    expect(JSON.stringify(fields)).not.toContain('deleted-prog-point');
    expect(captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('deleted-prog-point'),
      'warning',
    );
  });

  it('resolves each signup against its own encounter', async () => {
    statusService.getSignups.mockResolvedValue([
      createSignup({ encounter: Encounter.DSR, progPoint: 'P6 Wroth Flames' }),
      createSignup({ encounter: Encounter.TOP, progPoint: 'P5 Delta' }),
    ]);

    const fields = await getReplyFields();

    expect(
      fields.filter((f) => f.name === 'Prog Point').map((f) => f.value),
    ).toEqual(['Phase 6: Wroth Flames', 'Phase 5: Delta']);
  });
});
