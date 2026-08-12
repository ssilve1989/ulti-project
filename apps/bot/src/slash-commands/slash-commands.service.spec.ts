import { Test } from '@nestjs/testing';
import { ChatInputCommandInteraction, Events } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DISCORD_CLIENT } from '../discord/discord.decorators.js';
import { createAutoMock } from '../test-utils/mock-factory.js';
import { SlashCommandDrainService } from './slash-command-drain.service.js';
import { SlashCommandRegistry } from './slash-command-registry.service.js';
import { SlashCommandsService } from './slash-commands.service.js';

vi.mock('@sentry/nestjs', () => ({
  startNewTrace: (fn: () => unknown) => fn(),
  startSpanManual: (_opts: unknown, fn: (span: unknown) => unknown) =>
    fn({ setStatus: vi.fn(), end: vi.fn() }),
  withScope: (fn: (scope: unknown) => unknown) =>
    fn({ setUser: vi.fn(), setTag: vi.fn() }),
}));

describe('SlashCommandsService', () => {
  let service: SlashCommandsService;
  let client: { on: ReturnType<typeof vi.fn> };
  let registry: SlashCommandRegistry;
  let drainService: SlashCommandDrainService;

  interface MockInteractionOverrides {
    isChatInputCommand?: () => boolean;
    inGuild?: () => boolean;
    commandName?: string;
    user?: { id: string; username: string };
    guildId?: string;
    deferred?: boolean;
    replied?: boolean;
    reply?: ReturnType<typeof vi.fn>;
  }

  const createInteractionMock = (overrides: MockInteractionOverrides = {}) =>
    ({
      isChatInputCommand: () => true,
      inGuild: () => true,
      commandName: 'test-command',
      user: { id: 'user-1', username: 'tester' },
      guildId: 'guild-1',
      deferred: false,
      replied: false,
      reply: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    }) as unknown as ChatInputCommandInteraction<'cached'>;

  beforeEach(async () => {
    client = { on: vi.fn() };

    const fixture = await Test.createTestingModule({
      providers: [
        SlashCommandsService,
        { provide: DISCORD_CLIENT, useValue: client },
      ],
    })
      .useMocker(createAutoMock)
      .compile();

    service = fixture.get(SlashCommandsService);
    registry = fixture.get(SlashCommandRegistry);
    drainService = fixture.get(SlashCommandDrainService);
  });

  describe('listenToCommands', () => {
    const getInteractionHandler = () => {
      service.listenToCommands();
      const call = client.on.mock.calls.find(
        ([event]) => event === Events.InteractionCreate,
      ) as [string, (interaction: unknown) => unknown];
      return call[1];
    };

    it('rejects new commands with a restarting reply while draining', async () => {
      drainService.isDraining = vi.fn().mockReturnValue(true);
      const handler = getInteractionHandler();
      const interaction = createInteractionMock();

      await handler(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: [
            expect.objectContaining({
              data: expect.objectContaining({ title: 'Restarting' }),
            }),
          ],
        }),
      );
      expect(registry.dispatch).not.toHaveBeenCalled();
    });

    it('dispatches and tracks the command when not draining', async () => {
      drainService.isDraining = vi.fn().mockReturnValue(false);
      const handler = getInteractionHandler();
      const interaction = createInteractionMock();

      await handler(interaction);

      expect(registry.dispatch).toHaveBeenCalledWith(interaction);
      expect(drainService.track).toHaveBeenCalledTimes(1);
      expect(interaction.reply).not.toHaveBeenCalled();
    });

    it('ignores interactions that are not chat input commands', async () => {
      const handler = getInteractionHandler();
      const interaction = createInteractionMock({
        isChatInputCommand: () => false,
      });

      await handler(interaction);

      expect(registry.dispatch).not.toHaveBeenCalled();
      expect(drainService.track).not.toHaveBeenCalled();
    });

    it('ignores interactions that are not in a guild', async () => {
      const handler = getInteractionHandler();
      const interaction = createInteractionMock({
        inGuild: () => false,
      });

      await handler(interaction);

      expect(registry.dispatch).not.toHaveBeenCalled();
      expect(drainService.track).not.toHaveBeenCalled();
    });
  });
});
