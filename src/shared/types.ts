/**
 * Shared domain types used by the main process, the preload bridge and the
 * React renderer. Keep this module dependency-free so it can be imported from
 * every process without pulling in Node.js or DOM globals.
 */

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

/** Window geometry persisted between launches. */
export interface WindowBoundsSettings {
  /** Last window x position in DIP, `null` when it was never persisted. */
  x: number | null;
  /** Last window y position in DIP, `null` when it was never persisted. */
  y: number | null;
  width: number;
  height: number;
  maximized: boolean;
}

export interface AppSettings {
  schemaVersion: number;
  theme: ThemeMode;
  window: WindowBoundsSettings;
}

export interface SettingsPatch {
  theme?: ThemeMode;
}

export interface WindowState {
  maximized: boolean;
  fullscreen: boolean;
  focused: boolean;
}

/** Rectangle in device independent pixels, relative to the window content area. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Remote Bilibili destinations the client knows how to open. */
export type WebPageKind =
  | 'video'
  | 'search'
  | 'dynamic'
  | 'favorites'
  | 'history'
  | 'login'
  | 'space';

/**
 * Renderer requests only describe *what* to open. The main process owns URL
 * construction so a compromised renderer cannot navigate the web view to an
 * arbitrary origin.
 */
export type WebOpenRequest =
  | { kind: 'video'; bvid: string }
  | { kind: 'search'; keyword: string }
  | { kind: 'dynamic' }
  | { kind: 'favorites' }
  | { kind: 'history' }
  | { kind: 'login' }
  | { kind: 'space' };

export interface WebViewError {
  code: number;
  description: string;
  url: string;
  mainFrame: boolean;
}

/** Snapshot of the embedded Bilibili web view, pushed to the renderer. */
export interface WebViewState {
  /** True when a remote view exists, is attached to the window and visible. */
  active: boolean;
  kind: WebPageKind | null;
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  error: WebViewError | null;
  /** Human readable notice, e.g. when a navigation was blocked by the allow list. */
  notice: string | null;
  /** Last bounds received from the renderer, in DIP. */
  bounds: Rect | null;
}

export interface AppInfo {
  name: string;
  version: string;
  electron: string;
  chrome: string;
  node: string;
  platform: string;
  isDev: boolean;
}

export interface ThemeSnapshot {
  mode: ThemeMode;
  resolved: ResolvedTheme;
}

/** A single item rendered by the home feed video cards. */
export interface VideoItem {
  bvid: string;
  title: string;
  cover: string;
  author: string;
  /** Human readable duration, e.g. `12:34`. */
  duration: string;
  views: number;
  danmaku: number;
  /** ISO date of publication. */
  publishedAt: string;
  tags: string[];
}

export type VideoSourceKind = 'demo' | 'live';

/**
 * Result returned by the video data adapter layer. The renderer only consumes
 * this shape, so a future legal live source can replace the demo adapter
 * without touching UI code.
 */
export interface HomeFeed {
  source: VideoSourceKind;
  sourceLabel: string;
  fetchedAt: string;
  items: VideoItem[];
  notice: string | null;
}
