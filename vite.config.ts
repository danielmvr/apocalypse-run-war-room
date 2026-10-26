import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: '/apocalypse-run-war-room/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        guia: resolve(__dirname, 'guia.html'),
      },
    },
  },
});
