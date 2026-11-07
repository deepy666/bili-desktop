import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Vite only builds the React renderer. The Electron main process and the
 * preload script are bundled by esbuild (`scripts/build-main.mjs`) because they
 * must be emitted as CommonJS for Electron.
 */
export default defineConfig({
  root: path.resolve(__dirname, 'src/renderer'),
  base: './',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    assetsDir: 'assets',
    sourcemap: false,
  },
});
