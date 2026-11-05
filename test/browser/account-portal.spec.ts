import { test, expect, type BrowserContext, type Page } from '@playwright/test';
const authOrigin = 'https://uhafxqvaetsrwobpyuak.supabase.co';
const owner = '00000000-0000-4000-8000-000000000006';
const protocol = '00000000-0000-4000-8000-000000000007';
const phrase = 'EXCLUIR MINHA CONTA';

async function fixtures(context: BrowserContext) {
  const harness = {
    calls: [] as { path: string; body: any; authorization?: string }[],
    status: { ownerId: owner, found: false, enabled: true, executionEnabled: false, needsRecentLogin: false, requestId: undefined as string | undefined, status: undefined as string | undefined },
    failRequest: 0, recentError: false, rejectAuth: false, keepPopup: false,
    anonymousResult: 'COMPLETED', nonce: '', tokenExchanges: 0,
  };
  await context.route('https://**', route => route.abort());
  await context.route(authOrigin + '/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/auth/v1/authorize') {
      expect(url.searchParams.get('provider')).toBe('google');
      expect(url.searchParams.get('code_challenge_method')).toBe('s256');
      expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const target = new URL(url.searchParams.get('redirect_to')!);
      expect(target.origin).toBe('http://127.0.0.1:4173');
      expect(target.pathname).toBe('/auth-callback.html');
      harness.nonce = target.searchParams.get('attempt')!;
      expect(harness.nonce).toMatch(/^[A-Za-z0-9_-]{32}$/);
      if (harness.keepPopup) return route.fulfill({ contentType: 'text/html', body: '<p>Provedor sintético aguardando usuário.</p>' });
      target.searchParams.set('code', 'synthetic-one-time-code');
      return route.fulfill({ status: 302, headers: { location: target.href } });
    }
    const body = route.request().postData() ? route.request().postDataJSON() : null;
    harness.calls.push({ path: url.pathname, body, authorization: route.request().headers().authorization });
    if (url.pathname === '/auth/v1/token') {
      harness.tokenExchanges++;
      expect(url.searchParams.get('grant_type')).toBe('pkce');
      expect(body.auth_code).toBe('synthetic-one-time-code');
      expect(body.code_verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
      return route.fulfill({ json: { access_token: 'synthetic-memory-access', refresh_token: 'synthetic-refresh-discarded', provider_token: 'synthetic-provider-discarded', token_type: 'bearer', expires_in: 3600, user: { id: owner } } });
    }
    if (url.pathname === '/auth/v1/user') return route.fulfill({ json: { id: owner, is_anonymous: harness.rejectAuth, email: 'synthetic@example.invalid', identities: [{ provider: 'google' }] } });
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 });
    const rpc = url.pathname.split('/').at(-1);
    if (rpc === 'ar_account_deletion_status') return route.fulfill({ json: harness.status });
    if (rpc === 'ar_deletion_receipt') return route.fulfill({ json: { status: harness.anonymousResult } });
    if (rpc === 'ar_request_account_deletion' && harness.failRequest-- > 0) return route.fulfill({ status: 500, json: { message: 'synthetic-sensitive-provider-data' } });
    if (rpc === 'ar_confirm_account_deletion' && harness.recentError) return route.fulfill({ status: 400, json: { message: 'RECENT_LOGIN_REQUIRED' } });
    if (['ar_request_account_deletion', 'ar_confirm_account_deletion', 'ar_cancel_account_deletion'].includes(rpc!)) {
      if (rpc !== 'ar_cancel_account_deletion') expect(body.p_confirmation).toBe(phrase);
      expect(Object.keys(body).sort()).toEqual(rpc === 'ar_cancel_account_deletion' ? ['p_request'] : ['p_confirmation', 'p_request']);
      const status = rpc === 'ar_request_account_deletion' ? 'REQUESTED' : rpc === 'ar_confirm_account_deletion' ? 'CONFIRMED' : 'CANCELLED';
      Object.assign(harness.status, { found: true, requestId: body.p_request, status });
      return route.fulfill({ json: { ownerId: owner, requestId: body.p_request, status } });
    }
    throw new Error('Unexpected auth/account endpoint in synthetic test: ' + url.pathname);
  });
  return harness;
}
const mutations = (h: Awaited<ReturnType<typeof fixtures>>) => h.calls.filter(c => /ar_(request|confirm|cancel)_account_deletion$/.test(c.path));
async function signIn(page: Page) {
  await page.getByRole('button', { name: /^Entrar.*Google$/ }).click();
  await expect(page.locator('#accountIdentity')).toContainText('synthetic@example.invalid');
  await expect(page.locator('#accountRefresh')).toBeEnabled();
}

test('Google login only reads status; request, confirmation and cancellation require separate explicit actions', async ({ page, context }) => {
  const h = await fixtures(context);
  await page.goto('/exclusao-conta.html');
  await signIn(page);
  expect(mutations(h)).toHaveLength(0);
  await expect(page.locator('#accountRequestButton')).toBeDisabled();
  await page.locator('#accountConfirmation').fill(phrase);
  await page.locator('#accountRequestButton').click();
  await expect(page.locator('#accountRequestState')).toContainText('Pedido registrado');
  await expect(page.locator('#accountConfirmation')).toHaveValue('');
  await expect(page.locator('#accountConfirmButton')).toBeDisabled();
  await page.locator('#accountConfirmation').fill(phrase);
  await page.locator('#accountConfirmButton').click();
  await expect(page.locator('#accountRequestState')).toContainText('Exclusão confirmada pelo titular');
  await expect(page.locator('#accountFeedback')).toContainText('confirmar não significa execução concluída');
  await page.locator('#accountCancelButton').click();
  await expect(page.locator('#accountRequestState')).toHaveText('Pedido cancelado.');
  expect(mutations(h).map(c => c.path.split('/').at(-1))).toEqual(['ar_request_account_deletion', 'ar_confirm_account_deletion', 'ar_cancel_account_deletion']);
  expect(h.tokenExchanges).toBe(1);
  expect(await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage), cookie: document.cookie }))).toEqual({ local: [], session: [], cookie: '' });
  await page.getByRole('button', { name: 'Sair deste navegador' }).click();
  await expect(page.locator('#accountIdentity')).toHaveText('');
  expect(h.calls.filter(c => c.path === '/auth/v1/logout')).toHaveLength(1);
});

test('BroadcastChannel completes the one-time callback even when the provider severs window.opener', async ({ page, context }) => {
  const h = await fixtures(context);
  await context.addInitScript(() => { if (location.pathname === '/auth-callback.html') window.opener = null; });
  await page.goto('/exclusao-conta.html');
  await signIn(page);
  expect(h.tokenExchanges).toBe(1);
  expect(mutations(h)).toHaveLength(0);
});

test('service disabled is explicit and never exposes mutations; execution states cannot be cancelled', async ({ page, context }) => {
  const h = await fixtures(context);
  h.status.enabled = false;
  await page.goto('/exclusao-conta.html'); await signIn(page);
  await expect(page.locator('#portalAvailability')).toContainText('serviço de pedidos está desativado');
  await expect(page.locator('#accountRequestButton')).toBeHidden();
  await expect(page.locator('#accountConfirmButton')).toBeHidden();
  h.status.enabled = true; h.status.found = true; h.status.requestId = protocol;
  for (const status of ['EXECUTING', 'AUTH_PENDING', 'COMPLETED']) {
    h.status.status = status;
    await page.locator('#accountRefresh').click();
    await expect(page.locator('#accountCancelButton')).toBeHidden();
    await expect(page.locator('#accountConfirmButton')).toBeHidden();
  }
  expect(mutations(h)).toHaveLength(0);
});

test('recent login is enforced by server errors and reauthentication does not auto-confirm', async ({ page, context }) => {
  const h = await fixtures(context);
  Object.assign(h.status, { found: true, status: 'REQUESTED', requestId: protocol });
  await page.goto('/exclusao-conta.html'); await signIn(page);
  h.recentError = true;
  await page.locator('#accountConfirmation').fill(phrase); await page.locator('#accountConfirmButton').click();
  await expect(page.locator('#accountFeedback')).toContainText('login recente');
  await expect(page.locator('#accountConfirmButton')).toBeDisabled();
  h.recentError = false; h.status.needsRecentLogin = false;
  await signIn(page);
  expect(mutations(h)).toHaveLength(1);
  await expect(page.locator('#accountConfirmation')).toHaveValue('');
  await page.locator('#accountConfirmation').fill(phrase); await page.locator('#accountConfirmButton').click();
  await expect(page.locator('#accountRequestState')).toContainText('Exclusão confirmada');
});

test('failed request is never shown as success, retries retain its UUID and raw diagnostics stay hidden', async ({ page, context }) => {
  const h = await fixtures(context); h.failRequest = 1;
  await page.goto('/exclusao-conta.html'); await signIn(page);
  await page.locator('#accountConfirmation').fill(phrase); await page.locator('#accountRequestButton').click();
  await expect(page.locator('#accountFeedback')).toContainText('Não foi possível confirmar o resultado');
  await expect(page.locator('body')).not.toContainText('synthetic-sensitive-provider-data');
  await expect(page.locator('#accountRequestState')).toContainText('Nenhum pedido registrado');
  await page.locator('#accountRequestButton').click();
  await expect(page.locator('#accountRequestState')).toContainText('Pedido registrado');
  expect(mutations(h)[0].body.p_request).toBe(mutations(h)[1].body.p_request);
});

test('cancelled login and forged return messages never create a session or deletion request', async ({ page, context }) => {
  const h = await fixtures(context); h.keepPopup = true;
  await page.goto('/exclusao-conta.html');
  await page.getByRole('button', { name: 'Entrar com Google', exact: true }).click();
  await expect.poll(() => h.nonce.length).toBe(32);
  await page.evaluate(nonce => window.dispatchEvent(new MessageEvent('message', { origin: 'https://evil.invalid', source: window,
    data: { type: 'aprun-oauth-result', attempt: nonce, code: 'synthetic-one-time-code', failed: false } })), h.nonce);
  await page.getByRole('button', { name: 'Cancelar este login' }).click();
  await expect(page.locator('#accountFeedback')).toContainText('Login cancelado');
  expect(h.tokenExchanges).toBe(0); expect(mutations(h)).toHaveLength(0);
});

test('callback immediately clears code/query/implicit fragment and orphan callbacks do not redeem credentials', async ({ page, context }) => {
  const h = await fixtures(context);
  await page.goto('/auth-callback.html?attempt=' + 'a'.repeat(32) + '&code=synthetic-one-time-code#access_token=synthetic-forbidden');
  await expect(page).toHaveURL('http://127.0.0.1:4173/auth-callback.html');
  expect(await page.evaluate(() => Object.keys(localStorage).length + Object.keys(sessionStorage).length)).toBe(0);
  expect(h.tokenExchanges).toBe(0);
  await expect(page.locator('body')).not.toContainText('synthetic-one-time-code');
  await expect(page.locator('body')).not.toContainText('synthetic-forbidden');
});

test('expired login nonce is rejected even if a throttled timeout has not run', async ({ page, context }) => {
  const h = await fixtures(context); h.keepPopup = true;
  await page.clock.install();
  await page.goto('/exclusao-conta.html');
  await page.getByRole('button', { name: 'Entrar com Google', exact: true }).click();
  await expect.poll(() => h.nonce.length).toBe(32);
  const future = await page.evaluate(() => Date.now() + 6 * 60 * 1000);
  await page.clock.setSystemTime(new Date(future));
  await page.evaluate(nonce => {
    const channel = new BroadcastChannel('aprun-account-oauth-' + nonce);
    channel.postMessage({ type: 'aprun-oauth-result', attempt: nonce, code: 'synthetic-one-time-code', failed: false });
    setTimeout(() => channel.close(), 1);
  }, h.nonce);
  await expect(page.locator('#accountFeedback')).toContainText('tempo para este login terminou');
  expect(h.tokenExchanges).toBe(0); expect(mutations(h)).toHaveLength(0);
});

test('completion receipt remains available after Auth deletion without personal lookup or bearer token', async ({ page, context }) => {
  const h = await fixtures(context);
  await page.goto('/exclusao-conta.html');
  await page.locator('.account-receipt summary').click();
  await page.locator('#receiptProtocol').fill(protocol); await page.locator('#receiptCheck').click();
  await expect(page.locator('#receiptFeedback')).toContainText('confirmou a conclusão');
  const call = h.calls.find(c => c.path.endsWith('/ar_deletion_receipt'))!;
  expect(call.authorization).toBeUndefined(); expect(call.body).toEqual({ p_request: protocol });
  h.anonymousResult = 'UNAVAILABLE'; await page.locator('#receiptCheck').click();
  await expect(page.locator('#receiptFeedback')).toContainText('não identifica uma conta');
  expect(h.tokenExchanges).toBe(0); expect(mutations(h)).toHaveLength(0);
});

test('authenticated portal and confirmation controls fit mobile and keyboard navigation', async ({ page, context }) => {
  await fixtures(context);
  await page.goto('/exclusao-conta.html'); await signIn(page);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.locator('#portalTitle').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.qa/account-06d-mobile.png' });
  await page.locator('#accountConfirmation').focus(); await page.keyboard.type(phrase);
  await page.keyboard.press('Tab'); await expect(page.locator('#accountRequestButton')).toBeFocused();
});
