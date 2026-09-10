import { DiscordjsErrorCodes } from 'discord.js';

/**
 * How many times a review-DM flow re-shows its modal after a token-expired
 * (10062) failure before giving up.
 */
export const MAX_MODAL_SHOW_ATTEMPTS = 3;

/**
 * True when `error` is a discord.js interaction-collector timeout — an
 * `awaitMessageComponent` / `awaitModalSubmit` call that exceeded its `time`.
 *
 * Duck-typed rather than `instanceof DiscordjsError` so it also matches the
 * plain `{ code: 'InteractionCollectorError' }` shape used in tests and any
 * structurally-cloned error that has crossed a module boundary.
 */
export function isInteractionCollectorTimeoutError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === DiscordjsErrorCodes.InteractionCollectorError
  );
}
