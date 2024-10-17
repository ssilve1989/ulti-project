// Declare it globally in the TypeScript namespace
declare global {
  type ExactType<T, K extends keyof T> = {
    [P in K]: T[P]; // Pick only the specified keys from T
  } & {
    [P in Exclude<keyof T, K>]?: never; // Disallow any other properties
  };
}

export {}; // Ensure this file is treated as a module
