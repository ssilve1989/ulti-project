import { Transform, TransformFnParams } from 'class-transformer';

/**
 * Decorator to transform a string to lowercase
 * @returns {PropertyDecorator}
 */
export const TransformUrl = () =>
  Transform(({ value }: TransformFnParams) => {
    if (typeof value === 'string' && !value.startsWith('http')) {
      return `https://${value}`;
    }
    return value;
  });
