import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        guia: resolve(__dirname, 'guia.html'),
        migracao: resolve(__dirname, 'migracao.html'),
        beta: resolve(__dirname, 'beta.html'),
        comando: resolve(__dirname, 'comando.html'),
        temporadas: resolve(__dirname, 'temporadas.html'),
        patrulha: resolve(__dirname, 'patrulha.html'),
        privacidade: resolve(__dirname, 'privacidade.html'),
        exclusaoConta: resolve(__dirname, 'exclusao-conta.html'),
      },
    },
  },
});
