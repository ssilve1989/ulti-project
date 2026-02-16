import { createMock, type DeepMocked } from '@golevelup/ts-vitest';
import { CommandBus } from '@nestjs/cqrs';
import {
  ChatInputCommandInteraction,
  Client,
  Collection,
  EmbedBuilder,
  Events,
  type Guild,
  REST,
  Routes,
  SlashCommandBuilder,
  type User,
} from 'discord.js';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as discordHelpers from '../discord/discord.helpers.js';
import { ErrorService } from '../error/error.service.js';
import type { SlashCommands } from './slash-commands.provider.js';
import { SlashCommandsService } from './slash-commands.service.js';
import * as slashCommandsUtils from './slash-commands.utils.js';

// Mock the REST class
vi.mock('discord.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('discord.js')>();
  return {
    ...original,
    REST: vi.fn(),
  };
});

// Mock dependencies

vi.mock('../discord/discord.helpers.js', () => ({
  safeReply: vi.fn(),
}));

vi.mock('./slash-commands.utils.js', () => ({
  getCommandForInteraction: vi.fn(),
}));

vi.mock('../config/app.js', () => ({
  appConfig: {
    CLIENT_ID: 'test-client-id',
    DISCORD_TOKEN: 'test-token',
  },
}));

describe('SlashCommandsService', () => {
  let service: SlashCommandsService;
  let mockClient: DeepMocked<Client>;
  let mockCommandBus: DeepMocked<CommandBus>;
  let mockErrorService: DeepMocked<ErrorService>;
  let mockSlashCommands: SlashCommands;
  let mockInteraction: DeepMocked<ChatInputCommandInteraction<'cached'>>;
  let mockRest: DeepMocked<REST>;

  beforeEach(() => {
    vi.useFakeTimers();

    mockSlashCommands = [
      new SlashCommandBuilder()
        .setName('test-command')
        .setDescription('Test command'),
      new SlashCommandBuilder()
        .setName('another-command')
        .setDescription('Another test command'),
    ];

    const mockGuild1 = createMock<Guild>();
    mockGuild1.id = 'guild-123';
    const mockGuild2 = createMock<Guild>();
    mockGuild2.id = 'guild-456';

    mockClient = createMock<Client>();
    mockClient.on = vi.fn();

    // Create a mock guilds collection with the cache
    const guildCollection = new Collection([
      ['guild-123', mockGuild1],
      ['guild-456', mockGuild2],
    ]);

    // Mock the guilds manager
    Object.defineProperty(mockClient, 'guilds', {
      value: { cache: guildCollection },
      writable: true,
    });

    mockCommandBus = createMock<CommandBus>();
    mockCommandBus.execute = vi.fn();

    mockErrorService = createMock<ErrorService>();
    mockErrorService.handleCommandError = vi
      .fn()
      .mockReturnValue(new EmbedBuilder().setTitle('Error'));
    mockErrorService.captureError = vi.fn();

    const mockUser = createMock<User>();
    mockUser.id = 'user-123';
    mockUser.username = 'testuser';

    mockInteraction = createMock<ChatInputCommandInteraction<'cached'>>({
      isChatInputCommand: vi.fn().mockReturnValue(true),
      inGuild: vi.fn().mockReturnValue(true),
      commandName: 'test-command',
      user: mockUser,
      guildId: 'guild-123',
      valueOf: () => '',
    });

    mockRest = createMock<REST>();
    mockRest.setToken = vi.fn().mockReturnThis();
    mockRest.put = vi.fn();

    // Configure REST mock
    vi.mocked(REST).mockImplementation(() => mockRest);

    service = new SlashCommandsService(
      mockClient,
      mockCommandBus,
      mockSlashCommands,
      mockErrorService,
    );

    // Mock logger to suppress output during tests
    vi.spyOn(service['logger'], 'log').mockImplementation(() => {});
    vi.spyOn(service['logger'], 'error').mockImplementation(() => {});

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('listenToCommands', () => {
    test('should register event listener for InteractionCreate', () => {
      service.listenToCommands();

      expect(mockClient.on).toHaveBeenCalledWith(
        Events.InteractionCreate,
        expect.any(Function),
      );
    });

    test('should handle valid chat input command interaction', async () => {
      const mockCommand = { interaction: mockInteraction };
      vi.mocked(slashCommandsUtils.getCommandForInteraction).mockReturnValue(
        mockCommand,
      );
      vi.mocked(mockCommandBus.execute).mockResolvedValue(undefined);

      service.listenToCommands();
      const eventHandler = vi.mocked(mockClient.on).mock.calls[0][1];

      await eventHandler(mockInteraction);

      expect(slashCommandsUtils.getCommandForInteraction).toHaveBeenCalledWith(
        mockInteraction,
      );
      expect(mockCommandBus.execute).toHaveBeenCalledWith(mockCommand);
    });

    test('should ignore non-chat input commands', async () => {
      vi.mocked(mockInteraction.isChatInputCommand).mockReturnValue(false);

      service.listenToCommands();
      const eventHandler = vi.mocked(mockClient.on).mock.calls[0][1];

      const result = await eventHandler(mockInteraction);

      expect(result).toBeUndefined();
      expect(
        slashCommandsUtils.getCommandForInteraction,
      ).not.toHaveBeenCalled();
    });

    test('should ignore interactions not in guild', async () => {
      vi.mocked(mockInteraction.inGuild).mockReturnValue(false);

      service.listenToCommands();
      const eventHandler = vi.mocked(mockClient.on).mock.calls[0][1];

      const result = await eventHandler(mockInteraction);

      expect(result).toBeUndefined();
      expect(
        slashCommandsUtils.getCommandForInteraction,
      ).not.toHaveBeenCalled();
    });

    test('should handle command execution errors', async () => {
      const mockCommand = { interaction: mockInteraction };
      const error = new Error('Command failed');
      vi.mocked(slashCommandsUtils.getCommandForInteraction).mockReturnValue(
        mockCommand,
      );
      vi.mocked(mockCommandBus.execute).mockRejectedValue(error);
      const errorEmbed = new EmbedBuilder().setTitle('Error');
      vi.mocked(mockErrorService.handleCommandError).mockReturnValue(
        errorEmbed,
      );

      service.listenToCommands();
      const eventHandler = vi.mocked(mockClient.on).mock.calls[0][1];

      await eventHandler(mockInteraction);

      expect(mockErrorService.handleCommandError).toHaveBeenCalledWith(
        error,
        mockInteraction,
      );
      expect(discordHelpers.safeReply).toHaveBeenCalledWith(mockInteraction, {
        embeds: [errorEmbed],
      });
    });

    test('should handle reply errors gracefully', async () => {
      const mockCommand = { interaction: mockInteraction };
      const commandError = new Error('Command failed');
      const replyError = new Error('Reply failed');

      vi.mocked(slashCommandsUtils.getCommandForInteraction).mockReturnValue(
        mockCommand,
      );
      vi.mocked(mockCommandBus.execute).mockRejectedValue(commandError);
      vi.mocked(discordHelpers.safeReply).mockRejectedValue(replyError);

      service.listenToCommands();
      const eventHandler = vi.mocked(mockClient.on).mock.calls[0][1];

      await eventHandler(mockInteraction);

      expect(service['logger'].error).toHaveBeenCalledWith(
        {
          originalError: commandError,
          replyError,
        },
        'Failed to send error response',
      );
    });

    test('should ignore interaction when no command found', async () => {
      vi.mocked(slashCommandsUtils.getCommandForInteraction).mockReturnValue(
        undefined,
      );

      service.listenToCommands();
      const eventHandler = vi.mocked(mockClient.on).mock.calls[0][1];

      await eventHandler(mockInteraction);

      expect(mockCommandBus.execute).not.toHaveBeenCalled();
    });
  });

  describe('registerCommands', () => {
    test('should register commands for all guilds', async () => {
      vi.mocked(mockRest.put).mockResolvedValue(undefined);

      await service.registerCommands();

      expect(mockRest.setToken).toHaveBeenCalledWith('test-token');
      expect(mockRest.put).toHaveBeenCalledTimes(2);
      expect(mockRest.put).toHaveBeenCalledWith(
        Routes.applicationGuildCommands('test-client-id', 'guild-123'),
        { body: mockSlashCommands },
      );
      expect(mockRest.put).toHaveBeenCalledWith(
        Routes.applicationGuildCommands('test-client-id', 'guild-456'),
        { body: mockSlashCommands },
      );
    });

    test('should log successful registration', async () => {
      vi.mocked(mockRest.put).mockResolvedValue(undefined);

      await service.registerCommands();

      expect(service['logger'].log).toHaveBeenCalledWith(
        'refreshing slash commands',
      );
      expect(service['logger'].log).toHaveBeenCalledWith(
        'Successfully registered 2 application commands for guild: guild-123',
      );
      expect(service['logger'].log).toHaveBeenCalledWith(
        'Successfully registered 2 application commands for guild: guild-456',
      );
    });

    test('should handle registration errors with retry', async () => {
      const error = new Error('API Error');
      vi.mocked(mockRest.put)
        .mockRejectedValueOnce(error)
        .mockResolvedValue(undefined);

      const registerPromise = service.registerCommands();

      // Fast-forward through all retry delays
      await vi.runAllTimersAsync();

      await registerPromise;

      expect(service['logger'].error).toHaveBeenCalledWith(error);
    });

    test('should capture errors after retries exhausted', async () => {
      const error = new Error('Persistent API Error');
      vi.mocked(mockRest.put).mockRejectedValue(error);

      const registerPromise = service.registerCommands();

      // Fast-forward through all retry delays
      await vi.runAllTimersAsync();

      await registerPromise;

      expect(mockErrorService.captureError).toHaveBeenCalledWith(error);
    });

    test('should handle empty guild cache', async () => {
      const emptyMockClient = createMock<Client>();

      // Mock the guilds manager with empty cache
      Object.defineProperty(emptyMockClient, 'guilds', {
        value: { cache: new Collection() },
        writable: true,
      });

      const emptyService = new SlashCommandsService(
        emptyMockClient,
        mockCommandBus,
        mockSlashCommands,
        mockErrorService,
      );

      // Mock logger to suppress output during tests
      vi.spyOn(emptyService['logger'], 'log').mockImplementation(() => {});

      await emptyService.registerCommands();

      expect(mockRest.put).not.toHaveBeenCalled();
      expect(emptyService['logger'].log).toHaveBeenCalledWith(
        'refreshing slash commands',
      );
    });
  });
});
