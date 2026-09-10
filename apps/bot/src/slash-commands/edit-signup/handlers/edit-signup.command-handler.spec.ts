import { EventBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import {
  Encounter,
  EncounterFriendlyDescription,
  PartyStatus,
  type ProgPointDocument,
  type SignupDocument,
  SignupStatus,
} from '@ulti-project/shared';
import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Message,
  StringSelectMenuInteraction,
  User,
} from 'discord.js';
import { Colors, StringSelectMenuBuilder } from 'discord.js';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { DiscordService } from '../../../discord/discord.service.js';
import { EncountersService } from '../../../encounters/encounters.service.js';
import { EncountersComponentsService } from '../../../encounters/encounters-components.service.js';
import { ErrorService } from '../../../error/error.service.js';
import { SettingsCollection } from '../../../firebase/collections/settings-collection.js';
import { SignupCollection } from '../../../firebase/collections/signup.collection.js';
import type { SettingsDocument } from '../../../firebase/models/settings.model.js';
import {
  createAutoMock,
  mockOf,
  partialMock,
} from '../../../test-utils/mock-factory.js';
import { DeclineReasonRequestService } from '../../signup/decline-reason-request.service.js';
import {
  SignupApprovedEvent,
  SignupDeclinedEvent,
} from '../../signup/events/signup.events.js';
import { SignupMutationService } from '../../signup/signup-mutation.service.js';
import { EDIT_SIGNUP_MESSAGES } from '../edit-signup.consts.js';
import { EditSignupCommandHandler } from './edit-signup.command-handler.js';

const PROG_POINTS: ProgPointDocument[] = [
  {
    id: 'P1',
    label: 'Phase 1',
    partyStatus: PartyStatus.ProgParty,
    order: 0,
    active: true,
  },
  {
    id: 'P2',
    label: 'Phase 2',
    partyStatus: PartyStatus.ClearParty,
    order: 1,
    active: true,
  },
];

const SETTINGS = {
  reviewerRole: 'reviewer-role',
  reviewChannel: 'review-channel',
  spreadsheetId: 'sheet-1',
};

type CollectorHandler = (...args: unknown[]) => unknown;

function createCollectorHarness() {
  const handlers = new Map<string, CollectorHandler>();

  const collector = mockOf<
    ReturnType<Message<true>['createMessageComponentCollector']>
  >({
    on: vi.fn((event: string, handler: CollectorHandler) => {
      handlers.set(event, handler);
    }),
    stop: vi.fn((reason?: string) => {
      handlers.get('end')?.([], reason ?? 'user');
    }),
  });

  return { collector, handlers };
}

function makeSignup(overrides: Partial<SignupDocument> = {}): SignupDocument {
  return partialMock<SignupDocument>({
    discordId: 'signup-user',
    character: 'tiny cat',
    world: 'jenova',
    encounter: Encounter.DSR,
    role: 'tank',
    progPoint: 'P1',
    progPointRequested: 'P1',
    status: SignupStatus.APPROVED,
    reviewMessageId: 'review-msg-1',
    username: 'tiny',
    ...overrides,
  });
}

function makeInteraction(
  opts: { user?: string; character?: string; encounter?: string } = {},
): Mocked<ChatInputCommandInteraction<'cached'>> {
  return mockOf<Mocked<ChatInputCommandInteraction<'cached'>>>({
    guildId: 'guild-1',
    user: mockOf<User>({
      id: 'reviewer-1',
      displayName: 'Reviewer One',
      toString: () => '<@reviewer-1>',
    }),
    options: {
      getUser: (key: string) =>
        key === 'user' && opts.user
          ? mockOf<User>({
              id: opts.user,
              toString: () => `<@${opts.user}>`,
            })
          : null,
      getString: (key: string) => {
        if (key === 'character') return opts.character ?? null;
        if (key === 'encounter') return opts.encounter ?? null;
        return null;
      },
    },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  });
}

function selectMenuInteraction(progPoint: string) {
  return mockOf<StringSelectMenuInteraction<'cached'>>({
    isStringSelectMenu: () => true,
    isButton: () => false,
    deferUpdate: vi.fn().mockResolvedValue(undefined),
    values: [progPoint],
  });
}

function buttonInteraction(customId: string) {
  return mockOf<ButtonInteraction<'cached'>>({
    isStringSelectMenu: () => false,
    isButton: () => true,
    deferUpdate: vi.fn().mockResolvedValue(undefined),
    customId,
  });
}

describe('Edit Signup Command Handler', () => {
  let command: EditSignupCommandHandler;
  let discordService: Mocked<DiscordService>;
  let settingsCollection: Mocked<SettingsCollection>;
  let signupCollection: Mocked<SignupCollection>;
  let encountersService: Mocked<EncountersService>;
  let encountersComponentsService: Mocked<EncountersComponentsService>;
  let mutationService: Mocked<SignupMutationService>;
  let declineReasonRequestService: Mocked<DeclineReasonRequestService>;
  let eventBus: Mocked<EventBus>;
  let errorService: Mocked<ErrorService>;
  let interaction: Mocked<ChatInputCommandInteraction<'cached'>>;
  let replyMessage: Mocked<Message<true>>;
  let reviewMessage: Mocked<Message<true>>;
  let handlers: Map<string, CollectorHandler>;

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [EditSignupCommandHandler],
    })
      .useMocker(createAutoMock)
      .compile();

    command = fixture.get(EditSignupCommandHandler);
    discordService = fixture.get(DiscordService);
    settingsCollection = fixture.get(SettingsCollection);
    signupCollection = fixture.get(SignupCollection);
    encountersService = fixture.get(EncountersService);
    encountersComponentsService = fixture.get(EncountersComponentsService);
    mutationService = fixture.get(SignupMutationService);
    declineReasonRequestService = fixture.get(DeclineReasonRequestService);
    eventBus = fixture.get(EventBus);
    errorService = fixture.get(ErrorService);

    const harness = createCollectorHarness();
    handlers = harness.handlers;

    replyMessage = createAutoMock<Message<true>>();
    replyMessage.createMessageComponentCollector.mockReturnValue(
      harness.collector,
    );
    replyMessage.awaitMessageComponent.mockResolvedValue(
      mockOf<ButtonInteraction<'cached'>>({ customId: 'confirm' }),
    );

    reviewMessage = createAutoMock<Message<true>>();
    reviewMessage.inGuild.mockReturnValue(true);

    interaction = makeInteraction({ user: 'signup-user' });
    interaction.editReply.mockResolvedValue(replyMessage);

    settingsCollection.getSettings.mockResolvedValue(
      partialMock<SettingsDocument>(SETTINGS),
    );
    discordService.userHasRole.mockResolvedValue(true);
    discordService.fetchMessage.mockResolvedValue(reviewMessage);
    encountersService.getProgPoints.mockResolvedValue(PROG_POINTS);
    encountersComponentsService.createProgPointSelectMenu.mockResolvedValue(
      new StringSelectMenuBuilder()
        .setCustomId('pp')
        .addOptions({ label: 'Phase 1', value: 'P1' }),
    );
    mutationService.buildConfirmedSignup.mockResolvedValue(
      makeSignup({ progPoint: 'P2' }),
    );
    errorService.handleCommandError.mockReturnValue(mockOf<EmbedBuilder>({}));
    signupCollection.findAll.mockResolvedValue([makeSignup()]);
    signupCollection.findByStatusIn.mockResolvedValue([]);
  });

  /** Wait until the form collector is wired, then feed it interactions. */
  async function drive(opts: {
    progPoint?: string;
    decision?: 'approve' | 'decline';
    endReason?: string;
  }): Promise<void> {
    await vi.waitFor(() => {
      expect(handlers.has('collect')).toBe(true);
      expect(handlers.has('end')).toBe(true);
    });

    const collect = handlers.get('collect');
    if (!collect) throw new Error('collect handler was never registered');

    if (opts.progPoint !== undefined) {
      await collect(selectMenuInteraction(opts.progPoint));
    }

    if (opts.decision) {
      await collect(
        buttonInteraction(
          opts.decision === 'approve' ? 'edit-approve' : 'edit-decline',
        ),
      );
    }

    if (opts.endReason) {
      handlers.get('end')?.([], opts.endReason);
    }
  }

  it('is defined', () => {
    expect(command).toBeDefined();
  });

  it('rejects when neither user nor character is provided', async () => {
    const bare = makeInteraction({});
    bare.editReply.mockResolvedValue(replyMessage);

    await command.execute(bare);

    expect(bare.editReply).toHaveBeenCalledWith({
      embeds: [
        {
          data: {
            title: 'Edit Signup - Validation Error',
            description:
              'Provide either a user or a character name, not both / neither',
            color: Colors.Red,
          },
        },
      ],
    });
    expect(signupCollection.findAll).not.toHaveBeenCalled();
  });

  it('rejects when both user and character are provided', async () => {
    const both = makeInteraction({
      user: 'signup-user',
      character: 'tiny cat',
    });
    both.editReply.mockResolvedValue(replyMessage);

    await command.execute(both);

    expect(both.editReply).toHaveBeenCalledWith({
      embeds: [
        {
          data: {
            title: 'Edit Signup - Validation Error',
            description:
              'Provide either a user or a character name, not both / neither',
            color: Colors.Red,
          },
        },
      ],
    });
  });

  it('refuses a non-reviewer and never looks up a signup', async () => {
    discordService.userHasRole.mockResolvedValue(false);

    await command.execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith({
      embeds: [
        {
          data: {
            color: Colors.Red,
            description: EDIT_SIGNUP_MESSAGES.MISSING_PERMISSIONS,
          },
        },
      ],
      components: [],
    });
    expect(signupCollection.findAll).not.toHaveBeenCalled();
    expect(signupCollection.findByStatusIn).not.toHaveBeenCalled();
  });

  it('errors when the guild has no reviewer settings', async () => {
    settingsCollection.getSettings.mockResolvedValue(undefined);

    await command.execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith({
      embeds: [
        {
          data: {
            color: Colors.Red,
            description: EDIT_SIGNUP_MESSAGES.MISSING_SETTINGS,
          },
        },
      ],
      components: [],
    });
  });

  it('shows the edit form for a single reviewed signup found by user', async () => {
    signupCollection.findAll.mockResolvedValue([makeSignup()]);

    const executePromise = command.execute(interaction);
    await drive({ endReason: 'time' });
    await executePromise;

    expect(signupCollection.findAll).toHaveBeenCalledWith({
      discordId: 'signup-user',
    });
    expect(replyMessage.createMessageComponentCollector).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: [
          expect.objectContaining({
            data: expect.objectContaining({
              title: `Edit Signup — ${EncounterFriendlyDescription[Encounter.DSR]}`,
            }),
          }),
        ],
      }),
    );
  });

  it('finds a reviewed signup by character name, case-insensitively', async () => {
    const byChar = makeInteraction({ character: 'TINY CAT' });
    byChar.editReply.mockResolvedValue(replyMessage);
    signupCollection.findByStatusIn.mockResolvedValue([
      makeSignup({ character: 'Tiny Cat' }),
    ]);

    const executePromise = command.execute(byChar);
    await drive({ endReason: 'time' });
    await executePromise;

    expect(signupCollection.findByStatusIn).toHaveBeenCalledWith([
      SignupStatus.APPROVED,
      SignupStatus.DECLINED,
    ]);
    expect(replyMessage.createMessageComponentCollector).toHaveBeenCalled();
  });

  it('replies NOT_FOUND when no reviewed signup matches', async () => {
    signupCollection.findAll.mockResolvedValue([]);

    await command.execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith({
      embeds: [
        {
          data: {
            color: Colors.Red,
            description: EDIT_SIGNUP_MESSAGES.NOT_FOUND,
          },
        },
      ],
      components: [],
    });
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('replies AMBIGUOUS when more than one reviewed signup matches', async () => {
    signupCollection.findAll.mockResolvedValue([
      makeSignup({ encounter: Encounter.DSR }),
      makeSignup({ encounter: Encounter.TOP }),
    ]);

    await command.execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith({
      embeds: [
        {
          data: {
            color: Colors.Red,
            description: EDIT_SIGNUP_MESSAGES.AMBIGUOUS,
          },
        },
      ],
      components: [],
    });
  });

  it('disambiguates with the encounter option', async () => {
    const disambig = makeInteraction({
      user: 'signup-user',
      encounter: Encounter.DSR,
    });
    disambig.editReply.mockResolvedValue(replyMessage);
    signupCollection.findAll.mockResolvedValue([
      makeSignup({ encounter: Encounter.DSR }),
      makeSignup({ encounter: Encounter.TOP }),
    ]);

    const executePromise = command.execute(disambig);
    await drive({ endReason: 'time' });
    await executePromise;

    expect(replyMessage.createMessageComponentCollector).toHaveBeenCalled();
    expect(disambig.editReply).not.toHaveBeenCalledWith({
      embeds: [
        {
          data: {
            color: Colors.Red,
            description: EDIT_SIGNUP_MESSAGES.AMBIGUOUS,
          },
        },
      ],
      components: [],
    });
  });

  it('stops with REVIEW_MESSAGE_MISSING when the review message is gone', async () => {
    discordService.fetchMessage.mockResolvedValue(undefined);

    await command.execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith({
      embeds: [
        {
          data: {
            color: Colors.Red,
            description: EDIT_SIGNUP_MESSAGES.REVIEW_MESSAGE_MISSING,
          },
        },
      ],
      components: [],
    });
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('applies an APPROVED→APPROVED prog point change and publishes SignupApprovedEvent', async () => {
    const signup = makeSignup({
      status: SignupStatus.APPROVED,
      progPoint: 'P1',
    });
    signupCollection.findAll.mockResolvedValue([signup]);
    const confirmed = makeSignup({
      progPoint: 'P2',
      partyStatus: PartyStatus.ClearParty,
    });
    mutationService.buildConfirmedSignup.mockResolvedValue(confirmed);

    const executePromise = command.execute(interaction);
    await drive({ progPoint: 'P2', decision: 'approve' });
    await executePromise;

    expect(mutationService.buildConfirmedSignup).toHaveBeenCalledWith(
      signup,
      'P2',
    );
    expect(mutationService.applyApproval).toHaveBeenCalledWith(
      confirmed,
      expect.objectContaining({ reviewChannel: 'review-channel' }),
      interaction.user,
    );
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.any(SignupApprovedEvent),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        signup: confirmed,
        message: reviewMessage,
        kind: 'edit',
      }),
    );
    expect(errorService.handleCommandError).not.toHaveBeenCalled();
  });

  it('flips APPROVED→DECLINED, publishes SignupDeclinedEvent and DMs the reviewer the decline-reason picker', async () => {
    signupCollection.findAll.mockResolvedValue([
      makeSignup({ status: SignupStatus.APPROVED }),
    ]);

    const executePromise = command.execute(interaction);
    await drive({ decision: 'decline' });
    await executePromise;

    expect(mutationService.applyDecline).toHaveBeenCalledWith(
      expect.objectContaining({ status: SignupStatus.APPROVED }),
      interaction.user,
    );
    expect(mutationService.applyApproval).not.toHaveBeenCalled();
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.any(SignupDeclinedEvent),
    );
    expect(
      declineReasonRequestService.requestDeclineReason,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ status: SignupStatus.APPROVED }),
      interaction.user,
      reviewMessage,
    );
  });

  it('does not request a decline reason on the approve path', async () => {
    signupCollection.findAll.mockResolvedValue([
      makeSignup({ status: SignupStatus.APPROVED, progPoint: 'P1' }),
    ]);
    mutationService.buildConfirmedSignup.mockResolvedValue(
      makeSignup({ progPoint: 'P2' }),
    );

    const executePromise = command.execute(interaction);
    await drive({ progPoint: 'P2', decision: 'approve' });
    await executePromise;

    expect(
      declineReasonRequestService.requestDeclineReason,
    ).not.toHaveBeenCalled();
  });

  it('still resolves and replies success when requestDeclineReason rejects', async () => {
    signupCollection.findAll.mockResolvedValue([
      makeSignup({ status: SignupStatus.APPROVED }),
    ]);
    declineReasonRequestService.requestDeclineReason.mockRejectedValue(
      new Error('DM failed'),
    );

    const executePromise = command.execute(interaction);
    await drive({ decision: 'decline' });
    await expect(executePromise).resolves.toBeUndefined();

    expect(mutationService.applyDecline).toHaveBeenCalled();
    expect(errorService.handleCommandError).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: [
          expect.objectContaining({
            data: expect.objectContaining({
              title: EDIT_SIGNUP_MESSAGES.SUCCESS_TITLE,
            }),
          }),
        ],
      }),
    );
  });

  it('ignores a prog-point pick when the decision is decline', async () => {
    signupCollection.findAll.mockResolvedValue([
      makeSignup({ status: SignupStatus.APPROVED, progPoint: 'P1' }),
    ]);

    const executePromise = command.execute(interaction);
    await drive({ progPoint: 'P2', decision: 'decline' });
    await executePromise;

    // decline persists status only — the menu pick must not leak through
    expect(mutationService.buildConfirmedSignup).not.toHaveBeenCalled();
    expect(mutationService.applyApproval).not.toHaveBeenCalled();
    expect(mutationService.applyDecline).toHaveBeenCalledWith(
      expect.objectContaining({ status: SignupStatus.APPROVED }),
      interaction.user,
    );
  });

  it('flips DECLINED→APPROVED with a prog point', async () => {
    signupCollection.findAll.mockResolvedValue([
      makeSignup({ status: SignupStatus.DECLINED, progPoint: 'P1' }),
    ]);
    const confirmed = makeSignup({
      status: SignupStatus.DECLINED,
      progPoint: 'P2',
    });
    mutationService.buildConfirmedSignup.mockResolvedValue(confirmed);

    const executePromise = command.execute(interaction);
    await drive({ progPoint: 'P2', decision: 'approve' });
    await executePromise;

    expect(mutationService.buildConfirmedSignup).toHaveBeenCalledWith(
      expect.objectContaining({ status: SignupStatus.DECLINED }),
      'P2',
    );
    expect(mutationService.applyApproval).toHaveBeenCalled();
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.any(SignupApprovedEvent),
    );
  });

  it('replies NO_CHANGES and publishes nothing for a no-op edit', async () => {
    signupCollection.findAll.mockResolvedValue([
      makeSignup({ status: SignupStatus.APPROVED, progPoint: 'P1' }),
    ]);

    const executePromise = command.execute(interaction);
    await drive({ decision: 'approve' });
    await executePromise;

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: EDIT_SIGNUP_MESSAGES.NO_CHANGES,
      embeds: [],
      components: [],
    });
    expect(eventBus.publish).not.toHaveBeenCalled();
    expect(mutationService.applyApproval).not.toHaveBeenCalled();
  });

  it('publishes nothing when the reviewer cancels at the confirmation step', async () => {
    signupCollection.findAll.mockResolvedValue([
      makeSignup({ status: SignupStatus.APPROVED, progPoint: 'P1' }),
    ]);
    replyMessage.awaitMessageComponent.mockResolvedValue(
      mockOf<ButtonInteraction<'cached'>>({ customId: 'cancel' }),
    );

    const executePromise = command.execute(interaction);
    await drive({ progPoint: 'P2', decision: 'approve' });
    await executePromise;

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: EDIT_SIGNUP_MESSAGES.CANCELLED,
      embeds: [],
      components: [],
    });
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('reports a timeout when the reviewer never submits the form', async () => {
    signupCollection.findAll.mockResolvedValue([makeSignup()]);

    const executePromise = command.execute(interaction);
    await drive({ endReason: 'time' });
    await executePromise;

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: EDIT_SIGNUP_MESSAGES.TIMEOUT,
      embeds: [],
      components: [],
    });
    expect(eventBus.publish).not.toHaveBeenCalled();
  });
});
