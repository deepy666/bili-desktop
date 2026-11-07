import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { net, protocol } from 'electron';

/**
 * The packaged renderer is served from a custom `app://` protocol instead of
 * `file://` so it gets a real secure origin (relative URLs, history API and CSP
 * headers all behave normally) without disabling web security.
 */
export const APP_SCHEME = 'app';
export const APP_HOST = 'bundle';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
export const APP_INDEX_URL = `${APP_ORIGIN}/index.html`;

/** Must run before `app.whenReady()`. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: false,
        bypassCSP: false,
      },
    },
  ]);
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/**
 * Content-Security-Policy for the local renderer. Remote pages never use it:
 * they are loaded from their own origin in a separate session.
 */
const RENDERER_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

function notFound(message: string): Response {
  return new Response(message, { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

/**
 * Serves files below `rendererRoot` for the `app://bundle` origin. The handler
 * rejects traversal outside the root and refuses unknown hosts.
 */
export function installAppProtocol(rendererRoot: string): void {
  const root = path.resolve(rendererRoot);
  protocol.handle(APP_SCHEME, async (request) => {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return notFound('Bad request');
    }
    if (url.hostname !== APP_HOST) return notFound('Unknown host');

    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return notFound('Bad path');
    }
    if (pathname === '' || pathname === '/') pathname = '/index.html';

    const filePath = path.resolve(root, `.${pathname}`);
    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
      return notFound('Forbidden');
    }

    const fileUrl = pathToFileURL(filePath).toString();
    let response: Response;
    try {
      response = await net.fetch(fileUrl);
    } catch {
      return notFound('Not found');
    }
    if (!response.ok) return notFound('Not found');

    const ext = path.extname(filePath).toLowerCase();
    const headers = new Headers(response.headers);
    headers.set('content-type', MIME_TYPES[ext] ?? 'application/octet-stream');
    headers.set('content-security-policy', RENDERER_CSP);
    headers.set('x-content-type-options', 'nosniff');
    return new Response(response.body, { status: response.status, headers });
  });
}
