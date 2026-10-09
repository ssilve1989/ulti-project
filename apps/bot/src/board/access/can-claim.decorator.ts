import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  UseGuards,
} from '@nestjs/common';
import type { BoardAccess } from '@ulti-project/shared';
import type { Request } from 'express';
import { BoardHttpError } from '../../http/http-exception.filter.js';
import { boardContextOf } from './board-context.js';

/**
 * Why a write is refused, if it is: only a member of exactly one squad may
 * claim or release, and a POST only with a JSON body. Requiring JSON, together
 * with SameSite=Lax cookies, blocks cross-site form posts. A DELETE has no
 * body, and a browser can't send one cross-site without a preflight.
 */
export function claimRefusal(
  access: BoardAccess,
  { method, contentType }: { method: string; contentType: string | undefined },
): BoardHttpError | undefined {
  if (access.kind === 'squad-conflict') {
    return new BoardHttpError(HttpStatus.FORBIDDEN, {
      reason: 'squad-conflict',
    });
  }
  if (access.kind !== 'squad') {
    return new BoardHttpError(HttpStatus.FORBIDDEN, { reason: 'no-squad' });
  }
  if (method === 'POST' && !contentType?.startsWith('application/json')) {
    return new BoardHttpError(HttpStatus.UNSUPPORTED_MEDIA_TYPE, {
      reason: 'json-required',
    });
  }
  return undefined;
}

@Injectable()
class CanClaimGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const refusal = claimRefusal(boardContextOf(request).access, {
      method: request.method,
      contentType: request.headers['content-type'],
    });
    if (refusal !== undefined) throw refusal;
    return true;
  }
}

/** Limits a write route to squad members, sending JSON to a POST. Runs after the controller's `BoardSessionGuard`. */
export const CanClaim = () => UseGuards(CanClaimGuard);
