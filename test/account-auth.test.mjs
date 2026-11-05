import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { AccountAuth, AccountAuthError, ACCOUNT_AUTH_ORIGIN, createPkceAttempt } from '../src/account-auth.ts';

const id = '00000000-0000-4000-8000-000000000006';
const key = 'sb_publishable_synthetic06d';
const access = 'synthetic-access-value-not-a-real-token';
const verifier = 'v'.repeat(43);
const user = () => ({ id, is_anonymous: false, email: 'synthetic@example.invalid', identities: [{ provider: 'google' }] });
const session = () => ({ access_token: access, refresh_token: 'synthetic-refresh-discarded', provider_token: 'synthetic-provider-discarded',
  token_type: 'bearer', expires_in: 60, user: { id } });
function transport(overrides = {}) {
  const calls = [];
  return { calls, fetch: async (url, options) => {
    calls.push({ url, options });
    if (overrides.throw) throw new Error('synthetic-sensitive-provider-error');
    if (overrides.status) return new Response('synthetic-sensitive-provider-error', { status: overrides.status });
    if (url.endsWith('/auth/v1/user')) return Response.json(overrides.user ?? user());
    if (url.includes('/auth/v1/logout')) return new Response(null, { status: 204 });
    return Response.json(overrides.session ?? session());
  } };
}

test('PKCE uses random independent verifiers/nonces and SHA-256 base64url challenges', async () => {
  const first = await createPkceAttempt();
  const second = await createPkceAttempt();
  assert.match(first.verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.match(first.nonce, /^[A-Za-z0-9_-]{32}$/);
  assert.notEqual(first.verifier, second.verifier);
  assert.notEqual(first.nonce, second.nonce);
  assert.equal(first.challenge, createHash('sha256').update(first.verifier).digest('base64url'));
});

test('only a publishable key is accepted and construction never makes an account request', () => {
  for (const value of ['', 'service_role', 'sb_secret_synthetic', 'eyJ.legacy.synthetic']) assert.throws(() => new AccountAuth(value), AccountAuthError);
  const mock = transport();
  const auth = new AccountAuth(key, mock.fetch);
  assert.equal(auth.identity, null);
  assert.equal(mock.calls.length, 0);
});

test('code exchange is fixed-origin PKCE and confirms the actual Google user before holding a session', async () => {
  const mock = transport();
  const auth = new AccountAuth(key, mock.fetch);
  assert.deepEqual(await auth.exchange('synthetic-auth-code', verifier), { id, email: 'synthetic@example.invalid' });
  assert.deepEqual(mock.calls.map(call => call.url), [ACCOUNT_AUTH_ORIGIN + '/auth/v1/token?grant_type=pkce', ACCOUNT_AUTH_ORIGIN + '/auth/v1/user']);
  assert.deepEqual(JSON.parse(mock.calls[0].options.body), { auth_code: 'synthetic-auth-code', code_verifier: verifier });
  assert.equal(mock.calls[1].options.headers.Authorization, 'Bearer ' + access);
  assert.equal(auth.authorizationHeader(), 'Bearer ' + access);
  for (const call of mock.calls) {
    assert.equal(call.options.redirect, 'error');
    assert.equal(call.options.cache, 'no-store');
    assert.equal(call.options.credentials, 'omit');
    assert.equal(call.options.referrerPolicy, 'no-referrer');
    assert.equal(call.options.headers.apikey, key);
  }
  assert.equal(JSON.stringify(auth), '{}');
  assert.equal(mock.calls.some(call => /signup|rpc|refresh_token|id_token/.test(call.url)), false);
});

test('anonymous, non-Google, mismatched or malformed users never become an active session', async () => {
  for (const value of [{ ...user(), is_anonymous: true }, { ...user(), identities: [{ provider: 'email' }] },
    { ...user(), id: '00000000-0000-4000-8000-000000000007' }, { ...user(), id: 'invalid' }]) {
    const mock = transport({ user: value });
    const auth = new AccountAuth(key, mock.fetch);
    await assert.rejects(auth.exchange('synthetic-auth-code', verifier), AccountAuthError);
    assert.equal(auth.identity, null);
    assert.throws(() => auth.authorizationHeader(), AccountAuthError);
  }
});

test('expired sessions disappear locally without background refresh or logout requests', async () => {
  let now = 1000;
  const mock = transport();
  const auth = new AccountAuth(key, mock.fetch, () => now);
  await auth.exchange('synthetic-auth-code', verifier);
  now += 60_000;
  assert.equal(auth.identity, null);
  assert.throws(() => auth.authorizationHeader(), AccountAuthError);
  assert.equal(mock.calls.length, 2);
});

test('logout affects only the explicit browser session and clears memory before transport failure', async () => {
  const mock = transport();
  const auth = new AccountAuth(key, mock.fetch);
  await auth.exchange('synthetic-auth-code', verifier);
  await auth.signOut();
  assert.equal(mock.calls[2].url, ACCOUNT_AUTH_ORIGIN + '/auth/v1/logout?scope=local');
  assert.equal(auth.identity, null);
  await auth.signOut();
  assert.equal(mock.calls.length, 3);
});

test('clearing an in-flight login prevents late transport from reviving a cancelled session', async () => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const mock = transport();
  const auth = new AccountAuth(key, async (...args) => { await waiting; return mock.fetch(...args); });
  const pending = auth.exchange('synthetic-auth-code', verifier);
  auth.clear();
  release();
  await assert.rejects(pending, error => error.kind === 'cancelled');
  assert.equal(auth.identity, null);
  assert.equal(mock.calls.length, 1);
});

test('failed explicit logout still discards the access session from memory', async () => {
  const mock = transport();
  const auth = new AccountAuth(key, async (url, options) => url.includes('/logout') ? new Response(null, { status: 503 }) : mock.fetch(url, options));
  await auth.exchange('synthetic-auth-code', verifier);
  await assert.rejects(auth.signOut(), AccountAuthError);
  assert.equal(auth.identity, null);
});

test('provider errors are sanitized and invalid callback inputs never trigger network', async () => {
  for (const config of [{ status: 401 }, { status: 500 }, { throw: true }]) {
    const mock = transport(config);
    const auth = new AccountAuth(key, mock.fetch);
    await assert.rejects(auth.exchange('synthetic-auth-code', verifier), error => error instanceof AccountAuthError && !String(error).includes('sensitive'));
    assert.equal(auth.identity, null);
  }
  const mock = transport();
  await assert.rejects(new AccountAuth(key, mock.fetch).exchange('bad', verifier), AccountAuthError);
  await assert.rejects(new AccountAuth(key, mock.fetch).exchange('synthetic-auth-code', 'bad'), AccountAuthError);
  assert.equal(mock.calls.length, 0);
});
