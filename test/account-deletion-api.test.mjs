import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountAuth } from '../src/account-auth.ts';
import { AccountDeletionApi, DeletionApiError, DELETION_CONFIRMATION } from '../src/account-deletion-api.ts';
const owner = '00000000-0000-4000-8000-000000000006';
const request = '00000000-0000-4000-8000-000000000007';
const key = 'sb_publishable_synthetic06d';
async function client(answer) {
  const auth = new AccountAuth(key, async url => Response.json(url.endsWith('/user')
    ? { id: owner, is_anonymous: false, identities: [{ provider: 'google' }] }
    : { access_token: 'synthetic-access', token_type: 'bearer', expires_in: 60, user: { id: owner } }));
  await auth.exchange('synthetic-code', 'v'.repeat(43));
  const calls = [];
  const api = new AccountDeletionApi(key, auth, async (url, options) => {
    calls.push({ url, options });
    return typeof answer === 'function' ? answer(url, options) : Response.json(answer);
  });
  return { auth, api, calls };
}
test('status validates owner and booleans and strips extras without creating a request', async () => {
  const { api, calls } = await client({ ownerId: owner, found: true, enabled: false, executionEnabled: false, needsRecentLogin: true, requestId: request, status: 'REQUESTED', private: 'discard' });
  assert.deepEqual(await api.status(), { ownerId: owner, found: true, enabled: false, executionEnabled: false, needsRecentLogin: true, requestId: request, status: 'REQUESTED' });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/rpc\/ar_account_deletion_status$/);
  assert.deepEqual(JSON.parse(calls[0].options.body), {});
});
test('named mutation contracts send only request UUID and explicit confirmation, never owner/email', async () => {
  const { api, calls } = await client({ ownerId: owner, requestId: request, status: 'CONFIRMED' });
  await api.request(request, DELETION_CONFIRMATION);
  await api.confirm(request, DELETION_CONFIRMATION);
  await api.cancel(request);
  assert.deepEqual(calls.map(c => c.url.split('/').at(-1)), ['ar_request_account_deletion', 'ar_confirm_account_deletion', 'ar_cancel_account_deletion']);
  assert.deepEqual(calls.map(c => JSON.parse(c.options.body)), [{ p_request: request, p_confirmation: DELETION_CONFIRMATION }, { p_request: request, p_confirmation: DELETION_CONFIRMATION }, { p_request: request }]);
  assert.ok(calls.every(c => c.options.headers.Authorization === 'Bearer synthetic-access' && c.options.redirect === 'error'));
  await assert.rejects(api.request(request, 'EXCLUIR'), DeletionApiError);
  await assert.rejects(api.confirm(owner, 'wrong'), DeletionApiError);
  assert.equal(calls.length, 3);
});
test('cross-owner, mismatched confirmation receipts and malformed statuses are rejected', async () => {
  for (const value of [{ ownerId: request, requestId: request, status: 'CONFIRMED' }, { ownerId: owner, requestId: owner, status: 'CONFIRMED' }, { ownerId: owner, requestId: request, status: 'INVENTED' }]) {
    const { api } = await client(value);
    await assert.rejects(api.confirm(request, DELETION_CONFIRMATION), DeletionApiError);
  }
  const { api } = await client({ ownerId: owner, found: false, enabled: 'true', executionEnabled: false, needsRecentLogin: false });
  await assert.rejects(api.status(), DeletionApiError);
});
test('only exact known service errors are classified; raw responses are never surfaced', async () => {
  for (const [message, kind] of [['PRIVACY_DISABLED', 'disabled'], ['RECENT_LOGIN_REQUIRED', 'recent-login'], ['synthetic-sensitive-data', 'unavailable']]) {
    const { api } = await client(() => Response.json({ message }, { status: 400 }));
    await assert.rejects(api.status(), error => error instanceof DeletionApiError && error.kind === kind && !String(error).includes('sensitive'));
  }
  const { auth, api } = await client(() => new Response(null, { status: 401 }));
  await assert.rejects(api.status(), error => error.kind === 'expired');
  assert.equal(auth.identity, null);
});
test('post-deletion receipt is anonymous, status-only and never looks up a personal identifier', async () => {
  const { api, auth, calls } = await client({ status: 'COMPLETED' });
  auth.clear();
  assert.equal(await api.completedReceipt(request), 'COMPLETED');
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(calls[0].options.body), { p_request: request });
  assert.match(calls[0].url, /\/rpc\/ar_deletion_receipt$/);
  const invalid = await client({ status: 'COMPLETED', ownerId: owner });
  await assert.rejects(invalid.api.completedReceipt(request), DeletionApiError);
});
