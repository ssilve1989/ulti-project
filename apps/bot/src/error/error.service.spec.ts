import { Test } from '@nestjs/testing';
import type { ChatInputCommandInteraction } from 'discord.js';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type Mock,
  type MockInstance,
  test,
  vi,
} from 'vitest';
import { mockOf } from '../test-utils/mock-factory.js';

// The suite runs with `test.isolate: false`, so the module registry is shared
// across spec files. A hoisted `vi.mock('@sentry/nestjs')` cannot rebind
// `error.service.ts` once another spec has evaluated it against the real
// package, so instead we reset the registry and re-import the service against a
// `vi.doMock`'d Sentry in `beforeEach`. `discord.js` is re-imported from the
// same fresh graph so `instanceof` checks stay meaningful.
type ErrorServiceModule = typeof import('./error.service.js');
type DiscordModule = typeof import('discord.js');

// Mock Discord interaction (plain data — no class identity involved)
const mockInteraction = mockOf<ChatInputCommandInteraction>({
  commandName: 'test-command',
  user: { id: 'user123' },
  guildId: 'guild456',
});

describe('ErrorService', () => {
  let service: InstanceType<ErrorServiceModule['ErrorService']>;
  let EmbedBuilder: DiscordModule['EmbedBuilder'];
  let Colors: DiscordModule['Colors'];
  let captureException: Mock;
  let loggerErrorSpy: MockInstance<() => void>;

  beforeEach(async () => {
    vi.resetModules();

    captureException = vi.fn();
    vi.doMock('@sentry/nestjs', () => ({
      getCurrentScope: vi.fn(() => ({ captureException })),
    }));

    ({ EmbedBuilder, Colors } = await import('discord.js'));
    const { ErrorService } = await import('./error.service.js');

    const module = await Test.createTestingModule({
      providers: [ErrorService],
    }).compile();

    service = module.get(ErrorService);

    // Mock the logger to suppress console output during tests
    loggerErrorSpy = vi
      .spyOn(service['logger'], 'error')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    // Don't leave the `@sentry/nestjs` doMock or re-evaluated modules in the
    // shared registry for the next spec file.
    vi.doUnmock('@sentry/nestjs');
    vi.resetModules();
  });

  describe('handleCommandError', () => {
    test('should report error to Sentry', () => {
      const error = new Error('Test error');

      service.handleCommandError(error, mockInteraction);

      expect(captureException).toHaveBeenCalledWith(error);
    });

    test('should return error embed with default message', () => {
      const error = new Error('Test error');

      const result = service.handleCommandError(error, mockInteraction);

      expect(result).toBeInstanceOf(EmbedBuilder);
      expect(result.data.color).toBe(Colors.Red);
      expect(result.data.title).toBe('Command Error');
      expect(result.data.description).toBe(
        'An unexpected error occurred. Please try again later.',
      );
      expect(result.data.timestamp).toBeDefined();
    });

    test('should return error embed with custom message', () => {
      const error = new Error('Test error');
      const message = 'Custom error message for user';

      const result = service.handleCommandError(error, mockInteraction, {
        message,
      });

      expect(result).toBeInstanceOf(EmbedBuilder);
      expect(result.data.description).toBe(message);
    });

    test('should log error with structured context', () => {
      const error = new Error('Test error');

      service.handleCommandError(error, mockInteraction);

      expect(loggerErrorSpy).toHaveBeenCalledWith('Command error: Test error', {
        commandName: 'test-command',
        userId: 'user123',
        guildId: 'guild456',
      });
    });

    test('should handle interaction without guild', () => {
      const error = new Error('Test error');
      const interactionWithoutGuild = mockOf<ChatInputCommandInteraction>({
        ...mockInteraction,
        guildId: null,
      });

      service.handleCommandError(error, interactionWithoutGuild);

      expect(loggerErrorSpy).toHaveBeenCalledWith('Command error: Test error', {
        commandName: 'test-command',
        userId: 'user123',
        guildId: null,
      });
    });

    test('should handle unknown error types', () => {
      const error = 'String error';

      const result = service.handleCommandError(error, mockInteraction);

      expect(captureException).toHaveBeenCalledWith(error);
      expect(result).toBeInstanceOf(EmbedBuilder);
    });

    test('should skip Sentry capture when capture option is false', () => {
      const error = new Error('Test error');

      service.handleCommandError(error, mockInteraction, { capture: false });

      expect(captureException).not.toHaveBeenCalled();
    });

    test('should skip logging when log option is false', () => {
      const error = new Error('Test error');

      service.handleCommandError(error, mockInteraction, { log: false });

      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('captureError', () => {
    test('should report error to Sentry by default', () => {
      const error = new Error('Test error');

      service.captureError(error);

      expect(captureException).toHaveBeenCalledWith(error);
    });

    test('should log error by default', () => {
      const error = new Error('Test error');

      service.captureError(error);

      expect(loggerErrorSpy).toHaveBeenCalledWith('Error: Test error');
    });

    test('should skip Sentry capture when capture option is false', () => {
      const error = new Error('Test error');

      service.captureError(error, { capture: false });

      expect(captureException).not.toHaveBeenCalled();
    });

    test('should skip logging when log option is false', () => {
      const error = new Error('Test error');

      service.captureError(error, { log: false });

      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });

    test('should handle unknown error types', () => {
      const error = 'String error';

      service.captureError(error);

      expect(captureException).toHaveBeenCalledWith(error);
      expect(loggerErrorSpy).toHaveBeenCalledWith('Error: String error');
    });

    test('should handle both options set to false', () => {
      const error = new Error('Test error');

      service.captureError(error, { capture: false, log: false });

      expect(captureException).not.toHaveBeenCalled();
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });
  });
});
