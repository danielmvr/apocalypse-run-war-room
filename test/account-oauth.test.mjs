import test from 'node:test';
import assert from 'node:assert/strict';
import { callbackUrl, validOAuthResult } from '../src/account-oauth.ts';

test('callback uses a fixed production origin/path and explicitly limited local development', () => {
  assert.equal(callbackUrl(new URL('https://danielmvr.github.io/apocalypse-run-war-room/exclusao-conta.html?next=https://evil.invalid'), false).href,
    'https://danielmvr.github.io/apocalypse-run-war-room/auth-callback.html');
  assert.equal(callbackUrl(new URL('http://127.0.0.1:4173/exclusao-conta.html'), true).href, 'http://127.0.0.1:4173/auth-callback.html');
  for (const url of ['https://evil.invalid/exclusao-conta.html', 'https://danielmvr.github.io/other/exclusao-conta.html', 'http://127.0.0.1:4173/exclusao-conta.html']) {
    assert.throws(() => callbackUrl(new URL(url), false));
  }
});
test('callback message requires the exact one-time nonce and a bounded code, never an implicit token', () => {
  const nonce = 'a'.repeat(32);
  const valid = { type: 'aprun-oauth-result', attempt: nonce, code: 'synthetic-auth-code', failed: false };
  assert.equal(validOAuthResult(valid, nonce), true);
  for (const value of [null, { ...valid, attempt: 'b'.repeat(32) }, { ...valid, code: '#access_token=value' }, { ...valid, code: 'x'.repeat(513) }, { ...valid, type: 'other' }]) {
    assert.equal(validOAuthResult(value, nonce), false);
  }
});
