import { Injectable } from '@nestjs/common';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import type { FastifyRequest } from 'fastify';
import { InjectBetterAuth } from './auth.decorators.js';
import type { BetterAuthInstance } from './auth.interfaces.js';

@Injectable()
export class AuthService {
  constructor(@InjectBetterAuth() private readonly auth: BetterAuthInstance) {}

  get handler() {
    return toNodeHandler(this.auth);
  }

  async getSession(request: FastifyRequest) {
    return this.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
  }
}
