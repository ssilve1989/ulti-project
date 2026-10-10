import { resolve, sep } from 'node:path';
import type { DynamicModule } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import type { Response } from 'express';

/** The board's Content Security Policy (spec 3, Serving). Discord avatars and Google Fonts are the only outside sources. */
export const BOARD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' https://cdn.discordapp.com data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * Serves the coordinator board's built SPA from `rootPath`, with `index.html`
 * for any client route. `/api` is never served from it. Nothing is served
 * when `rootPath` is unset (a local bot-only run).
 *
 * Vite's hashed files under `assets/` are cached for a year; everything else
 * (`index.html`) is revalidated on every load, so a deploy reaches browsers at once.
 */
export function boardStaticModules(
  rootPath: string | undefined,
): DynamicModule[] {
  if (rootPath === undefined) return [];
  // serve-static hands setHeaders the resolved path of the file it sends
  const assets = resolve(rootPath, 'assets') + sep;
  return [
    ServeStaticModule.forRoot({
      rootPath,
      exclude: ['/api/{*splat}'],
      serveStaticOptions: {
        cacheControl: false,
        setHeaders: (response: Response, filePath: string) => {
          response.setHeader(
            'Cache-Control',
            filePath.startsWith(assets)
              ? 'public, max-age=31536000, immutable'
              : 'no-cache',
          );
          response.setHeader('Content-Security-Policy', BOARD_CSP);
        },
      },
    }),
  ];
}
