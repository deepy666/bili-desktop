import path from 'node:path';

/**
 * Resolves the Vite dev server URL injected by `scripts/dev.mjs`.
 * Returning `null` means the app runs against the bundled `app://` renderer.
 */
export function getDevServerUrl(): string | null {
  const raw = process.env.VITE_DEV_SERVER_URL;
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return raw.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function isDevelopment(): boolean {
  return getDevServerUrl() !== null;
}

/** Set by `scripts/smoke.mjs`: run automated checks then exit with a status code. */
export function isSmokeRun(): boolean {
  return process.env.BILI_SMOKE === '1';
}

/** Absolute directory where smoke checks write their report and screenshot. */
export function getSmokeOutputDir(): string | null {
  const dir = process.env.BILI_SMOKE_OUT;
  if (typeof dir !== 'string' || dir.length === 0) return null;
  return path.isAbsolute(dir) ? dir : null;
}
