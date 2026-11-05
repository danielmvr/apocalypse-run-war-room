import { AccountAuth, AccountAuthError, ACCOUNT_AUTH_ORIGIN } from './account-auth.ts';

export const DELETION_CONFIRMATION = 'EXCLUIR MINHA CONTA';
export const DELETION_STATES = ['REQUESTED', 'CONFIRMED', 'EXECUTING', 'AUTH_PENDING', 'COMPLETED', 'CANCELLED'] as const;
export type DeletionState = typeof DELETION_STATES[number];
export type DeletionReceipt = { ownerId: string; requestId: string; status: DeletionState };
export type DeletionStatus = { ownerId: string; found: boolean; enabled: boolean; executionEnabled: boolean; needsRecentLogin: boolean; requestId?: string; status?: DeletionState };
export class DeletionApiError extends Error {
  readonly kind: 'disabled' | 'recent-login' | 'expired' | 'invalid' | 'unavailable';
  constructor(kind: DeletionApiError['kind']) { super(kind); this.kind = kind; this.name = 'DeletionApiError'; }
}
export const validProtocol = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const validState = (value: unknown): value is DeletionState => DELETION_STATES.includes(value as DeletionState);

/** Only named public RPCs. There is deliberately no executor/admin transport. */
export class AccountDeletionApi {
  #key: string;
  #auth: AccountAuth;
  #fetch: typeof fetch;
  constructor(key: string, auth: AccountAuth, transport: typeof fetch = fetch) {
    if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) throw new DeletionApiError('invalid');
    this.#key = key; this.#auth = auth; this.#fetch = (...args) => transport(...args);
  }
  async status(): Promise<DeletionStatus> {
    const value = await this.#call('ar_account_deletion_status', {}) as Record<string, unknown>;
    this.#owner(value);
    if (typeof value.found !== 'boolean' || typeof value.enabled !== 'boolean' || typeof value.executionEnabled !== 'boolean' ||
        typeof value.needsRecentLogin !== 'boolean' || (value.found && (!validProtocol(value.requestId) || !validState(value.status)))) {
      throw new DeletionApiError('invalid');
    }
    return { ownerId: value.ownerId as string, found: value.found, enabled: value.enabled, executionEnabled: value.executionEnabled,
      needsRecentLogin: value.needsRecentLogin, ...(value.found ? { requestId: value.requestId as string, status: value.status as DeletionState } : {}) };
  }
  request(requestId: string, confirmation: string): Promise<DeletionReceipt> {
    return this.#mutate('ar_request_account_deletion', requestId, confirmation);
  }
  confirm(requestId: string, confirmation: string): Promise<DeletionReceipt> {
    return this.#mutate('ar_confirm_account_deletion', requestId, confirmation);
  }
  cancel(requestId: string): Promise<DeletionReceipt> {
    return this.#mutate('ar_cancel_account_deletion', requestId);
  }
  async completedReceipt(requestId: string): Promise<'COMPLETED' | 'UNAVAILABLE'> {
    if (!validProtocol(requestId)) throw new DeletionApiError('invalid');
    const value = await this.#call('ar_deletion_receipt', { p_request: requestId }, true) as Record<string, unknown>;
    if (!value || typeof value !== 'object' || Object.keys(value).length !== 1 || !['COMPLETED', 'UNAVAILABLE'].includes(value.status as string)) {
      throw new DeletionApiError('invalid');
    }
    return value.status as 'COMPLETED' | 'UNAVAILABLE';
  }
  async #mutate(name: 'ar_request_account_deletion' | 'ar_confirm_account_deletion' | 'ar_cancel_account_deletion', requestId: string, confirmation?: string): Promise<DeletionReceipt> {
    if (!validProtocol(requestId) || (name !== 'ar_cancel_account_deletion' && confirmation !== DELETION_CONFIRMATION)) throw new DeletionApiError('invalid');
    const value = await this.#call(name, { p_request: requestId, ...(confirmation === undefined ? {} : { p_confirmation: confirmation }) }) as Record<string, unknown>;
    this.#owner(value);
    if (!validProtocol(value.requestId) || !validState(value.status) || (name !== 'ar_request_account_deletion' && value.requestId !== requestId)) {
      throw new DeletionApiError('invalid');
    }
    return { ownerId: value.ownerId as string, requestId: value.requestId, status: value.status };
  }
  #owner(value: Record<string, unknown>): void {
    if (!value || typeof value !== 'object' || !this.#auth.identity || value.ownerId !== this.#auth.identity.id) throw new DeletionApiError('invalid');
  }
  async #call(name: string, body: Record<string, unknown>, anonymous = false): Promise<unknown> {
    try {
      const response = await this.#fetch(`${ACCOUNT_AUTH_ORIGIN}/rest/v1/rpc/${name}`, {
        method: 'POST', redirect: 'error', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
        headers: { apikey: this.#key, 'Content-Type': 'application/json', ...(anonymous ? {} : { Authorization: this.#auth.authorizationHeader() }) },
        body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        if (response.status === 401) { this.#auth.clear(); throw new DeletionApiError('expired'); }
        let message: unknown;
        try { message = (await response.json()).message; } catch { /* Never surface server text. */ }
        if (message === 'PRIVACY_DISABLED') throw new DeletionApiError('disabled');
        if (message === 'RECENT_LOGIN_REQUIRED') throw new DeletionApiError('recent-login');
        throw new DeletionApiError('unavailable');
      }
      return await response.json();
    } catch (error) {
      if (error instanceof DeletionApiError) throw error;
      if (error instanceof AccountAuthError && error.kind === 'expired') throw new DeletionApiError('expired');
      throw new DeletionApiError('unavailable');
    }
  }
}
