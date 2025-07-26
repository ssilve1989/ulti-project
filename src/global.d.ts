// Declare it globally in the TypeScript namespace
declare global {
  type ExactType<T, K extends keyof T> = {
    [P in K]: T[P]; // Pick only the specified keys from T
  } & {
    [P in Exclude<keyof T, K>]?: never; // Disallow any other properties
  };

  interface ErrorConstructor {
    /**
     * Determines whether the passed value is an Error
     * Available in Node.js 24+
     */
    isError(value: unknown): value is Error;
  }
}

export {}; // Ensure this file is treated as a module
