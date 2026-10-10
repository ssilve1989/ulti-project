import type { BoardAccess } from '@ulti-project/shared';
import type { Request } from 'express';
import type { BoardSessionUser } from '../../board-auth/auth.js';

/** Who made a board request, and what they may do; set by `BoardSessionGuard`. */
export interface BoardRequestContext extends BoardSessionUser {
  readonly access: BoardAccess;
}

const contexts = new WeakMap<Request, BoardRequestContext>();

export function setBoardContext(
  request: Request,
  context: BoardRequestContext,
): void {
  contexts.set(request, context);
}

/** The request's board context. Throws on a route `BoardSessionGuard` doesn't guard. */
export function boardContextOf(request: Request): BoardRequestContext {
  const context = contexts.get(request);
  if (context === undefined) {
    throw new Error('No board context: the route is missing BoardSessionGuard');
  }
  return context;
}

/** The caller and their squad. Throws on a route `@CanClaim` doesn't guard: it lets only a squad's members through. */
export function squadMemberOf(request: Request): {
  discordId: string;
  squadId: string;
} {
  const { discordId, access } = boardContextOf(request);
  if (access.kind !== 'squad') {
    throw new Error('The route is missing @CanClaim');
  }
  return { discordId, squadId: access.squad.id };
}
