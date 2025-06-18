# Copilot Instructions

This project is a pnpm workspaces repository.

- TypeScript is configured to expect ESM modules.
- Never use npm always use pnpm
- We use `vitest` for testing.
  - When running tests you should use `pnpm test --run` in the correct package you are testing

## Dealing with Dates
- Always use native Date objects and `date-fns` for date related functionality.
- Use `toISOString()` for serialization and deserialization of dates.

## React

- Do not overcomplicate Components. Non-presentational logic should be in co-located files exporting functions.
- Avoid using `useMemo` and `useCallback` unless absolutely necessary.
- Avoid `useEffect` unless absolutely necessary.
- Use `useState` for local state management.
