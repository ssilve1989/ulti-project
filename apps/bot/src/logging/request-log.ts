import type { Options } from 'pino-http';
import { appConfig } from '../config/app.js';

/** How the bot logs each HTTP request it serves (nestjs-pino's `pinoHttp`). */
export const requestLogOptions: Options = {
  transport:
    appConfig.NODE_ENV === 'production'
      ? undefined
      : { target: 'pino-pretty', options: { singleLine: true } },
  level: appConfig.LOG_LEVEL,
  // pino-http logs every request and response header; never the credentials
  redact: [
    'req.headers.cookie',
    'req.headers.authorization',
    'res.headers["set-cookie"]',
  ],
};
