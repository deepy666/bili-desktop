import type {
  AppSettings,
  Rect,
  ThemeMode,
  WebOpenRequest,
  WindowBoundsSettings,
} from './types';

/**
 * Pure validation helpers shared by the processes.
 *
 * Everything that crosses the IPC boundary or is read back from disk is
 * untrusted and must pass through this module. Keeping the rules here (instead
 * of spreading them over the main process) makes them unit-testable without
 * Electron.
 */

export const SETTINGS_SCHEMA_VERSION = 1;

export const DEFAULT_WINDOW_BOUNDS: WindowBoundsSettings = {
  x: null,
  y: null,
  width: 1280,
  height: 820,
  maximized: false,
};

export const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  theme: 'system',
  window: DEFAULT_WINDOW_BOUNDS,
};

export const WINDOW_LIMITS = {
  minWidth: 960,
  minHeight: 640,
  maxWidth: 10_000,
  maxHeight: 10_000,
} as const;

/** Bilibili owned domains the embedded browser is allowed to render. */
const ALLOWED_WEB_HOSTS = ['bilibili.com', 'b23.tv'] as const;

const MAX_URL_LENGTH = 2_048;
const MAX_SEARCH_KEYWORD_LENGTH = 100;
const MAX_EXTERNAL_URL_LENGTH = 2_048;

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function optionalCoordinate(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(value);
}

export function normalizeThemeMode(value: unknown): ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

/** Validates untrusted rectangle data coming from the renderer. */
export function sanitizeRect(value: unknown): Rect | null {
  if (!isPlainRecord(value)) return null;
  const x = optionalCoordinate(value.x);
  const y = optionalCoordinate(value.y);
  const width = clampInteger(value.width, 0, WINDOW_LIMITS.maxWidth, Number.NaN);
  const height = clampInteger(value.height, 0, WINDOW_LIMITS.maxHeight, Number.NaN);
  if (x === null || y === null || Number.isNaN(width) || Number.isNaN(height)) return null;
  return { x, y, width, height };
}

export function sanitizeWindowBounds(
  value: unknown,
  fallback: WindowBoundsSettings = DEFAULT_WINDOW_BOUNDS,
): WindowBoundsSettings {
  if (!isPlainRecord(value)) return { ...fallback };
  return {
    x: optionalCoordinate(value.x),
    y: optionalCoordinate(value.y),
    width: clampInteger(value.width, WINDOW_LIMITS.minWidth, WINDOW_LIMITS.maxWidth, fallback.width),
    height: clampInteger(value.height, WINDOW_LIMITS.minHeight, WINDOW_LIMITS.maxHeight, fallback.height),
    maximized: value.maximized === true,
  };
}

/** Normalizes anything read from the settings file or received over IPC. */
export function normalizeSettings(value: unknown): AppSettings {
  if (!isPlainRecord(value)) return { ...DEFAULT_SETTINGS, window: { ...DEFAULT_WINDOW_BOUNDS } };
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    theme: normalizeThemeMode(value.theme),
    window: sanitizeWindowBounds(value.window),
  };
}

/**
 * True only for `https://bilibili.com` and `https://<sub>.bilibili.com` (or
 * the `b23.tv` short link domain). Everything else must not load inside the
 * embedded view, including `bilibili.com.evil.example`.
 */
export function isAllowedRemoteUrl(raw: string): boolean {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_URL_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  return ALLOWED_WEB_HOSTS.some((base) => host === base || host.endsWith(`.${base}`));
}

/** URLs that may be handed to the operating system's default browser. */
export function isSafeExternalUrl(raw: string): boolean {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_EXTERNAL_URL_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (url.username !== '' || url.password !== '') return false;
  return url.hostname.length > 0;
}

/** A BVID is 12 characters: `BV` followed by ten base58 characters. */
export function isValidBvid(value: unknown): value is string {
  return typeof value === 'string' && /^BV[0-9A-Za-z]{10}$/.test(value);
}

/**
 * Sanitizes a user supplied search term: trims whitespace, drops control
 * characters and enforces a sane length. Returns `null` when nothing usable
 * remains.
 */
export function normalizeSearchKeyword(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SEARCH_KEYWORD_LENGTH);
  return cleaned.length > 0 ? cleaned : null;
}

const BASE = {
  video: (bvid: string) => `https://www.bilibili.com/video/${bvid}/`,
  search: (keyword: string) => `https://search.bilibili.com/all?keyword=${encodeURIComponent(keyword)}`,
  dynamic: () => 'https://t.bilibili.com/',
  history: () => 'https://www.bilibili.com/account/history',
  login: () => 'https://passport.bilibili.com/login',
  space: () => 'https://space.bilibili.com/',
  favorites: () => 'https://space.bilibili.com/',
} as const;

/**
 * Main-process owned URL construction. The renderer can only pick a page kind,
 * it never supplies the final URL, so an attacker controlling the renderer
 * cannot turn the embedded view into an arbitrary web browser.
 */
export function buildWebUrl(request: unknown): string | null {
  if (!isPlainRecord(request)) return null;
  switch (request.kind) {
    case 'video':
      return isValidBvid(request.bvid) ? BASE.video(request.bvid) : null;
    case 'search': {
      const keyword = normalizeSearchKeyword(request.keyword);
      return keyword === null ? null : BASE.search(keyword);
    }
    case 'dynamic':
      return BASE.dynamic();
    case 'history':
      return BASE.history();
    case 'login':
      return BASE.login();
    case 'space':
      return BASE.space();
    case 'favorites':
      return BASE.favorites();
    default:
      return null;
  }
}

/** Validates the renderer payload for `web:open`. */
export function parseWebOpenRequest(value: unknown): WebOpenRequest | null {
  if (!isPlainRecord(value) || typeof value.kind !== 'string') return null;
  const url = buildWebUrl(value);
  if (url === null) return null;
  return value as unknown as WebOpenRequest;
}

/** Settings patch validation: only `theme` can currently be changed by the renderer. */
export function normalizeSettingsPatch(value: unknown): { theme: ThemeMode } | null {
  if (!isPlainRecord(value)) return null;
  if (!('theme' in value)) return null;
  const theme = normalizeThemeMode(value.theme);
  if (theme !== value.theme) return null;
  return { theme };
}
