import { defineConfig } from 'vite';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  build: { outDir: 'web-dist' },
  server: { host: '127.0.0.1' },
});
