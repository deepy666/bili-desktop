import path from 'node:path';
import { BrowserWindow, app, nativeTheme } from 'electron';
import { EVENTS } from '../shared/ipc';
import type { WindowBoundsSettings, WindowState } from '../shared/types';
import { DEFAULT_WINDOW_BOUNDS, WINDOW_LIMITS } from '../shared/validation';
import { getDevServerUrl, isDevelopment } from './env';
import { APP_INDEX_URL } from './protocol';
import { guardShellContents } from './security';
import { setMainWindow } from './window-registry';

export interface CreateMainWindowOptions {
  /** Persisted window geometry; falls back to sensible defaults. */
  bounds?: WindowBoundsSettings;
}

export function getWindowState(window: BrowserWindow): WindowState {
  return {
    maximized: window.isMaximized(),
    fullscreen: window.isFullScreen(),
    focused: window.isFocused(),
  };
}

/** Notifies the renderer whenever the native window state changes. */
export function attachWindowStateEvents(window: BrowserWindow): void {
  const send = (): void => {
    if (window.isDestroyed() || window.webContents.isDestroyed()) return;
    window.webContents.send(EVENTS.windowState, getWindowState(window));
  };
  window.on('maximize', send);
  window.on('unmaximize', send);
  window.on('enter-full-screen', send);
  window.on('leave-full-screen', send);
  window.on('focus', send);
  window.on('blur', send);
}

export function createMainWindow(options: CreateMainWindowOptions = {}): BrowserWindow {
  const bounds = options.bounds ?? DEFAULT_WINDOW_BOUNDS;
  const window = new BrowserWindow({
    width: Math.max(WINDOW_LIMITS.minWidth, bounds.width),
    height: Math.max(WINDOW_LIMITS.minHeight, bounds.height),
    ...(bounds.x !== null && bounds.y !== null ? { x: bounds.x, y: bounds.y } : {}),
    minWidth: WINDOW_LIMITS.minWidth,
    minHeight: WINDOW_LIMITS.minHeight,
    show: false,
    frame: false,
    title: 'Bili Desktop',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f1115' : '#f4f5f7',
    webPreferences: {
      preload: path.join(app.getAppPath(), 'dist', 'preload', 'index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      webviewTag: false,
      spellcheck: false,
      devTools: isDevelopment(),
    },
  });

  window.setMenuBarVisibility(false);
  guardShellContents(window.webContents);
  attachWindowStateEvents(window);

  window.once('ready-to-show', () => {
    if (window.isDestroyed()) return;
    if (bounds.maximized) window.maximize();
    window.show();
  });

  setMainWindow(window);
  window.on('closed', () => setMainWindow(null));

  const devServerUrl = getDevServerUrl();
  const loadPromise = devServerUrl !== null ? window.loadURL(devServerUrl) : window.loadURL(APP_INDEX_URL);
  loadPromise.catch((error: unknown) => {
    console.error('[main] failed to load renderer', error);
  });

  return window;
}
