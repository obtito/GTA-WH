import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    hmr: false,
    // Large binary assets must never enter the watcher: watching them raised EBUSY inside
    // FSWatcher and killed the dev server (same class of issue as GTA_SZ#4).
    watch: {
      usePolling: false,
      ignored: ['**/data/**', '**/artifacts/**', '**/output/**', '**/*.glb', '**/*.hdr'],
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4096,
  },
});
