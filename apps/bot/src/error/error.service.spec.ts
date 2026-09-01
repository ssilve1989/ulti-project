import { Test } from '@nestjs/testing';
import * as Sentry from '@sentry/nestjs';
import { Colors, EmbedBuilder } from 'discord.js';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ErrorService } from './error.service.js';

// Mock Sentry
vi.mock('@sentry/nestjs', () => ({
  getCurrentScope: vi.fn().mockReturnValue({
    captureException: vi.fn(),
  }),
}));

// Mock Discord interaction
const mockInteraction = {
  commandName: 'test-command',
  user: { id: 'user123' },
  guildId: 'guild456',
} as any;

describe('ErrorService', () => {
  let service: ErrorService;
  let loggerErrorSpy: any;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [ErrorService],
    }).compile();

    service = module.get<ErrorService>(ErrorService);

    // Mock the logger to suppress console output during tests
    loggerErrorSpy = vi
      .spyOn(service['logger'], 'error')
      .mockImplementation(() => {});

    // Clear mock calls
    vi.clearAllMocks();
  });

  describe('handleCommandError', () => {
    test('should report error to Sentry', () => {
      const error = new Error('Test error');

      service.handleCommandError(error, mockInteraction);

      expect(Sentry.getCurrentScope().captureException).toHaveBeenCalledWith(
        error,
      );
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
      const interactionWithoutGuild = {
        ...mockInteraction,
        guildId: null,
      };

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

      expect(Sentry.getCurrentScope().captureException).toHaveBeenCalledWith(
        error,
      );
      expect(result).toBeInstanceOf(EmbedBuilder);
    });

    test('should skip Sentry capture when capture option is false', () => {
      const error = new Error('Test error');

      service.handleCommandError(error, mockInteraction, { capture: false });

      expect(Sentry.getCurrentScope().captureException).not.toHaveBeenCalled();
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

      expect(Sentry.getCurrentScope().captureException).toHaveBeenCalledWith(
        error,
      );
    });

    test('should log error by default', () => {
      const error = new Error('Test error');

      service.captureError(error);

      expect(loggerErrorSpy).toHaveBeenCalledWith('Error: Test error');
    });

    test('should skip Sentry capture when capture option is false', () => {
      const error = new Error('Test error');

      service.captureError(error, { capture: false });

      expect(Sentry.getCurrentScope().captureException).not.toHaveBeenCalled();
    });

    test('should skip logging when log option is false', () => {
      const error = new Error('Test error');

      service.captureError(error, { log: false });

      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });

    test('should handle unknown error types', () => {
      const error = 'String error';

      service.captureError(error);

      expect(Sentry.getCurrentScope().captureException).toHaveBeenCalledWith(
        error,
      );
      expect(loggerErrorSpy).toHaveBeenCalledWith('Error: String error');
    });

    test('should handle both options set to false', () => {
      const error = new Error('Test error');

      service.captureError(error, { capture: false, log: false });

      expect(Sentry.getCurrentScope().captureException).not.toHaveBeenCalled();
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });
  });
});
