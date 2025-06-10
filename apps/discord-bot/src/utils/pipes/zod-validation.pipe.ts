import { BadRequestException } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common/interfaces/index.js';
import type { ZodError, ZodType } from 'zod/v4';

interface ZodValidationPipeOptions {
  exceptionFactory?: (errors: ZodError) => Error;
}

/**
 * A pipe that validates the request body against a Zod schema.
 *
 * @param schema - The Zod schema to validate the request body against.
 * @param options - The options for the pipe.
 * @returns The validated request body.
 */
class ZodValidationPipe implements PipeTransform {
  constructor(
    private readonly schema: ZodType<any, any>,
    private readonly options: ZodValidationPipeOptions = {},
  ) {}

  transform(value: unknown): any {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      const error = result.error;

      const exception =
        this.options.exceptionFactory?.(error) ??
        new BadRequestException(error.message);

      throw exception;
    }

    return result.data;
  }
}

export { ZodValidationPipe };
