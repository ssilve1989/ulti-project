import { Transform } from 'class-transformer';

type CaseTransformer = (value: string) => string;

/**
 * Decorator to transform a string to a specified casing. For use in conjunction
 * with change-case and class-transformer
 * @param fn
 * @returns
 */
export const ToCasing = (fn: CaseTransformer) =>
  Transform(({ value }) => value && fn(value));
