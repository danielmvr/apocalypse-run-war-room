import { AccountAuth, AccountAuthError, ACCOUNT_AUTH_ORIGIN, ACCOUNT_SITE_ORIGIN, ACCOUNT_CALLBACK_PATH, createPkceAttempt, type AccountIdentity } from './account-auth.ts';

export const OAUTH_LIFETIME = 5 * 60 * 1000;
export const oauthChannel = (nonce: string) => `aprun-account-oauth-${nonce}`;
export type OAuthResult = { type: 'aprun-oauth-result'; attempt: string; code: string | null; failed: boolean };

export function callbackUrl(site: URL, development: boolean): URL {
  if (site.origin === ACCOUNT_SITE_ORIGIN && site.pathname === '/apocalypse-run-war-room/exclusao-conta.html') {
    return new URL(ACCOUNT_CALLBACK_PATH, ACCOUNT_SITE_ORIGIN);
  }
  if (development && site.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(site.hostname) && site.pathname === '/exclusao-conta.html') {
    return new URL('/auth-callback.html', site.origin);
  }
  throw new AccountAuthError('configuration');
}

export function validOAuthResult(value: unknown, nonce: string): value is OAuthResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as OAuthResult;
  return result.type === 'aprun-oauth-result' && result.attempt === nonce && /^[A-Za-z0-9_-]{32}$/.test(nonce) &&
    typeof result.failed === 'boolean' && (result.code === null || (typeof result.code === 'string' && /^[A-Za-z0-9_-]{8,512}$/.test(result.code)));
}

/** Verifier, nonce and access session stay in the original tab's memory only. */
export function startAccountOAuth(auth: AccountAuth, site: URL, development: boolean): { result: Promise<AccountIdentity>; cancel: () => void } {
  const callback = callbackUrl(site, development);
  const popup = window.open('about:blank', `aprun-account-${crypto.randomUUID()}`, 'popup,width=520,height=720');
  if (!popup) throw new AccountAuthError('popup');
  let active = true;
  let accepting = false;
  let listener: ((event: MessageEvent) => void) | null = null;
  let channel: BroadcastChannel | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let rejectResult: (reason: unknown) => void;
  const clean = () => {
    if (listener) window.removeEventListener('message', listener);
    channel?.close();
    channel = null;
    if (timeout) clearTimeout(timeout);
    try { popup.close(); } catch { /* COOP can sever the opener reference. */ }
  };
  const result = new Promise<AccountIdentity>((resolve, reject) => {
    rejectResult = reject;
    void (async () => {
      try {
        const attempt = await createPkceAttempt();
        if (!active) return;
        const expiresAt = Date.now() + OAUTH_LIFETIME;
        const monotonicEnd = performance.now() + OAUTH_LIFETIME;
        const finish = async (data: unknown, acknowledge: () => void) => {
          if (!active || accepting || !validOAuthResult(data, attempt.nonce)) return;
          // Background tabs can throttle timers; enforce age on receipt as well.
          if (Date.now() >= expiresAt || performance.now() >= monotonicEnd) {
            active = false; auth.clear(); clean(); reject(new AccountAuthError('expired')); return;
          }
          accepting = true;
          acknowledge();
          // Remove listeners immediately: callback replay cannot trigger a second exchange.
          clean();
          if (data.failed || !data.code) throw new AccountAuthError('authentication');
          let identity: AccountIdentity;
          try { identity = await auth.exchange(data.code, attempt.verifier); }
          finally { attempt.verifier = ''; }
          if (!active) { auth.clear(); return; }
          active = false;
          resolve(identity);
        };
        const consume = (data: unknown, ack: () => void) => {
          void finish(data, ack).catch(error => {
            if (active) { active = false; auth.clear(); clean(); reject(error); }
          });
        };
        listener = event => {
          if (event.origin !== callback.origin || event.source !== popup) return;
          consume(event.data, () => popup.postMessage({ type: 'aprun-oauth-accepted', attempt: attempt.nonce }, callback.origin));
        };
        window.addEventListener('message', listener);
        if (typeof BroadcastChannel !== 'undefined') {
          channel = new BroadcastChannel(oauthChannel(attempt.nonce));
          channel.onmessage = event => consume(event.data, () => channel?.postMessage({ type: 'aprun-oauth-accepted', attempt: attempt.nonce }));
        }
        timeout = setTimeout(() => {
          if (active) { active = false; auth.clear(); clean(); reject(new AccountAuthError('expired')); }
        }, OAUTH_LIFETIME);
        callback.searchParams.set('attempt', attempt.nonce);
        const authorize = new URL('/auth/v1/authorize', ACCOUNT_AUTH_ORIGIN);
        authorize.searchParams.set('provider', 'google');
        authorize.searchParams.set('redirect_to', callback.href);
        authorize.searchParams.set('code_challenge', attempt.challenge);
        authorize.searchParams.set('code_challenge_method', 's256');
        authorize.searchParams.set('prompt', 'select_account');
        popup.location.replace(authorize.href);
      } catch (error) {
        if (active) { active = false; auth.clear(); clean(); reject(error); }
      }
    })();
  });
  return { result, cancel: () => {
    if (!active) return;
    active = false;
    auth.clear();
    clean();
    rejectResult(new AccountAuthError('cancelled'));
  } };
}
