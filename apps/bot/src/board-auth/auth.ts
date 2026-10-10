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
  // Stateless still keeps better-auth's in-memory adapter: about one session
  // row per sign-in, never pruned but reset on restart; negligible for a
  // handful of coordinators.
  return betterAuth({
    baseURL: config.BOARD_BASE_URL,
    secret: config.BETTER_AUTH_SECRET,
    // A refused sign-in goes back to the board, which explains it (`?error=`).
    onAPIError: { errorURL: new URL('/', config.BOARD_BASE_URL).href },
    advanced: {
      // Fly's proxy sets Fly-Client-IP; x-forwarded-for (the default) can be spoofed by the client
      ipAddress: { ipAddressHeaders: ['fly-client-ip'] },
    },
    account: {
      // Otherwise a sign-in whose Discord account isn't known yet is linked
      // to an existing user with the same verified email, and gets that
      // user's session and `discordId`.
      accountLinking: { enabled: false },
      // The board never reads it, and it carries Discord's access and refresh tokens.
      storeAccountCookie: false,
    },
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
