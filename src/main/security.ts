import type { Session, WebContents } from 'electron';
import { session } from 'electron';
import { APP_ORIGIN } from './protocol';
import { getDevServerUrl } from './env';

/**
 * Security helpers for the local shell (our own React UI).
 *
 * The remote Bilibili page lives in a separate, non-persistent session; see
 * `web-view-manager.ts`. The rules here only apply to the trusted renderer.
 */

/** True for URLs that are allowed to talk to the preload API. */
export function isTrustedSenderUrl(raw: string): boolean {
  if (typeof raw !== 'string' || raw.length === 0) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  const devServer = getDevServerUrl();
  if (devServer !== null) {
    try {
      return url.origin === new URL(devServer).origin;
    } catch {
      return false;
    }
  }
  return url.protocol === 'app:' && url.hostname === 'bundle' && APP_ORIGIN === `app://bundle`;
}

/** The shell window may only load its own bundled page or the Vite dev server. */
export function isTrustedShellUrl(raw: string): boolean {
  return isTrustedSenderUrl(raw);
}

/** Hardens the session used by our own UI: no device permissions, no downloads. */
export function hardenShellSession(): void {
  const shellSession = session.defaultSession;
  shellSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  shellSession.setPermissionCheckHandler(() => false);
  shellSession.setSpellCheckerEnabled(false);
  shellSession.on('will-download', (event) => event.preventDefault());
}

/**
 * Prevents the trusted shell from navigating away from the bundled renderer or
 * opening new windows. Any attempt to leave is simply cancelled.
 */
export function guardShellContents(contents: WebContents): void {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, url) => {
    if (!isTrustedShellUrl(url)) event.preventDefault();
  });
  contents.on('will-redirect', (event, url) => {
    if (!isTrustedShellUrl(url)) event.preventDefault();
  });
}

/**
 * Hardens the non-persistent Bilibili session used by `WebContentsView`.
 * Permission prompts are denied, downloads are cancelled and proxy/certificate
 * overrides are impossible because this is a normal Chromium session.
 */
export function hardenRemoteSession(remoteSession: Session): void {
  remoteSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  remoteSession.setPermissionCheckHandler(() => false);
  remoteSession.setSpellCheckerEnabled(false);
  remoteSession.setDisplayMediaRequestHandler((_request, callback) => callback({}));
  remoteSession.on('will-download', (event) => event.preventDefault());
}
