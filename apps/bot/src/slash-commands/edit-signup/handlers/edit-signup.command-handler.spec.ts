import type { LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  Encounter,
  EncounterFriendlyDescription,
  PartyStatus,
  type ProgPointDocument,
  type SignupDocument,
  SignupStatus,
} from '@ulti-project/shared';
import {
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  DiscordAPIError,
  DiscordjsErrorCodes,
  EmbedBuilder,
  type Message,
  type MessageComponentInteraction,
  MessageFlags,
  type ModalMessageModalSubmitInteraction,
  StringSelectMenuBuilder,
  type StringSelectMenuInteraction,
  type User,
} from 'discord.js';
import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { DiscordService } from '../../../discord/discord.service.js';
import { PROG_POINT_SELECT_ID } from '../../../encounters/encounters.components.js';
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
import {
  EDIT_CANCEL_BUTTON_ID,
  EDIT_SAVE_BUTTON_ID,
  EDIT_SAVE_WITH_COMMENT_BUTTON_ID,
  EDIT_SIGNUP_MESSAGES,
} from '../edit-signup.consts.js';
import {
  type ApplyEditResult,
  EditSignupService,
} from '../edit-signup.service.js';
import { EditSignupCommandHandler } from './edit-signup.command-handler.js';

// Stands in for discord.js's InteractionCollector: a single long-lived
// listener, so tests drive the same lifecycle production code relies on.
function buildFakeCollector() {
  let collect: ((interaction: MessageComponentInteraction) => unknown) | null =
    null;
  let end: ((collected: unknown, reason: string) => void) | null = null;
  let ended = false;
  let resolveReady: () => void;
  // the collector is created only after several awaited reads, so tests wait
  // until both `.on()` registrations have happened
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  const stop = vi.fn(() => {
    if (ended) return;
    ended = true;
    end?.(new Map(), 'user');
  });

  const on = vi.fn((event: string, handler: (...args: never[]) => unknown) => {
    if (event === 'collect') {
      // biome-ignore lint/nursery/noUnsafeTypeAssertion: narrowing a generic EventEmitter handler back to this fake collector's known event shape, matches project convention
      collect = handler as (
        interaction: MessageComponentInteraction,
      ) => unknown;
    }
    if (event === 'end') {
      // biome-ignore lint/nursery/noUnsafeTypeAssertion: narrowing a generic EventEmitter handler back to this fake collector's known event shape
      end = handler as (collected: unknown, reason: string) => void;
      resolveReady();
    }
  });

  return {
    fake: { on, stop },
    collect: async (interaction: MessageComponentInteraction) => {
      await ready;
      await collect?.(interaction);
    },
    timeOut: async () => {
      await ready;
      if (ended) return;
      ended = true;
      end?.(new Map(), 'time');
    },
  };
}

describe('EditSignupCommandHandler', () => {
  let command: EditSignupCommandHandler;
  let interaction: Mocked<ChatInputCommandInteraction<'cached'>>;
  let settingsCollection: Mocked<SettingsCollection>;
  let discordService: Mocked<DiscordService>;
  let signupCollection: Mocked<SignupCollection>;
  let encountersService: Mocked<EncountersService>;
  let encountersComponentsService: Mocked<EncountersComponentsService>;
  let editSignupService: Mocked<EditSignupService>;
  let errorService: Mocked<ErrorService>;
  let collector: ReturnType<typeof buildFakeCollector>;
  let menu: StringSelectMenuBuilder;
  let editor: User;
  let editorSend: ReturnType<typeof vi.fn>;

  const updateTime = Timestamp.fromMillis(5_000);
  const settings = partialMock<SettingsDocument>({
    reviewerRole: 'reviewer-role',
    reviewChannel: 'review-channel',
  });

  const approved = partialMock<SignupDocument>({
    discordId: 'applicant-1',
    encounter: Encounter.DSR,
    character: 'faye valentine',
    world: 'gilgamesh',
    status: SignupStatus.APPROVED,
    progPointRequested: 'P3',
    progPoint: 'P2',
    partyStatus: PartyStatus.ProgParty,
    reviewMessageId: 'review-msg',
    reviewedBy: 'spike',
  });

  const progPoints = [
    partialMock<ProgPointDocument>({
      id: 'P2',
      label: 'P2 Light Rampant',
      partyStatus: PartyStatus.ProgParty,
      order: 1,
      active: true,
    }),
    partialMock<ProgPointDocument>({
      id: 'P4',
      label: 'P4 Crystallize Time',
      partyStatus: PartyStatus.ClearParty,
      order: 2,
      active: true,
    }),
  ];

  const selectInteraction = (progPoint: string) => {
    const update = vi.fn().mockResolvedValue(undefined);
    return {
      update,
      interaction: mockOf<StringSelectMenuInteraction>({
        customId: PROG_POINT_SELECT_ID,
        values: [progPoint],
        isStringSelectMenu: () => true,
        isButton: () => false,
        update,
      }),
    };
  };

  const buttonInteraction = (
    customId: string,
    overrides: Partial<Record<keyof ButtonInteraction, unknown>> = {},
  ) => {
    const update = vi.fn().mockResolvedValue(undefined);
    return {
      update,
      interaction: mockOf<ButtonInteraction>({
        customId,
        user: editor,
        message: { id: 'screen-message' },
        isStringSelectMenu: () => false,
        isButton: () => true,
        update,
        ...overrides,
      }),
    };
  };

  const commitButtons = (disabled: boolean) =>
    expect.objectContaining({
      components: [
        expect.objectContaining({
          data: expect.objectContaining({
            custom_id: EDIT_SAVE_BUTTON_ID,
            disabled,
          }),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            custom_id: EDIT_SAVE_WITH_COMMENT_BUTTON_ID,
            disabled,
          }),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            custom_id: EDIT_CANCEL_BUTTON_ID,
            disabled: false,
          }),
        }),
      ],
    });

  const guardReply = (description: string) => ({
    embeds: [
      expect.objectContaining({
        data: expect.objectContaining({ description }),
      }),
    ],
  });

  const selectedDefaults = () =>
    menu.options.map((option) => option.data.default);

  beforeEach(async () => {
    const fixture = await Test.createTestingModule({
      providers: [EditSignupCommandHandler],
    })
      .useMocker(createAutoMock)
      .setLogger(createAutoMock<LoggerService>())
      .compile();

    command = fixture.get(EditSignupCommandHandler);
    settingsCollection = fixture.get(SettingsCollection);
    discordService = fixture.get(DiscordService);
    signupCollection = fixture.get(SignupCollection);
    encountersService = fixture.get(EncountersService);
    encountersComponentsService = fixture.get(EncountersComponentsService);
    editSignupService = fixture.get(EditSignupService);
    errorService = fixture.get(ErrorService);

    collector = buildFakeCollector();
    menu = new StringSelectMenuBuilder()
      .setCustomId(PROG_POINT_SELECT_ID)
      .addOptions(
        { label: 'P2 Light Rampant', value: 'P2' },
        { label: 'P4 Crystallize Time', value: 'P4' },
      );
    editorSend = vi.fn().mockResolvedValue(undefined);
    editor = mockOf<User>({ id: 'editor-1', send: editorSend });

    interaction = mockOf<Mocked<ChatInputCommandInteraction<'cached'>>>({
      guildId: 'guild-1',
      user: editor,
      options: {
        getUser: vi.fn().mockReturnValue({ id: 'applicant-1' }),
        getString: vi.fn().mockReturnValue(Encounter.DSR),
      },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(
        mockOf<Message<true>>({
          createMessageComponentCollector: vi
            .fn()
            .mockReturnValue(collector.fake),
        }),
      ),
    });

    settingsCollection.getSettings.mockResolvedValue(settings);
    discordService.userHasRole.mockResolvedValue(true);
    signupCollection.findByKeyWithVersion.mockResolvedValue({
      signup: approved,
      updateTime,
    });
    encountersService.getProgPoints.mockResolvedValue(progPoints);
    encountersComponentsService.createProgPointSelectMenu.mockResolvedValue(
      menu,
    );
    editSignupService.apply.mockResolvedValue({ type: 'saved' });
    errorService.handleCommandError.mockReturnValue(
      new EmbedBuilder().setDescription('Something went wrong'),
    );
  });

  describe('guards', () => {
    it('defers an ephemeral reply and requires a configured reviewer role', async () => {
      settingsCollection.getSettings.mockResolvedValue(
        partialMock<SettingsDocument>({}),
      );

      await command.execute(interaction);

      expect(interaction.deferReply).toHaveBeenCalledWith({
        flags: MessageFlags.Ephemeral,
      });
      expect(interaction.editReply).toHaveBeenCalledWith(
        guardReply(EDIT_SIGNUP_MESSAGES.MISSING_REVIEWER_ROLE),
      );
      expect(signupCollection.findByKeyWithVersion).not.toHaveBeenCalled();
    });

    it('rejects a member without the reviewer role', async () => {
      discordService.userHasRole.mockResolvedValue(false);

      await command.execute(interaction);

      expect(discordService.userHasRole).toHaveBeenCalledWith({
        userId: 'editor-1',
        roleId: 'reviewer-role',
        guildId: 'guild-1',
      });
      expect(interaction.editReply).toHaveBeenCalledWith(
        guardReply(EDIT_SIGNUP_MESSAGES.NOT_A_REVIEWER),
      );
    });

    it('reports a missing signup', async () => {
      signupCollection.findByKeyWithVersion.mockResolvedValue(undefined);

      await command.execute(interaction);

      expect(signupCollection.findByKeyWithVersion).toHaveBeenCalledWith({
        discordId: 'applicant-1',
        encounter: Encounter.DSR,
      });
      expect(interaction.editReply).toHaveBeenCalledWith(
        guardReply(
          `No signup found for <@applicant-1> in ${EncounterFriendlyDescription[Encounter.DSR]}. Cleared or removed signups can't be edited.`,
        ),
      );
    });

    it('points a signup with an open review at its review message', async () => {
      signupCollection.findByKeyWithVersion.mockResolvedValue({
        signup: partialMock<SignupDocument>({
          ...approved,
          status: SignupStatus.UPDATE_PENDING,
        }),
        updateTime,
      });

      await command.execute(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith(
        guardReply(
          'This signup has an open review — react to the review message instead. https://discord.com/channels/guild-1/review-channel/review-msg',
        ),
      );
      expect(
        encountersComponentsService.createProgPointSelectMenu,
      ).not.toHaveBeenCalled();
    });

    it('reports unexpected errors', async () => {
      const failure = new Error('Firestore unavailable');
      signupCollection.findByKeyWithVersion.mockRejectedValue(failure);

      await command.execute(interaction);

      expect(errorService.handleCommandError).toHaveBeenCalledWith(
        failure,
        interaction,
      );
      expect(interaction.editReply).toHaveBeenLastCalledWith({
        content: '',
        embeds: [expect.any(EmbedBuilder)],
        components: [],
      });
    });
  });

  describe('screen', () => {
    it('opens a correction on the current prog point without Cleared', async () => {
      const run = command.execute(interaction);
      await collector.timeOut();
      await run;

      expect(
        encountersComponentsService.createProgPointSelectMenu,
      ).toHaveBeenCalledWith(Encounter.DSR, { includeCleared: false });
      expect(interaction.editReply).toHaveBeenCalledWith({
        embeds: [expect.any(EmbedBuilder)],
        components: [expect.anything(), commitButtons(true)],
      });
      expect(selectedDefaults()).toEqual([true, false]);
      expect(interaction.editReply).toHaveBeenLastCalledWith({
        content: EDIT_SIGNUP_MESSAGES.TIMED_OUT,
        embeds: [],
        components: [],
      });
    });

    it('opens a reversal with nothing selected', async () => {
      signupCollection.findByKeyWithVersion.mockResolvedValue({
        signup: partialMock<SignupDocument>({
          ...approved,
          status: SignupStatus.DECLINED,
        }),
        updateTime,
      });

      const run = command.execute(interaction);
      await collector.timeOut();
      await run;

      expect(selectedDefaults()).toEqual([false, false]);
      expect(interaction.editReply).toHaveBeenCalledWith({
        embeds: [expect.any(EmbedBuilder)],
        components: [
          expect.anything(),
          expect.objectContaining({
            components: [
              expect.objectContaining({
                data: expect.objectContaining({ label: 'Approve' }),
              }),
              expect.anything(),
              expect.anything(),
            ],
          }),
        ],
      });
    });

    it('enables commit and previews the change once a different prog point is selected', async () => {
      const run = command.execute(interaction);
      const select = selectInteraction('P4');
      await collector.collect(select.interaction);

      expect(select.update).toHaveBeenCalledWith({
        embeds: [
          expect.objectContaining({
            data: expect.objectContaining({
              fields: expect.arrayContaining([
                expect.objectContaining({ name: 'Changes' }),
              ]),
            }),
          }),
        ],
        components: [expect.anything(), commitButtons(false)],
      });
      expect(selectedDefaults()).toEqual([false, true]);

      await collector.timeOut();
      await run;
    });

    it('disables commit again when the current prog point is re-selected', async () => {
      const run = command.execute(interaction);
      await collector.collect(selectInteraction('P4').interaction);
      const reselect = selectInteraction('P2');
      await collector.collect(reselect.interaction);

      expect(reselect.update).toHaveBeenCalledWith(
        expect.objectContaining({
          components: [expect.anything(), commitButtons(true)],
        }),
      );

      await collector.timeOut();
      await run;
    });

    it('cancels without saving', async () => {
      const run = command.execute(interaction);
      const cancel = buttonInteraction(EDIT_CANCEL_BUTTON_ID);
      await collector.collect(cancel.interaction);
      await run;

      expect(cancel.update).toHaveBeenCalledWith({
        content: EDIT_SIGNUP_MESSAGES.CANCELLED,
        embeds: [],
        components: [],
      });
      expect(editSignupService.apply).not.toHaveBeenCalled();
    });

    it('ignores Save while nothing has changed', async () => {
      const run = command.execute(interaction);
      const save = buttonInteraction(EDIT_SAVE_BUTTON_ID);
      await collector.collect(save.interaction);
      await collector.timeOut();
      await run;

      expect(save.update).not.toHaveBeenCalled();
      expect(editSignupService.apply).not.toHaveBeenCalled();
    });
  });

  describe('saving', () => {
    it('acknowledges Save before applying the edit', async () => {
      const run = command.execute(interaction);
      await collector.collect(selectInteraction('P4').interaction);
      const save = buttonInteraction(EDIT_SAVE_BUTTON_ID);
      await collector.collect(save.interaction);
      await run;

      expect(save.update).toHaveBeenCalledWith({
        content: EDIT_SIGNUP_MESSAGES.SAVING,
        embeds: [],
        components: [],
      });
      expect(save.update.mock.invocationCallOrder[0]).toBeLessThan(
        editSignupService.apply.mock.invocationCallOrder[0],
      );
      expect(editSignupService.apply).toHaveBeenCalledWith({
        kind: 'correction',
        signup: approved,
        updateTime,
        progPoint: 'P4',
        editor,
        comment: undefined,
        settings,
        guildId: 'guild-1',
      });
    });

    const results: { result: ApplyEditResult; description: string }[] = [
      { result: { type: 'saved' }, description: "Applicant will be DM'd" },
      {
        result: { type: 'savedWithSheetsError' },
        description:
          "Saved, but the Google Sheet couldn't be updated. Please set **Faye Valentine** to **Clear Party · P4 Crystallize Time** manually.\n\nApplicant will be DM'd",
      },
      {
        result: { type: 'conflict' },
        description: EDIT_SIGNUP_MESSAGES.CONFLICT,
      },
    ];

    it.each(results)(
      'replies to a $result.type result',
      async ({ result, description }) => {
        editSignupService.apply.mockResolvedValue(result);

        const run = command.execute(interaction);
        await collector.collect(selectInteraction('P4').interaction);
        await collector.collect(
          buttonInteraction(EDIT_SAVE_BUTTON_ID).interaction,
        );
        await run;

        expect(interaction.editReply).toHaveBeenLastCalledWith({
          content: '',
          components: [],
          embeds: [
            expect.objectContaining({
              data: expect.objectContaining({ description }),
            }),
          ],
        });
      },
    );

    it('collects an optional comment before saving', async () => {
      const modalUpdate = vi.fn().mockResolvedValue(undefined);
      const modal = mockOf<ModalMessageModalSubmitInteraction>({
        fields: {
          getTextInputValue: vi.fn().mockReturnValue('  sorry, mis-click  '),
        },
        isFromMessage: () => true,
        update: modalUpdate,
      });
      const withComment = buttonInteraction(EDIT_SAVE_WITH_COMMENT_BUTTON_ID, {
        showModal: vi.fn().mockResolvedValue(undefined),
        awaitModalSubmit: vi.fn().mockResolvedValue(modal),
      });

      const run = command.execute(interaction);
      await collector.collect(selectInteraction('P4').interaction);
      await collector.collect(withComment.interaction);
      await run;

      expect(modalUpdate).toHaveBeenCalledWith({
        content: EDIT_SIGNUP_MESSAGES.SAVING,
        embeds: [],
        components: [],
      });
      expect(editSignupService.apply).toHaveBeenCalledWith(
        expect.objectContaining({ comment: 'sorry, mis-click' }),
      );
    });

    it('sends a whitespace-only comment as no comment', async () => {
      const modal = mockOf<ModalMessageModalSubmitInteraction>({
        fields: { getTextInputValue: vi.fn().mockReturnValue('   ') },
        isFromMessage: () => true,
        update: vi.fn().mockResolvedValue(undefined),
      });
      const withComment = buttonInteraction(EDIT_SAVE_WITH_COMMENT_BUTTON_ID, {
        showModal: vi.fn().mockResolvedValue(undefined),
        awaitModalSubmit: vi.fn().mockResolvedValue(modal),
      });

      const run = command.execute(interaction);
      await collector.collect(selectInteraction('P4').interaction);
      await collector.collect(withComment.interaction);
      await run;

      expect(editSignupService.apply).toHaveBeenCalledWith(
        expect.objectContaining({ comment: undefined }),
      );
    });

    it('applies a reversal as a reversal', async () => {
      signupCollection.findByKeyWithVersion.mockResolvedValue({
        signup: partialMock<SignupDocument>({
          ...approved,
          status: SignupStatus.DECLINED,
        }),
        updateTime,
      });

      const run = command.execute(interaction);
      await collector.collect(selectInteraction('P2').interaction);
      await collector.collect(
        buttonInteraction(EDIT_SAVE_BUTTON_ID).interaction,
      );
      await run;

      expect(editSignupService.apply).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'reversal', progPoint: 'P2' }),
      );
    });

    it('commits only the latest comment modal, with the prog point selected at that click', async () => {
      encountersService.getProgPoints.mockResolvedValue([
        ...progPoints,
        partialMock<ProgPointDocument>({
          id: 'P3',
          label: 'P3 Wrath of the Heavens',
          partyStatus: PartyStatus.ProgParty,
          order: 3,
          active: true,
        }),
      ]);
      menu.addOptions({ label: 'P3 Wrath of the Heavens', value: 'P3' });

      // discord.js has no "modal closed" event: after Esc the first click's
      // listener stays parked, and both listeners receive the next submit
      let submitFirst: (modal: ModalMessageModalSubmitInteraction) => void =
        () => undefined;
      let submitSecond: (modal: ModalMessageModalSubmitInteraction) => void =
        () => undefined;
      const firstAwait = vi.fn(
        () =>
          new Promise<ModalMessageModalSubmitInteraction>((resolve) => {
            submitFirst = resolve;
          }),
      );
      const secondAwait = vi.fn(
        () =>
          new Promise<ModalMessageModalSubmitInteraction>((resolve) => {
            submitSecond = resolve;
          }),
      );
      const modalUpdate = vi.fn().mockResolvedValue(undefined);
      const modal = mockOf<ModalMessageModalSubmitInteraction>({
        fields: { getTextInputValue: vi.fn().mockReturnValue('meant P3') },
        isFromMessage: () => true,
        update: modalUpdate,
      });

      const run = command.execute(interaction);
      await collector.collect(selectInteraction('P4').interaction);
      const firstClick = collector.collect(
        buttonInteraction(EDIT_SAVE_WITH_COMMENT_BUTTON_ID, {
          showModal: vi.fn().mockResolvedValue(undefined),
          awaitModalSubmit: firstAwait,
        }).interaction,
      );
      await vi.waitFor(() => expect(firstAwait).toHaveBeenCalled());

      await collector.collect(selectInteraction('P3').interaction);
      const secondClick = collector.collect(
        buttonInteraction(EDIT_SAVE_WITH_COMMENT_BUTTON_ID, {
          showModal: vi.fn().mockResolvedValue(undefined),
          awaitModalSubmit: secondAwait,
        }).interaction,
      );
      await vi.waitFor(() => expect(secondAwait).toHaveBeenCalled());

      // listeners run in registration order, so the stale one resolves first
      submitFirst(modal);
      submitSecond(modal);
      await Promise.all([firstClick, secondClick]);
      await run;

      expect(modalUpdate).toHaveBeenCalledTimes(1);
      expect(editSignupService.apply).toHaveBeenCalledTimes(1);
      expect(editSignupService.apply).toHaveBeenCalledWith(
        expect.objectContaining({ progPoint: 'P3', comment: 'meant P3' }),
      );
    });

    it('asks the reviewer to retry when the comment modal token has expired', async () => {
      const expired = new DiscordAPIError(
        { message: 'Unknown interaction', code: 10062 },
        10062,
        404,
        'POST',
        '/interactions/123/abc/callback',
        { body: undefined, files: undefined },
      );
      const withComment = buttonInteraction(EDIT_SAVE_WITH_COMMENT_BUTTON_ID, {
        showModal: vi.fn().mockRejectedValue(expired),
      });

      const run = command.execute(interaction);
      await collector.collect(selectInteraction('P4').interaction);
      await collector.collect(withComment.interaction);

      expect(editorSend).toHaveBeenCalledWith(
        EDIT_SIGNUP_MESSAGES.MODAL_TOKEN_EXPIRED,
      );
      expect(editSignupService.apply).not.toHaveBeenCalled();

      await collector.collect(
        buttonInteraction(EDIT_SAVE_BUTTON_ID).interaction,
      );
      await run;

      expect(editSignupService.apply).toHaveBeenCalledTimes(1);
    });

    it('treats a comment-modal timeout as an edit timeout, not an error', async () => {
      const withComment = buttonInteraction(EDIT_SAVE_WITH_COMMENT_BUTTON_ID, {
        showModal: vi.fn().mockResolvedValue(undefined),
        awaitModalSubmit: vi.fn().mockRejectedValue({
          code: DiscordjsErrorCodes.InteractionCollectorError,
        }),
      });

      const run = command.execute(interaction);
      await collector.collect(selectInteraction('P4').interaction);
      await collector.collect(withComment.interaction);
      await collector.timeOut();
      await run;

      expect(interaction.editReply).toHaveBeenLastCalledWith({
        content: EDIT_SIGNUP_MESSAGES.TIMED_OUT,
        embeds: [],
        components: [],
      });
      expect(errorService.handleCommandError).not.toHaveBeenCalled();
      expect(editSignupService.apply).not.toHaveBeenCalled();
    });

    it('scopes the comment-modal filter to the same user and the same screen message', async () => {
      let capturedFilter:
        | ((interaction: ModalMessageModalSubmitInteraction) => boolean)
        | undefined;
      const modal = mockOf<ModalMessageModalSubmitInteraction>({
        fields: { getTextInputValue: vi.fn().mockReturnValue('') },
        isFromMessage: () => true,
        update: vi.fn().mockResolvedValue(undefined),
      });
      const awaitModalSubmit = vi.fn(
        (options: {
          filter: (interaction: ModalMessageModalSubmitInteraction) => boolean;
        }) => {
          capturedFilter = options.filter;
          return Promise.resolve(modal);
        },
      );
      const withComment = buttonInteraction(EDIT_SAVE_WITH_COMMENT_BUTTON_ID, {
        showModal: vi.fn().mockResolvedValue(undefined),
        awaitModalSubmit,
        message: { id: 'this-screen-message' },
      });

      const run = command.execute(interaction);
      await collector.collect(selectInteraction('P4').interaction);
      await collector.collect(withComment.interaction);
      await run;

      const sameMessageSubmit = mockOf<ModalMessageModalSubmitInteraction>({
        user: editor,
        message: { id: 'this-screen-message' },
      });
      const differentMessageSubmit = mockOf<ModalMessageModalSubmitInteraction>(
        {
          user: editor,
          message: { id: 'a-different-screen' },
        },
      );

      expect(capturedFilter?.(sameMessageSubmit)).toBe(true);
      expect(capturedFilter?.(differentMessageSubmit)).toBe(false);
    });
  });
});
