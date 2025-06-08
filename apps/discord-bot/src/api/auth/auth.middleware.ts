import { type IncomingMessage, type ServerResponse } from 'node:http';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import { AuthService } from './auth.service.js';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private readonly authService: AuthService) {}

  // The 'use' method is the entry point for the middleware.
  // It receives the raw Node.js request and response objects, which is
  // exactly what the BetterAuth handler expects.
  use(req: IncomingMessage, res: ServerResponse) {
    // Call the BetterAuth handler. It will take over the request,
    // send the response (e.g., the 302 redirect), and end the connection.
    // We DO NOT call `next()` here because we want to stop processing
    // the request right here.
    this.authService.handler(req, res);
  }
}
