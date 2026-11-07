import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import type { BrowserWindow } from 'electron';
import { getSmokeOutputDir } from './env';
import { toggleMaximize } from './ipc';

/**
 * Automated startup verification used by `npm run smoke`.
 *
 * The check launches the real application, waits for the renderer, calls the
 * preload bridge through actual IPC, captures a screenshot and writes a machine
 * readable report. Any console error or failed check makes the process exit
 * with a non-zero code, so "it built" can never be confused with "it works".
 */

interface SmokeCheck {
  name: string;
  ok: boolean;
  detail: string;
}

interface RendererProbe {
  bridge: boolean;
  rootTextLength: number;
  title: string;
  infoVersion: string | null;
  infoIsDev: boolean | null;
  themeMode: string | null;
  maximizeRoundTrip: boolean;
  focused: boolean;
}

const PROBE_SCRIPT = `(async () => {
  const api = window.bili;
  if (!api || typeof api !== 'object') {
    return { bridge: false, rootTextLength: 0, title: document.title, infoVersion: null, infoIsDev: null, themeMode: null, maximizeRoundTrip: false, focused: false };
  }
  const info = await api.app.getInfo();
  const theme = await api.theme.get();
  const before = await api.window.getState();
  const maximized = await api.window.toggleMaximize();
  const restored = await api.window.toggleMaximize();
  return {
    bridge: true,
    rootTextLength: (document.getElementById('root')?.textContent ?? '').length,
    title: document.title,
    infoVersion: info.version,
    infoIsDev: info.isDev,
    themeMode: theme.mode,
    maximizeRoundTrip: maximized.maximized === true && restored.maximized === false,
    focused: before.focused === true || restored.focused === true,
  };
})()`;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function waitForRenderer(window: BrowserWindow, timeoutMs = 20_000): Promise<void> {
  const contents = window.webContents;
  if (!contents.isLoadingMainFrame()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = (): void => {
      clearTimeout(timer);
      contents.removeListener('did-finish-load', onFinish);
      contents.removeListener('did-fail-load', onFail);
    };
    const onFinish = (): void => {
      finish();
      resolve();
    };
    const onFail = (...args: unknown[]): void => {
      finish();
      const [, code, description, url] = args as [unknown, number, string, string];
      reject(new Error(`did-fail-load ${String(code)} ${description ?? ''} ${url ?? ''}`));
    };
    const timer = setTimeout(() => {
      finish();
      reject(new Error('Timed out waiting for the renderer to load'));
    }, timeoutMs);
    contents.once('did-finish-load', onFinish);
    contents.on('did-fail-load', onFail);
  });
}

export async function runSmokeChecks(window: BrowserWindow): Promise<void> {
  const outDir = getSmokeOutputDir() ?? path.join(app.getAppPath(), 'artifacts', 'smoke');
  await fs.mkdir(outDir, { recursive: true });

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const contents = window.webContents;
  contents.setBackgroundThrottling(false);

  contents.on('console-message', (...args: unknown[]) => {
    const first = args[0] as { level?: unknown; message?: unknown } | undefined;
    const level = typeof first?.level === 'string' ? first.level : first?.level;
    const message =
      typeof first?.message === 'string'
        ? first.message
        : typeof args[2] === 'string'
          ? args[2]
          : String(first?.message ?? '');
    if (level === 'error' || level === 3) consoleErrors.push(message);
  });
  contents.on('render-process-gone', (_event, details) => {
    pageErrors.push(`render-process-gone: ${details.reason}`);
  });
  contents.on('preload-error', (_event, preloadPath, error) => {
    pageErrors.push(`preload-error: ${preloadPath}: ${error.message}`);
  });
  contents.on('unresponsive', () => pageErrors.push('renderer became unresponsive'));

  const checks: SmokeCheck[] = [];
  let probe: RendererProbe | null = null;
  let screenshotPath: string | null = null;
  let fatalError: string | null = null;

  try {
    await waitForRenderer(window);
    await delay(700);
    probe = (await contents.executeJavaScript(PROBE_SCRIPT, true)) as RendererProbe;

    checks.push({ name: 'bridge-exposed', ok: probe.bridge === true, detail: 'window.bili present in renderer' });
    checks.push({
      name: 'app-info-over-ipc',
      ok: probe.infoVersion === app.getVersion(),
      detail: `renderer=${String(probe.infoVersion)} main=${app.getVersion()}`,
    });
    checks.push({
      name: 'renderer-rendered',
      ok: probe.rootTextLength > 0,
      detail: `${probe.rootTextLength} chars inside #root`,
    });
    checks.push({
      name: 'document-title',
      ok: probe.title.includes('Bili Desktop'),
      detail: probe.title,
    });
    checks.push({
      name: 'theme-ipc',
      ok: probe.themeMode === 'system' || probe.themeMode === 'light' || probe.themeMode === 'dark',
      detail: `mode=${String(probe.themeMode)}`,
    });
    checks.push({
      name: 'window-maximize-round-trip',
      ok: probe.maximizeRoundTrip === true,
      detail: 'toggleMaximize() x2 through IPC',
    });

    // Native side of the same controls (does not depend on the bridge).
    const nativeMaximized = window.isMaximized();
    const toggled = toggleMaximize();
    checks.push({
      name: 'native-window-controls',
      ok: toggled.maximized !== nativeMaximized,
      detail: `native isMaximized=${String(nativeMaximized)} after toggle=${String(toggled.maximized)}`,
    });
    if (window.isMaximized()) window.unmaximize();
    await delay(250);

    const image = await contents.capturePage();
    const png = image.toPNG();
    screenshotPath = path.join(outDir, 'screenshot.png');
    await fs.writeFile(screenshotPath, png);
    checks.push({
      name: 'screenshot',
      ok: png.length > 5_000,
      detail: `${String(png.length)} bytes at ${screenshotPath}`,
    });
    checks.push({
      name: 'console-clean',
      ok: consoleErrors.length === 0,
      detail: consoleErrors.length === 0 ? 'no console errors' : `${consoleErrors.length} error(s)`,
    });
    checks.push({
      name: 'no-page-errors',
      ok: pageErrors.length === 0,
      detail: pageErrors.length === 0 ? 'no page-level errors' : pageErrors.join('; '),
    });
  } catch (error) {
    fatalError = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
    checks.push({ name: 'renderer-load', ok: false, detail: fatalError });
  }

  const ok = checks.every((check) => check.ok) && fatalError === null;
  const result = {
    ok,
    startedAt: new Date().toISOString(),
    appVersion: app.getVersion(),
    electron: process.versions.electron ?? null,
    platform: process.platform,
    checks,
    consoleErrors,
    pageErrors,
    probe,
    screenshot: screenshotPath,
    fatalError,
  };
  const resultPath = path.join(outDir, 'smoke-result.json');
  await fs.writeFile(resultPath, JSON.stringify(result, null, 2), 'utf8');

  const summary = checks.map((check) => `${check.ok ? 'PASS' : 'FAIL'} ${check.name}: ${check.detail}`).join('\n');
  console.log(`[smoke] report: ${resultPath}\n${summary}`);

  // Give stdout a tick to flush before tearing the app down.
  setTimeout(() => {
    app.exit(ok ? 0 : 1);
  }, 250);
}
