import { Transform, type TransformFnParams } from 'class-transformer';

/**
 * Decorator to transform a string to lowercase
 * @returns {PropertyDecorator}
 */
export const ToLowercase = () =>
  Transform(({ value }: TransformFnParams) => value?.toLowerCase());
