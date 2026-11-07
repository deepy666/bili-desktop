import { spawn } from 'node:child_process';
import path from 'node:path';
import { createServer } from 'vite';
import electronPath from 'electron';
import { buildMainProcess, projectRoot } from './build-main.mjs';

/**
 * Development runner.
 *  - starts the Vite dev server for the React renderer (HMR)
 *  - bundles main + preload with esbuild in watch mode and restarts Electron
 *    whenever those files change
 */
const viteConfigPath = path.join(projectRoot, 'vite.config.ts');
const server = await createServer({ configFile: viteConfigPath });
await server.listen();

const serverUrl = server.resolvedUrls?.local?.[0] ?? 'http://127.0.0.1:5173/';
const devServerUrl = serverUrl.replace(/\/+$/, '');
server.printUrls();

/** @type {import('node:child_process').ChildProcess | null} */
let electronProcess = null;
/** @type {NodeJS.Timeout | null} */
let restartTimer = null;
let shuttingDown = false;
let firstBuildFinished = false;
/** @type {() => void} */
let markFirstBuild = () => {};
const firstBuild = new Promise((resolve) => {
  markFirstBuild = resolve;
});

function launchElectron() {
  const env = { ...process.env, VITE_DEV_SERVER_URL: devServerUrl, ELECTRON_ENABLE_LOGGING: '1' };
  // See scripts/smoke.mjs: this variable would make Electron behave as Node.js.
  delete env.ELECTRON_RUN_AS_NODE;
  const electronArgs = [];
  // Hosts whose Chromium process sandbox cannot initialize need this switch
  // (Electron otherwise dies with 0x80000003 before the main script runs).
  if (process.env.BILI_NO_SANDBOX === '1') electronArgs.push('--no-sandbox');
  electronArgs.push('.');
  electronProcess = spawn(electronPath, electronArgs, {
    cwd: projectRoot,
    stdio: 'inherit',
    env,
  });
  electronProcess.on('exit', (code) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[dev] Electron exited with code ${String(code ?? 0)}, stopping dev server`);
    void shutdown(code ?? 0);
  });
}

async function shutdown(code) {
  if (restartTimer !== null) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  try {
    await buildHandle?.dispose();
  } catch (error) {
    console.error('[dev] failed to dispose esbuild contexts', error);
  }
  try {
    await server.close();
  } catch (error) {
    console.error('[dev] failed to close Vite server', error);
  }
  process.exit(code);
}

function scheduleRestart() {
  if (shuttingDown) return;
  if (restartTimer !== null) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    if (shuttingDown) return;
    console.log('[dev] main process changed, restarting Electron');
    const previous = electronProcess;
    electronProcess = null;
    if (previous === null) {
      launchElectron();
      return;
    }
    previous.once('exit', () => {
      if (!shuttingDown) launchElectron();
    });
    previous.kill();
  }, 250);
}

const buildHandle = await buildMainProcess({
  watch: true,
  onRebuild: () => {
    if (!firstBuildFinished) {
      firstBuildFinished = true;
      markFirstBuild();
      return;
    }
    scheduleRestart();
  },
});

await firstBuild;
launchElectron();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    electronProcess?.kill();
    console.log(`[dev] received ${signal}, shutting down`);
    void shutdown(0);
  });
}
