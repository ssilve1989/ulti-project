import { DiscordjsErrorCodes } from 'discord.js';
import { describe, expect, test } from 'vitest';
import {
  isInteractionCollectorTimeoutError,
  MAX_MODAL_SHOW_ATTEMPTS,
} from './discord-interaction.guards.js';

describe('discord-interaction.guards', () => {
  describe('MAX_MODAL_SHOW_ATTEMPTS', () => {
    test('is 3', () => {
      expect(MAX_MODAL_SHOW_ATTEMPTS).toBe(3);
    });
  });

  describe('isInteractionCollectorTimeoutError', () => {
    test('true for a plain object carrying the collector-timeout code', () => {
      expect(
        isInteractionCollectorTimeoutError({
          code: DiscordjsErrorCodes.InteractionCollectorError,
        }),
      ).toBe(true);
    });

    test('true for an Error decorated with that code (the runtime shape)', () => {
      const error = Object.assign(
        new Error('Collector received no interactions'),
        {
          code: DiscordjsErrorCodes.InteractionCollectorError,
        },
      );

      expect(isInteractionCollectorTimeoutError(error)).toBe(true);
    });

    test('false for an object with a different discord.js error code', () => {
      expect(
        isInteractionCollectorTimeoutError({
          code: DiscordjsErrorCodes.InteractionNotReplied,
        }),
      ).toBe(false);
    });

    test('false for a plain Error', () => {
      expect(isInteractionCollectorTimeoutError(new Error('boom'))).toBe(false);
    });

    test.each([[null], [undefined], ['InteractionCollectorError'], [{}]])(
      'false for %o',
      (value) => {
        expect(isInteractionCollectorTimeoutError(value)).toBe(false);
      },
    );
  });
});
