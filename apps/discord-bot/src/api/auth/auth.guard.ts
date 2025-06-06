import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { AuthService } from './auth.service.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user: any }>();

    // Use the AuthService to check for a valid session
    const session = await this.authService.getSession(request);

    if (!session?.user) {
      throw new UnauthorizedException();
    }

    // IMPORTANT: Attach the user object to the request for later use
    // in controllers via a custom decorator.
    request.user = session.user;

    return true;
  }
}
