import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // No production API, tiles, CAPTCHA or signup is contacted by this suite.
  await page.route('**/public-war-fixture', route => route.fulfill({ json: {
    schemaVersion: 1, asOf: '2026-11-04T12:00:00Z', season: null,
    war: { factions: [{ id: 'HUMAN', score: 0, ownedCells: 0 }, { id: 'ZOMBIE', score: 0, ownedCells: 0 }],
      players: { total: 0, active24h: 0 }, discoveredCells: 0, contestedCells: 0 }, cells: [], events: [],
  } }));
  await page.route('https://basemaps.cartocdn.com/**', route => route.fulfill({ json: { version: 8, sources: {}, layers: [] } }));
  await page.route('https://challenges.cloudflare.com/**', route => route.abort());
  await page.route('https://uhafxqvaetsrwobpyuak.supabase.co/**', route => route.abort());
});

test('home separates recruits from veterans and retains the floating recruitment control', async ({ page }) => {
  await page.goto('/');
  const paths = page.getByRole('region', { name: 'Escolha seu caminho no Apocalypse Run' });
  await expect(paths.getByRole('link', { name: 'Comece pela Google Play' })).toHaveAttribute('href', '/beta.html');
  await expect(paths.getByRole('link', { name: 'Preserve seu sobrevivente' })).toHaveAttribute('href', '/migracao.html');
  await expect(page.locator('.beta-invite-entry')).toHaveAttribute('href', './beta.html');
  await paths.getByRole('link', { name: 'Comece pela Google Play' }).click();
  await expect(page).toHaveURL(/beta\.html$/);
  await expect(page.getByRole('link', { name: /Veterano da Alpha/ })).toHaveAttribute('href', './migracao.html');
  await page.getByRole('link', { name: /Veterano da Alpha/ }).click();
  await expect(page.getByRole('heading', { name: 'Preserve seu sobrevivente.' })).toBeVisible();
  await expect(page.getByRole('note', { name: 'Proteja sua instalação Alpha' })).toContainText('NÃO DESINSTALE');
});

test('migration prerequisites, identity boundary and historical limits are explicit', async ({ page }) => {
  await page.goto('/migracao.html');
  await expect(page.locator('main')).toContainText('versionCode 1140');
  await expect(page.locator('main')).toContainText('fora deste aparelho');
  await expect(page.locator('main')).toContainText('uma não atualiza diretamente a outra');
  await expect(page.locator('main')).toContainText('Estar na lista da Play não garante autorização OAuth');
  await expect(page.locator('main')).toContainText('Recuperar minha conta');
  await expect(page.locator('main')).toContainText('não são caminhada real');
  await expect(page.getByRole('link', { name: /Atualizar minha Alpha existente/ })).toHaveAttribute('href', 'https://github.com/danielmvr/apocalypse-run-downloads/releases/tag/alpha-debug-latest');
  await expect(page.getByRole('link', { name: /Guia técnico oficial/ })).toHaveAttribute('href', 'https://github.com/danielmvr/apocalypse-run-downloads/releases/download/alpha-debug-latest/GUIA-MIGRACAO.md');
  await expect(page.locator('form, input')).toHaveCount(0);
  // Vite's development client is injected by the local test server, not this page.
  await expect(page.locator('script:not([src="/@vite/client"])')).toHaveCount(0);
});

test('field guide preserves profiles and animations while first chapter offers the two current paths', async ({ page }) => {
  await page.goto('/guia.html');
  await expect(page.locator('#headerVersion')).toContainText('TUTORIAL · BASE 0.20.0');
  await expect(page.locator('#chapterContent')).toContainText('versionCode 1140');
  await expect(page.locator('#chapterContent')).toContainText('referência 0.20.0/build 128');
  await expect(page.locator('#chapterContent a[href*="app-debug.apk"]')).toHaveCount(0);
  await expect(page.locator('#chapterContent a[href="./beta.html"]')).toBeVisible();
  await expect(page.locator('#chapterContent a[href="./migracao.html"]')).toBeVisible();
  await expect(page.locator('#heroMotionToggle')).toBeVisible();
  const pathsBeforeProfile = await page.locator('#chapterContent .chapter-support a').allTextContents();
  const buttons = page.getByRole('button');
  await expect(buttons.filter({ hasText: 'Esportista' }).first()).toBeVisible();
  await buttons.filter({ hasText: 'Estrategista' }).first().click();
  await expect(page.locator('#chapterContent')).toContainText('não define se você é novo ou veterano');
  expect(await page.locator('#chapterContent .chapter-support a').allTextContents()).toEqual(pathsBeforeProfile);
  await expect(page.locator('#chapterContent')).toContainText('Novo recruta:');
  await expect(page.locator('#chapterContent')).toContainText('Veterano:');
  await page.locator('#nextChapter').click();
  await expect(page.locator('#chapterContent')).toContainText('Escolha quem você será');
});

test('recruitment validation and submission remain unchanged using local mocks only', async ({ page }) => {
  await page.unroute('https://challenges.cloudflare.com/**');
  await page.route('https://challenges.cloudflare.com/**', route => route.fulfill({ contentType: 'application/javascript', body: `
    window.turnstile = { render: (_, options) => { setTimeout(options.callback, 0); return 'synthetic-widget'; },
      getResponse: () => 'synthetic-test-token', reset: () => {} };
  ` }));
  let sent: unknown = null;
  await page.unroute('https://uhafxqvaetsrwobpyuak.supabase.co/**');
  await page.route('**/functions/v1/beta-signup', async route => {
    expect(route.request().method()).toBe('POST');
    sent = route.request().postDataJSON();
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto('/beta.html');
  await expect(page.locator('#submitButton')).toBeEnabled();
  await page.locator('#submitButton').click();
  await expect(page.locator('#feedback')).toContainText('endereço de e-mail válido');
  expect(sent).toBeNull();
  await page.locator('#playEmail').fill('synthetic@example.invalid');
  await page.locator('#submitButton').click();
  await expect(page.locator('#feedback')).toContainText('necessário concordar');
  expect(sent).toBeNull();
  await page.locator('#consent').check();
  await page.locator('#submitButton').click();
  await expect(page.locator('#feedback')).toContainText('Solicitação recebida para análise');
  expect(sent).toEqual({ email: 'synthetic@example.invalid', consent: true, consentVersion: 'beta-2026-11', website: '', turnstileToken: 'synthetic-test-token' });
});

test('editorial routes fit mobile widths, preserve large text and expose comfortable focusable links', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [320, 360, 412, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/beta.html', '/guia.html', '/migracao.html']) {
      await page.goto(path);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      if (path === '/') {
        for (const link of await page.locator('.entry-path a').all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(48);
      }
    }
  }
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/migracao.html');
  // Enlarged text only in this test; no persistent browser or product setting changes.
  await page.addStyleTag({ content: '.migration-page {font-size:200%} .migration-steps p {font-size:inherit}' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const link = page.getByRole('link', { name: /Atualizar minha Alpha existente/ });
  await link.focus();
  await expect(link).toBeFocused();
  await page.screenshot({ path: '.qa/migration-mobile-large-text.png', fullPage: true });
});
