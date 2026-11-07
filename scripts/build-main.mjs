import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, context } from 'esbuild';

/**
 * Bundles the Electron main process and the preload script with esbuild.
 *
 * Both outputs are CommonJS because Electron loads them from disk without a
 * module loader of its own. The renderer is bundled separately by Vite.
 */
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(scriptDir, '..');

const COMMON_OPTIONS = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  sourcemap: false,
  minify: false,
  legalComments: 'none',
  logLevel: 'info',
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
};

export function createBuildConfigs(root = projectRoot) {
  return [
    {
      ...COMMON_OPTIONS,
      entryPoints: [path.join(root, 'src/main/index.ts')],
      outfile: path.join(root, 'dist/main/index.js'),
    },
    {
      ...COMMON_OPTIONS,
      entryPoints: [path.join(root, 'src/preload/index.ts')],
      outfile: path.join(root, 'dist/preload/index.js'),
    },
  ];
}

/**
 * @param {{ root?: string, watch?: boolean, onRebuild?: (changed: string) => void }} [options]
 * @returns {Promise<null | { dispose(): Promise<void> }>}
 */
export async function buildMainProcess(options = {}) {
  const { root = projectRoot, watch = false, onRebuild } = options;
  const configs = createBuildConfigs(root);

  if (!watch) {
    await Promise.all(configs.map((config) => build(config)));
    return null;
  }

  const rebuildPlugin = (entryName) => ({
    name: 'notify-rebuild',
    setup(buildApi) {
      buildApi.onEnd((result) => {
        if (result.errors.length === 0 && onRebuild) onRebuild(entryName);
      });
    },
  });

  const contexts = await Promise.all(
    configs.map((config, index) =>
      context({
        ...config,
        plugins: [rebuildPlugin(index === 0 ? 'main' : 'preload')],
      }),
    ),
  );
  await Promise.all(contexts.map((ctx) => ctx.watch()));

  return {
    async dispose() {
      await Promise.all(contexts.map((ctx) => ctx.dispose()));
    },
  };
}

const isDirectRun = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  buildMainProcess({ watch: false }).catch((error) => {
    console.error('[build-main] failed', error);
    process.exitCode = 1;
  });
}
