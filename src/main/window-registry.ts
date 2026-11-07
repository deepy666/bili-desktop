import type { BrowserWindow } from 'electron';

/**
 * Single source of truth for the application's main window. IPC handlers and
 * the web view manager use it to verify that a message really came from our
 * own shell window rather than from a remote page or a devtools extension.
 */
let mainWindow: BrowserWindow | null = null;

export function setMainWindow(window: BrowserWindow | null): void {
  mainWindow = window;
}

export function getMainWindow(): BrowserWindow | null {
  if (mainWindow === null || mainWindow.isDestroyed()) return null;
  return mainWindow;
}
