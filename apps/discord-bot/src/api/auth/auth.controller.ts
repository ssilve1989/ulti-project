import { All, Controller, Req, Res } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { InjectBetterAuth } from './auth.decorators.js';
import type { BetterAuthInstance } from './auth.interfaces.js';

@Controller('auth')
class AuthController {
  constructor(@InjectBetterAuth() private readonly auth: BetterAuthInstance) {}

  @All('*')
  async handler(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);

      const headers = fromNodeHeaders(request.raw.headers);
      const req = new Request(url.toString(), {
        method: request.method,
        headers,
        body:
          typeof request.body === 'string'
            ? request.body
            : JSON.stringify(request.body),
      });

      const response = await this.auth.handler(req);

      reply.status(response.status);
      response.headers.forEach((value, key) => reply.header(key, value));
      reply.send(response.body ? await response.text() : null);
    } catch (error) {
      Sentry.getCurrentScope().captureException(error);
      reply.status(500).send({
        error: 'Internal Server Error',
      });
    }
  }
}

export { AuthController };
