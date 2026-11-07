import type { IpcMainInvokeEvent } from 'electron';
import { app, ipcMain, nativeTheme, shell } from 'electron';
import { INVOKE } from '../shared/ipc';
import type { AppInfo, ThemeSnapshot, WindowState } from '../shared/types';
import { isSafeExternalUrl } from '../shared/validation';
import { isDevelopment } from './env';
import { isTrustedSenderUrl } from './security';
import { getWindowState } from './window';
import { getMainWindow } from './window-registry';

/**
 * All privileged IPC goes through this file. `registerInvoke` enforces two
 * independent checks before a handler runs:
 *   1. the frame URL must be our own renderer (bundled page or dev server),
 *   2. the sending WebContents must belong to the main window.
 * Handlers are registered per explicit channel, never through a generic proxy.
 */
export type InvokeHandler = (event: IpcMainInvokeEvent, payload: unknown) => unknown;

const registeredChannels = new Set<string>();

export function registerInvoke(channel: string, handler: InvokeHandler): void {
  if (registeredChannels.has(channel)) throw new Error(`IPC channel registered twice: ${channel}`);
  registeredChannels.add(channel);
  ipcMain.handle(channel, async (event, payload: unknown) => {
    assertTrustedSender(event);
    return handler(event, payload);
  });
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const frameUrl = event.senderFrame?.url ?? '';
  if (!isTrustedSenderUrl(frameUrl)) {
    throw new Error(`Blocked IPC from untrusted origin: ${frameUrl || '<unknown>'}`);
  }
  const window = getMainWindow();
  if (window === null || event.sender !== window.webContents) {
    throw new Error('Blocked IPC from an unknown WebContents');
  }
}

function requireMainWindow() {
  const window = getMainWindow();
  if (window === null) throw new Error('Main window is not available');
  return window;
}

export function buildAppInfo(): AppInfo {
  return {
    name: app.getName(),
    version: app.getVersion(),
    electron: process.versions.electron ?? 'unknown',
    chrome: process.versions.chrome ?? 'unknown',
    node: process.versions.node ?? 'unknown',
    platform: process.platform,
    isDev: isDevelopment(),
  };
}

/** Theme snapshot derived from the native theme source (settings store runs on top). */
export function getThemeSnapshot(): ThemeSnapshot {
  return {
    mode: nativeTheme.themeSource,
    resolved: nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
  };
}

export function toggleMaximize(): WindowState {
  const window = requireMainWindow();
  if (window.isMaximized()) window.unmaximize();
  else window.maximize();
  return getWindowState(window);
}

/** Phase 1 handler set: app info, theme snapshot, window chrome and external links. */
export function registerIpcHandlers(): void {
  registerInvoke(INVOKE.appGetInfo, () => buildAppInfo());

  registerInvoke(INVOKE.windowMinimize, () => {
    requireMainWindow().minimize();
  });

  registerInvoke(INVOKE.windowToggleMaximize, () => toggleMaximize());

  registerInvoke(INVOKE.windowClose, () => {
    requireMainWindow().close();
  });

  registerInvoke(INVOKE.windowGetState, () => getWindowState(requireMainWindow()));

  registerInvoke(INVOKE.themeGet, () => getThemeSnapshot());

  registerInvoke(INVOKE.webOpenExternal, async (_event, payload) => {
    if (!isSafeExternalUrl(payload as string)) return false;
    await shell.openExternal(payload as string);
    return true;
  });
}
