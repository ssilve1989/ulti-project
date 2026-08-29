import { describe, expect, test } from 'vitest';
import { getErrorMessage, getErrorStack } from './error-guards.js';

describe('error-guards', () => {
  describe('Error.isError (native)', () => {
    test('returns true for Error instances', () => {
      const error = new Error('test error');
      expect(Error.isError(error)).toBe(true);
    });

    test('returns true for subclassed Error instances', () => {
      const typeError = new TypeError('type error');
      const rangeError = new RangeError('range error');

      expect(Error.isError(typeError)).toBe(true);
      expect(Error.isError(rangeError)).toBe(true);
    });

    test('returns false for strings', () => {
      expect(Error.isError('error string')).toBe(false);
    });

    test('returns false for numbers', () => {
      expect(Error.isError(42)).toBe(false);
    });

    test('returns false for objects', () => {
      expect(Error.isError({ message: 'fake error' })).toBe(false);
    });

    test('returns false for null', () => {
      expect(Error.isError(null)).toBe(false);
    });

    test('returns false for undefined', () => {
      expect(Error.isError(undefined)).toBe(false);
    });
  });

  describe('getErrorMessage', () => {
    test('extracts message from Error instances', () => {
      const error = new Error('test error message');
      expect(getErrorMessage(error)).toBe('test error message');
    });

    test('extracts message from subclassed Error instances', () => {
      const typeError = new TypeError('type error message');
      expect(getErrorMessage(typeError)).toBe('type error message');
    });

    test('returns string values as-is', () => {
      expect(getErrorMessage('string error')).toBe('string error');
    });

    test('converts objects with toString to string', () => {
      const obj = { toString: () => 'custom error' };
      expect(getErrorMessage(obj)).toBe('custom error');
    });

    test('returns fallback message for null', () => {
      expect(getErrorMessage(null)).toBe('Unknown error occurred');
    });

    test('returns fallback message for undefined', () => {
      expect(getErrorMessage(undefined)).toBe('Unknown error occurred');
    });

    test('returns fallback message for numbers', () => {
      expect(getErrorMessage(42)).toBe('Unknown error occurred');
    });

    test('returns fallback message for plain objects without toString', () => {
      const obj = Object.create(null);
      expect(getErrorMessage(obj)).toBe('Unknown error occurred');
    });
  });

  describe('getErrorStack', () => {
    test('returns stack from Error instances', () => {
      const error = new Error('test error');
      const stack = getErrorStack(error);

      expect(stack).toBeDefined();
      expect(typeof stack).toBe('string');
      expect(stack).toContain('Error: test error');
    });

    test('returns stack from subclassed Error instances', () => {
      const typeError = new TypeError('type error');
      const stack = getErrorStack(typeError);

      expect(stack).toBeDefined();
      expect(typeof stack).toBe('string');
      expect(stack).toContain('TypeError: type error');
    });

    test('returns undefined for non-Error values', () => {
      expect(getErrorStack('string error')).toBeUndefined();
      expect(getErrorStack(42)).toBeUndefined();
      expect(getErrorStack(null)).toBeUndefined();
      expect(getErrorStack(undefined)).toBeUndefined();
      expect(getErrorStack({ message: 'fake error' })).toBeUndefined();
    });
  });
});
