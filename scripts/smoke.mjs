import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';

/**
 * Real startup smoke test.
 *
 * Launches the built application, lets the main process run its own checks
 * (renderer load, IPC bridge, window controls, screenshot, console errors) and
 * exits with a non-zero code when anything fails.
 *
 * Usage: `npm run build && npm run smoke`
 */
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const mainEntry = path.join(projectRoot, 'dist', 'main', 'index.js');

if (!fs.existsSync(mainEntry)) {
  console.error('[smoke] dist/main/index.js is missing, run `npm run build` first');
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(projectRoot, 'artifacts', 'smoke', stamp);
fs.mkdirSync(outDir, { recursive: true });

const resultPath = path.join(outDir, 'smoke-result.json');
const logPath = path.join(outDir, 'electron.log');
const logStream = fs.createWriteStream(logPath, { flags: 'a' });

const env = {
  ...process.env,
  BILI_SMOKE: '1',
  BILI_SMOKE_OUT: outDir,
  // Software rendering keeps the smoke test deterministic on CI/headless hosts.
  BILI_DISABLE_GPU: process.env.BILI_SMOKE_GPU === '1' ? '0' : '1',
};
// Some terminal/agent environments export ELECTRON_RUN_AS_NODE=1, which would
// silently turn the Electron binary into plain Node.js and break the launch.
delete env.ELECTRON_RUN_AS_NODE;

// Keep every smoke run isolated from the real user profile so repeated runs are
// deterministic and never touch the settings of an installed copy.
const profileDir = path.join(outDir, 'profile');
const electronArgs = [`--user-data-dir=${profileDir}`];
// Some Windows hosts cannot initialize the Chromium process sandbox at all
// (Electron dies with 0x80000003 before any app code runs). Set
// BILI_NO_SANDBOX=1 on such hosts to make the smoke run possible there.
if (process.env.BILI_NO_SANDBOX === '1') electronArgs.push('--no-sandbox');
electronArgs.push('.');

const child = spawn(electronPath, electronArgs, { cwd: projectRoot, env, stdio: ['ignore', 'pipe', 'pipe'] });

child.stdout.on('data', (chunk) => {
  logStream.write(chunk);
  process.stdout.write(chunk);
});
child.stderr.on('data', (chunk) => {
  logStream.write(chunk);
  process.stderr.write(chunk);
});

const timeout = setTimeout(() => {
  console.error('[smoke] timed out after 120s, terminating Electron');
  child.kill();
  process.exitCode = 1;
}, 120_000);

child.on('exit', (code) => {
  clearTimeout(timeout);
  logStream.end();

  let report = null;
  if (fs.existsSync(resultPath)) {
    try {
      report = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
    } catch (error) {
      console.error('[smoke] failed to parse smoke-result.json', error);
    }
  }

  if (report === null) {
    console.error(`[smoke] FAIL: no report written, Electron exited with code ${String(code ?? 1)} (log: ${logPath})`);
    process.exitCode = 1;
    return;
  }

  const passed = report.checks?.filter((check) => check.ok).length ?? 0;
  const total = report.checks?.length ?? 0;
  for (const check of report.checks ?? []) {
    console.log(`${check.ok ? 'PASS' : 'FAIL'}  ${check.name}  ${check.detail}`);
  }
  console.log(`[smoke] ${passed}/${total} checks passed, report: ${resultPath}`);

  if (report.ok === true && code === 0) {
    console.log('[smoke] PASS');
  } else {
    console.error('[smoke] FAIL', report.fatalError ?? '');
    process.exitCode = 1;
  }
});

child.on('error', (error) => {
  clearTimeout(timeout);
  console.error('[smoke] failed to launch Electron', error);
  process.exitCode = 1;
});
