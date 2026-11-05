import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Inspect local candidates without contacting a provider, signup or game API.
  await page.route('https://**', route => route.abort());
  await page.route('**/public-war-fixture', route => route.fulfill({ json: {
    schemaVersion: 1, asOf: '2026-11-05T12:00:00Z', season: null,
    war: { factions: [{ id: 'HUMAN', score: 0, ownedCells: 0 }, { id: 'ZOMBIE', score: 0, ownedCells: 0 }],
      players: { total: 0, active24h: 0 }, discoveredCells: 0, contestedCells: 0 }, cells: [], events: [],
  } }));
});

test('privacy candidates describe actual data and do not present an active deletion service', async ({ page }) => {
  for (const path of ['/privacidade.html', '/exclusao-conta.html']) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(path.includes('privacidade') ? 'Política de Privacidade' : 'Solicitar exclusão');
    await expect(page.getByRole('note')).toContainText('AINDA NÃO ATIV');
    await expect(page.locator('main')).toContainText('não há');
    await expect(page.locator('form,input[type=password],textarea')).toHaveCount(0);
    if (path === '/privacidade.html') {
      await expect(page.locator('input,button')).toHaveCount(0);
      await expect(page.locator('script:not([src="/@vite/client"])')).toHaveCount(0);
    } else {
      await expect(page.getByRole('button', { name: 'Entrar com Google', exact: true })).toBeVisible();
    }
  }
  await page.goto('/privacidade.html');
  for (const text of ['pares de posições GPS', 'células territoriais H3', 'passos', 'Google', 'Supabase', 'OpenFreeMap', 'CARTO', 'Cloudflare', 'GitHub', 'Guia de Campo', 'Arca']) {
    await expect(page.locator('main')).toContainText(text);
  }
  await expect(page.locator('#retencao').locator('..')).toContainText('Ainda não há um prazo geral aprovado');
});

test('assistance link has no credential payload and cannot silently submit or delete anything', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => { if (request.method() !== 'GET') requests.push(request.method() + ' ' + request.url()); });
  await page.goto('/exclusao-conta.html');
  const contact = page.getByRole('link', { name: 'Pedir assistência por e-mail' });
  const href = await contact.getAttribute('href');
  expect(href).toBe('mailto:appcalypserun@gmail.com?subject=Assist%C3%AAncia%20com%20exclus%C3%A3o%20de%20conta%20Apocalypse%20Run');
  await expect(page.locator('main')).toContainText('nada é enviado automaticamente');
  await expect(page.locator('main')).toContainText('E-mail, apelido e protocolo isolados não autorizam apagar uma conta');
  await expect(page.locator('main')).toContainText('Não envie senhas');
  await expect(page.locator('main')).toContainText('operação de execução ainda não está ativa');
  expect(requests).toEqual([]);
});

test('public footer links reach both candidates without changing recruitment form behavior', async ({ page }) => {
  for (const path of ['/', '/beta.html', '/guia.html', '/migracao.html', '/temporadas.html']) {
    await page.goto(path);
    await expect(page.locator('footer').getByRole('link', { name: 'Privacidade (candidata)' })).toHaveAttribute('href', /privacidade\.html$/);
    await expect(page.locator('footer').getByRole('link', { name: 'Exclusão de conta (candidata)' })).toHaveAttribute('href', /exclusao-conta\.html$/);
  }
  await page.goto('/beta.html');
  await page.locator('footer').getByRole('link', { name: 'Privacidade (candidata)' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Política de Privacidade');
  await page.locator('header').getByRole('link', { name: 'Exclusão de conta' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Solicitar exclusão de conta');
});

test('candidate content stays readable at mobile widths and enlarged text with keyboard access', async ({ page }) => {
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/privacidade.html', '/exclusao-conta.html']) {
      await page.goto(path);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      if (width === 390) await page.screenshot({ path: `.qa/${path.slice(1, -5)}-06c-mobile.png` });
    }
  }
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/exclusao-conta.html');
  await page.addStyleTag({ content: 'body{font-size:200% !important}' });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.keyboard.press('Tab');
  await expect(page.locator('header .migration-brand')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('header nav a').first()).toBeFocused();
});
