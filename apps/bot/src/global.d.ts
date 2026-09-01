// Declare it globally in the TypeScript namespace
declare global {
  type Exact<A, B> = A extends B ? (B extends A ? A : never) : never;

  interface ErrorConstructor {
    /**
     * Determines whether the passed value is an Error
     * Available in Node.js 24+
     */
    isError(value: unknown): value is Error;
  }
}

export {}; // Ensure this file is treated as a module
