import type { IncomingHttpHeaders } from 'node:http';
import { betterAuth } from 'better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import { appConfig } from '../config/app.js';
import type { boardConfig } from '../config/board.js';

/** What sign-in needs from the board's config. Flow specs pass their own board URL. */
export type BoardAuthConfig = Pick<
  typeof boardConfig,
  'BOARD_BASE_URL' | 'BETTER_AUTH_SECRET' | 'DISCORD_OAUTH_CLIENT_SECRET'
>;

/**
 * Sign-in to the coordinator board with Discord. There's no `database`, so
 * better-auth runs stateless: the session lives in its encrypted cookie, which
 * carries the user's Discord ID as the `discordId` additional field.
 *
 * `input: true` lets better-auth's `/update-user` set `discordId`, so only the
 * routes the board needs are mounted (see `configureHttpApp`).
 */
export function createBoardAuth(config: BoardAuthConfig) {
  return betterAuth({
    baseURL: config.BOARD_BASE_URL,
    secret: config.BETTER_AUTH_SECRET,
    user: {
      additionalFields: {
        discordId: { type: 'string', required: true, input: true },
      },
    },
    socialProviders: {
      discord: {
        clientId: appConfig.CLIENT_ID,
        clientSecret: config.DISCORD_OAUTH_CLIENT_SECRET,
        mapProfileToUser: (profile) => ({ discordId: profile.id }),
      },
    },
  });
}

export type BoardAuth = ReturnType<typeof createBoardAuth>;

/** The Nest injection token for the board's {@link BoardAuth} instance. */
export const BOARD_AUTH = Symbol('BOARD_AUTH');

/** Who is signed in to the board. */
export interface BoardSessionUser {
  readonly discordId: string;
  readonly name: string;
  readonly image: string | null;
}

/** A session's user as its cookie carries it, which may predate a field. */
interface SessionUser {
  readonly name: string;
  readonly image?: string | null;
  readonly discordId?: unknown;
}

/** Whether a session's user carries the Discord ID the board knows them by. */
export function isBoardUser<T extends SessionUser>(
  user: T,
): user is T & { readonly discordId: string } {
  return typeof user.discordId === 'string' && user.discordId !== '';
}

/** The board user signed in on a request, if any. */
export async function getBoardSession(
  auth: BoardAuth,
  request: { readonly headers: IncomingHttpHeaders },
): Promise<BoardSessionUser | undefined> {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(request.headers),
  });
  if (session === null || !isBoardUser(session.user)) return undefined;
  const { discordId, name, image } = session.user;
  return { discordId, name, image: image ?? null };
}
