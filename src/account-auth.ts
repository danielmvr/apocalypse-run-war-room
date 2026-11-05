/** Controlled Supabase social-login HTTP. No SDK, signup or persistent session. */
export const ACCOUNT_AUTH_ORIGIN = 'https://uhafxqvaetsrwobpyuak.supabase.co';
export const ACCOUNT_SITE_ORIGIN = 'https://danielmvr.github.io';
export const ACCOUNT_CALLBACK_PATH = '/apocalypse-run-war-room/auth-callback.html';

export type AccountIdentity = { id: string; email: string | null };
type ActiveSession = { access: string; expiresAt: number; identity: AccountIdentity };

export class AccountAuthError extends Error {
  readonly kind: 'configuration' | 'expired' | 'authentication' | 'unavailable' | 'cancelled' | 'popup';
  constructor(kind: 'configuration' | 'expired' | 'authentication' | 'unavailable' | 'cancelled' | 'popup') {
    super(kind);
    this.kind = kind;
    this.name = 'AccountAuthError';
  }
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export async function createPkceAttempt(): Promise<{ verifier: string; challenge: string; nonce: string }> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)), nonce: base64url(crypto.getRandomValues(new Uint8Array(24))) };
}

export class AccountAuth {
  #key: string;
  #fetch: typeof fetch;
  #clock: () => number;
  #session: ActiveSession | null = null;
  #generation = 0;

  constructor(key: string, transport: typeof fetch = fetch, clock: () => number = Date.now) {
    if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) throw new AccountAuthError('configuration');
    this.#key = key;
    this.#fetch = (...args) => transport(...args);
    this.#clock = clock;
  }

  get identity(): AccountIdentity | null {
    if (this.#session && this.#session.expiresAt <= this.#clock()) this.clear();
    return this.#session ? { ...this.#session.identity } : null;
  }

  authorizationHeader(): string {
    if (!this.identity || !this.#session) throw new AccountAuthError('expired');
    return `Bearer ${this.#session.access}`;
  }

  /** Refresh token/provider credentials are intentionally not retained. */
  async exchange(code: string, verifier: string): Promise<AccountIdentity> {
    this.clear();
    const generation = this.#generation;
    const startedAt = this.#clock();
    if (!/^[A-Za-z0-9_-]{8,512}$/.test(code) || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) {
      throw new AccountAuthError('authentication');
    }
    const value = await this.#request('/auth/v1/token?grant_type=pkce', 'POST', { auth_code: code, code_verifier: verifier });
    if (!value || typeof value !== 'object') throw new AccountAuthError('authentication');
    const session = value as Record<string, unknown>;
    if (generation !== this.#generation) throw new AccountAuthError('cancelled');
    if (typeof session.access_token !== 'string' || session.access_token.length < 8 || session.token_type !== 'bearer' ||
        !Number.isSafeInteger(session.expires_in) || Number(session.expires_in) < 1 || Number(session.expires_in) > 86400) {
      throw new AccountAuthError('authentication');
    }
    const user = await this.#request('/auth/v1/user', 'GET', undefined, session.access_token) as Record<string, unknown>;
    if (!user || typeof user !== 'object' || typeof user.id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id) || user.is_anonymous !== false ||
        !Array.isArray(user.identities) || !user.identities.some(identity => identity && typeof identity === 'object' && identity.provider === 'google') ||
        !session.user || typeof session.user !== 'object' || (session.user as Record<string, unknown>).id !== user.id) {
      throw new AccountAuthError('authentication');
    }
    const identity = { id: user.id, email: typeof user.email === 'string' ? user.email : null };
    if (generation !== this.#generation) throw new AccountAuthError('cancelled');
    this.#session = { access: session.access_token, expiresAt: startedAt + Number(session.expires_in) * 1000, identity };
    return { ...identity };
  }

  clear(): void { this.#session = null; this.#generation++; }

  /** Only an explicit user action calls this; logout is scoped to this session. */
  async signOut(): Promise<void> {
    const access = this.#session?.access;
    this.clear();
    if (access) await this.#request('/auth/v1/logout?scope=local', 'POST', undefined, access, true);
  }

  async #request(path: string, method: 'GET' | 'POST', body?: unknown, access?: string, empty = false): Promise<unknown> {
    try {
      const response = await this.#fetch(ACCOUNT_AUTH_ORIGIN + path, {
        method, redirect: 'error', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
        headers: { apikey: this.#key, 'Content-Type': 'application/json', ...(access ? { Authorization: `Bearer ${access}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new AccountAuthError(response.status === 401 || response.status === 403 ? 'authentication' : 'unavailable');
      return empty ? null : await response.json();
    } catch (error) {
      if (error instanceof AccountAuthError) throw error;
      throw new AccountAuthError('unavailable');
    }
  }
}
