import { defineConfig } from 'vite';

export default defineConfig({
  base: '/strzala/',
  server: { host: true },
  build: {
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1500,
  },
});
