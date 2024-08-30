import {
  ValidateBy,
  type ValidationOptions,
  buildMessage,
} from 'class-validator';

export const IS_IN = 'isIn';

/**
 * Checks if given value is in a Set of allowed values.
 */
export function isIn(value: unknown, possibleValues: Set<unknown>): boolean {
  return possibleValues.has(value);
}

/**
 * Checks if given value is in a Set of allowed values.
 */
export function IsInSet(
  values: Set<any>,
  validationOptions?: ValidationOptions & { exact?: boolean },
): PropertyDecorator {
  return ValidateBy(
    {
      name: IS_IN,
      constraints: [values],
      validator: {
        validate: (value, args): boolean => isIn(value, args?.constraints[0]),
        defaultMessage: buildMessage(
          (eachPrefix) =>
            `${eachPrefix}$property must be one of the following values: $constraint1`,
          validationOptions,
        ),
      },
    },
    validationOptions,
  );
}
