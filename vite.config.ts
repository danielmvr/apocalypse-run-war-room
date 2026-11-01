import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        guia: resolve(__dirname, 'guia.html'),
        beta: resolve(__dirname, 'beta.html'),
      },
    },
  },
});
