import path from 'node:path';
import { app, Menu } from 'electron';
import { isSmokeRun } from './env';
import { registerIpcHandlers } from './ipc';
import { installAppProtocol, registerAppScheme } from './protocol';
import { hardenShellSession } from './security';
import { runSmokeChecks } from './smoke';
import { createMainWindow } from './window';
import { getMainWindow } from './window-registry';

/**
 * Bili Desktop main process entry point.
 *
 * Security model:
 *  - the local React UI runs sandboxed with contextIsolation and no Node.js,
 *  - the remote Bilibili site will live in a WebContentsView (phase 3) with its
 *    own non-persistent session and an origin allow list,
 *  - every IPC channel is explicitly registered and validates its sender.
 */

// Allow constrained hosts (or automated tests) to keep the Chromium profile
// outside the default roaming profile. Normal desktop installs never set this.
const customUserDataDir = process.env.BILI_USER_DATA_DIR;
if (typeof customUserDataDir === 'string' && path.isAbsolute(customUserDataDir)) {
  app.setPath('userData', customUserDataDir);
}

if (process.env.BILI_DISABLE_GPU === '1') {
  app.disableHardwareAcceleration();
}
if (process.platform === 'win32') {
  app.setAppUserModelId('com.bilidesktop.app');
}

registerAppScheme();

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const window = getMainWindow();
    if (window === null) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  app
    .whenReady()
    .then(async () => {
      Menu.setApplicationMenu(null);
      hardenShellSession();
      installAppProtocol(path.join(app.getAppPath(), 'dist', 'renderer'));
      registerIpcHandlers();

      const window = createMainWindow();

      if (isSmokeRun()) {
        const watchdog = setTimeout(() => {
          console.error('[smoke] watchdog timeout, exiting with code 2');
          app.exit(2);
        }, 90_000);
        await runSmokeChecks(window);
        clearTimeout(watchdog);
      }
    })
    .catch((error: unknown) => {
      console.error('[main] startup failed', error);
      if (isSmokeRun()) app.exit(1);
      else app.quit();
    });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
