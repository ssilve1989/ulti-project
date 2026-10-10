import type { Options } from 'pino-http';
import { appConfig } from '../config/app.js';

/** How the bot logs each HTTP request it serves (nestjs-pino's `pinoHttp`). */
export const requestLogOptions: Options = {
  transport:
    appConfig.NODE_ENV === 'production'
      ? undefined
      : { target: 'pino-pretty', options: { singleLine: true } },
  level: appConfig.LOG_LEVEL,
  // Fly checks this every few seconds; logging each one buries real requests.
  autoLogging: { ignore: (request) => request.url === '/api/health' },
  // One short line per request: pino-http's default logs every header, credentials included
  serializers: {
    req: ({ method, url }) => ({ method, url }),
    res: ({ statusCode }) => ({ statusCode }),
  },
  // Successful requests only show at `debug`; failures always show
  customLogLevel: (_request, response, error) => {
    if (error || response.statusCode >= 500) return 'error';
    if (response.statusCode >= 400) return 'warn';
    return 'debug';
  },
};
