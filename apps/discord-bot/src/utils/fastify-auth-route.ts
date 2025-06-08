import type { FastifyReply, FastifyRequest } from 'fastify';
import type { BetterAuthInstance } from '../api/auth/auth.interfaces.js';

export async function handler(
  request: FastifyRequest,
  reply: FastifyReply,
  auth: BetterAuthInstance,
) {
  try {
    // Construct request URL
    const url = new URL(request.url, `http://${request.headers.host}`);

    // Convert Fastify headers to standard Headers object
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (value) headers.append(key, value.toString());
    }

    // Create Fetch API-compatible request
    const req = new Request(url.toString(), {
      method: request.method,
      headers,
      body:
        typeof request.body === 'string'
          ? request.body
          : JSON.stringify(request.body),
    });

    // Process authentication request
    const response = await auth.handler(req);

    // Forward response to client
    reply.status(response.status);
    response.headers.forEach((value, key) => reply.header(key, value));
    reply.send(response.body ? await response.text() : null);
  } catch (error) {
    console.error('Authentication Error:', error);
    reply.status(500).send({
      error: 'Internal authentication error',
      code: 'AUTH_FAILURE',
    });
  }
}
