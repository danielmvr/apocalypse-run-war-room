import { test, expect } from '@playwright/test';
import { latLngToCell, gridDisk, cellToLatLng } from 'h3-js';

const ids = gridDisk(latLngToCell(0, 0, 9), 1).slice(0, 6);
const structures = ['RUINAS', 'ABRIGO', 'RADIO', 'LABORATORIO', 'DEPOSITO', 'FORTALEZA'];
const cells = ids.map((id, i) => ({ id, owner: i === 0 ? 'ZOMBIE' : 'HUMAN', control: 650, contagion: 10, structure: structures[i] }));
const makeSeason = (human = 25, zombie = 10, leader: string | null = 'HUMAN') => ({ number: 2,
  startsAt: '2026-10-19T03:00:00Z', endsAt: '2026-10-26T03:00:00Z',
  factions: [{ id: 'HUMAN', score: human }, { id: 'ZOMBIE', score: zombie }], leader });
const payload = (season: unknown = makeSeason()) => ({ schemaVersion: 1, asOf: '2026-10-25T21:00:00Z',
  war: { factions: [{ id: 'HUMAN', score: 950, ownedCells: 5 }, { id: 'ZOMBIE', score: 100, ownedCells: 1 }],
    players: { total: 0, active24h: 0 }, discoveredCells: 6, contestedCells: 0 }, season, cells,
  events: [{ id: 'synthetic-event', kind: 'CAPTURE', actorType: 'PLAYER', faction: 'HUMAN', at: '2026-10-25T20:00:00Z', structure: 'ABRIGO' }] });

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-25T21:00:00Z') });
  // Real MapLibre/WebGL and H3 geometry, deterministic basemap without external tiles.
  await page.route('https://basemaps.cartocdn.com/**', route => route.fulfill({ json: { version: 8, sources: {}, layers: [] } }));
  await page.route('**/public-war-fixture', route => route.fulfill({ json: payload() }));
});

test('official weekly values stay independent; null, malformed, tie and zeros render honestly', async ({ page }) => {
  await page.goto('test/browser/harness.html');
  const card = page.locator('.side > article');
  await expect(card).toContainText('Resistência na liderança');
  await expect(card.locator('.season-line strong')).toHaveText(['25', '10']);
  await expect(page.locator('.score.zombie .score-foot')).toHaveText('1 território dominado');
  await expect(page.locator('.score.human .score-main')).toContainText('950');
  for (const season of [null, {}, makeSeason(0, 0, null), makeSeason(8, 8, null), makeSeason(8, 8, 'HUMAN'), makeSeason(10, 40, 'ZOMBIE')]) {
    await page.route('**/public-war-fixture', route => route.fulfill({ json: payload(season) }));
    await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
    if (!season || !('factions' in season)) {
      await expect(card).toContainText('Placar semanal indisponível');
      await expect(card.locator('.season-line strong')).toHaveText(['--', '--']);
    } else {
      await expect(card.locator('.season-line strong')).toHaveText(season.factions.map(f => String(f.score)));
      await expect(card).toContainText(season.leader === 'HUMAN' ? 'Resistência na liderança' : season.leader === 'ZOMBIE' ? 'Horda na liderança' : 'Empate no placar semanal');
    }
    await expect(page.locator('.score.human .score-main')).toContainText('950');
  }
});

test('automatic refresh and boundary replace the old season without modifying real data', async ({ page }) => {
  let calls = 0;
  await page.route('**/public-war-fixture', route => { calls++; return route.fulfill({ json: payload(makeSeason()) }); });
  await page.goto('test/browser/harness.html');
  await expect(page.locator('.season-status')).toHaveText('Resistência na liderança');
  const previous = calls;
  await page.clock.runFor(60_000);
  await expect.poll(() => calls).toBeGreaterThan(previous);
  const next = { ...makeSeason(0, 0, null), number: 3, startsAt: '2026-10-26T03:00:00Z', endsAt: '2026-11-02T03:00:00Z' };
  await page.route('**/public-war-fixture', route => route.fulfill({ json: payload(next) }));
  await page.clock.fastForward(6 * 60 * 60 * 1000);
  await expect(page.locator('.side h3')).toContainText('Temporada 3');
  await expect(page.locator('.season-line strong')).toHaveText(['0', '0']);
});

test('expired season is unavailable if the API still returns the previous week', async ({ page }) => {
  await page.goto('test/browser/harness.html');
  await expect(page.locator('.season-status')).toHaveText('Resistência na liderança');
  await page.clock.fastForward(6 * 60 * 60 * 1000);
  await expect(page.locator('.season-status')).toHaveText('Placar semanal indisponível');
  await expect(page.locator('.season-line strong')).toHaveText(['--', '--']);
});

test('API outage identifies previous data and reading time on mobile/desktop, then recovers', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('test/browser/harness.html');
  await expect(page.locator('.score.human .score-main')).toContainText('950');
  await expect(page.locator('.live')).toHaveClass('live online');
  const previousTime = await page.locator('.timestamp').textContent();
  await page.route('**/public-war-fixture', route => route.fulfill({ status: 503, json: { error: 'Data unavailable' } }));
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const warning = page.getByRole('status').filter({ hasText: 'dados anteriores' });
    await expect(warning).toBeVisible();
    await expect(warning).toContainText('Falha na atualização');
    await expect(warning).toContainText(previousTime!);
    await expect(page.locator('.live')).not.toHaveClass(/online/);
    await expect(page.locator('.score.human .score-main')).toContainText('950');
    await expect(page.locator('.season-line strong')).toHaveText(['25', '10']);
    if (width === 390) {
      await expect(page.locator('.ar-site-marker')).toHaveCount(6);
      await page.clock.resume();
      await page.waitForFunction(() => !(window as any).warMap.isMoving());
      await page.screenshot({ path: '.qa/war-room-mobile-stale.png', fullPage: true });
    }
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.route('**/public-war-fixture', route => route.fulfill({ json: { ...payload(), asOf: '2026-10-25T21:01:00Z' } }));
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await expect(page.locator('.sync')).toContainText('Atualizado');
  await expect(page.locator('.timestamp--warning')).toHaveCount(0);
  await expect(page.locator('.live')).toHaveClass('live online');
  await expect(page.locator('.score.human .score-main')).toContainText('950');
});

test('all six pin tips meet H3 centers through zoom, desktop/mobile resize, filters and popups', async ({ page }) => {
  // Keep map animations advancing normally for geometric measurement.
  await page.clock.resume();
  await page.goto('test/browser/harness.html');
  await expect(page.locator('.ar-site-marker')).toHaveCount(6);
  await page.waitForFunction(() => !(window as any).warMap.isMoving());
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const credit = page.locator('footer').getByRole('link', { name: '© OpenStreetMap contributors · ODbL' });
    await expect(credit).toBeVisible();
    await expect(credit).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
    for (const zoom of [9, 13, 16]) {
      await page.evaluate(zoom => (window as any).warMap.jumpTo({ center: [0, 0], zoom }), zoom);
      await page.waitForFunction(() => !(window as any).warMap.isMoving());
      const errors = await page.evaluate(centers => {
        const map = (window as any).warMap;
        const viewport = map.getContainer().getBoundingClientRect();
        return [...document.querySelectorAll('.ar-site-pin__stem')].map((stem, index) => {
          const rect = stem.getBoundingClientRect();
          const [lat, lng] = centers[index];
          const expected = map.project([lng, lat]);
          return Math.hypot(rect.left + rect.width / 2 - viewport.left - expected.x, rect.bottom - viewport.top - expected.y);
        });
      }, ids.map(id => cellToLatLng(id)));
      expect(Math.max(...errors)).toBeLessThan(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  }
  await page.getByRole('group', { name: 'Filtrar territórios por facção' }).getByRole('button', { name: 'Horda', exact: true }).click();
  await expect(page.locator('.ar-site-marker')).toHaveCount(1);
  await page.getByRole('button', { name: 'Centralizar territórios' }).click();
  await page.waitForFunction(() => !(window as any).warMap.isMoving());
  const pin = page.locator('.ar-site-pin');
  await pin.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Detalhes do território')).toContainText('Ruínas');
  await page.getByRole('button', { name: 'Fechar detalhes' }).click();
  await expect(page.getByLabel('Detalhes do território')).toHaveCount(0);
  await page.getByRole('group', { name: 'Filtrar territórios por facção' }).getByRole('button', { name: 'Todos', exact: true }).click();
  await expect(page.locator('.ar-site-marker')).toHaveCount(6);
  await expect(page.locator('.ar-site-pin__surface svg')).toHaveCount(6);
  await page.getByRole('group', { name: 'Filtrar eventos por facção' }).getByRole('button', { name: 'Horda', exact: true }).click();
  await expect(page.locator('.ar-event-empty')).toContainText('Nenhuma ocorrência');
  await page.getByRole('group', { name: 'Filtrar eventos por facção' }).getByRole('button', { name: 'Todos', exact: true }).click();
  await expect(page.locator('.ar-event-entry')).toHaveCount(1);
  for (const button of await page.locator('.filters button, .ar-event-filter button').all()) {
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole('button', { name: 'Centralizar territórios' }).click();
  await page.waitForFunction(() => !(window as any).warMap.isMoving());
  await page.screenshot({ path: '.qa/war-room-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Centralizar territórios' }).click();
  await page.waitForFunction(() => !(window as any).warMap.isMoving());
  await page.screenshot({ path: '.qa/war-room-desktop.png', fullPage: true });
});
