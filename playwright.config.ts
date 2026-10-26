import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/browser',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:4173/apocalypse-run-war-room/', headless: true },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/apocalypse-run-war-room/',
    env: { VITE_PUBLIC_WAR_API: 'http://127.0.0.1:4173/public-war-fixture' },
    reuseExistingServer: false,
  },
});
