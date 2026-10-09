import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  BOARD_AUTH,
  type BoardAuth,
  getBoardSession,
} from '../../board-auth/auth.js';
import { BoardHttpError } from '../../http/http-exception.filter.js';
import { BoardAccessService } from './board-access.service.js';
import { setBoardContext } from './board-context.js';

/** Lets through signed-in board members whose roles give them access, and records who they are. */
@Injectable()
export class BoardSessionGuard implements CanActivate {
  constructor(
    @Inject(BOARD_AUTH) private readonly auth: BoardAuth,
    private readonly boardAccess: BoardAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const session = await getBoardSession(this.auth, request);
    if (session === undefined) {
      throw new BoardHttpError(HttpStatus.UNAUTHORIZED, 'signed-out');
    }
    const access = await this.boardAccess.resolve(session.discordId);
    if (access.kind === 'denied') {
      throw new BoardHttpError(HttpStatus.FORBIDDEN, access.reason);
    }
    setBoardContext(request, { ...session, access });
    return true;
  }
}
