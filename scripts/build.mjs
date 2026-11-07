import path from 'node:path';
import { build as viteBuild } from 'vite';
import { buildMainProcess, projectRoot } from './build-main.mjs';

/**
 * Full production build: Vite bundles the renderer, esbuild bundles the main
 * process and preload script.
 */
const startedAt = Date.now();

try {
  await viteBuild({ configFile: path.join(projectRoot, 'vite.config.ts') });
  console.log('[build] renderer bundled by Vite');
  await buildMainProcess();
  console.log('[build] main process and preload bundled by esbuild');
  console.log(`[build] done in ${String(Date.now() - startedAt)}ms`);
} catch (error) {
  console.error('[build] failed', error);
  process.exitCode = 1;
}
