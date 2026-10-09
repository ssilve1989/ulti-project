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
 * claim, and only with a JSON body. Requiring JSON, together with SameSite=Lax
 * cookies, blocks cross-site form posts.
 */
export function claimRefusal(
  access: BoardAccess,
  contentType: string | undefined,
): BoardHttpError | undefined {
  if (access.kind === 'squad-conflict') {
    return new BoardHttpError(HttpStatus.FORBIDDEN, 'squad-conflict');
  }
  if (access.kind !== 'squad') {
    return new BoardHttpError(HttpStatus.FORBIDDEN, 'no-squad');
  }
  if (!contentType?.startsWith('application/json')) {
    return new BoardHttpError(
      HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      'json-required',
    );
  }
  return undefined;
}

@Injectable()
class CanClaimGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const refusal = claimRefusal(
      boardContextOf(request).access,
      request.headers['content-type'],
    );
    if (refusal !== undefined) throw refusal;
    return true;
  }
}

/** Limits a write route to squad members sending JSON. Runs after the controller's `BoardSessionGuard`. */
export const CanClaim = () => UseGuards(CanClaimGuard);
