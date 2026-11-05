import { ACCOUNT_SITE_ORIGIN, ACCOUNT_CALLBACK_PATH } from './account-auth.ts';
import { oauthChannel, validOAuthResult, type OAuthResult } from './account-oauth.ts';

declare global { interface Window { __aprunOAuthResult?: OAuthResult } }

const result = window.__aprunOAuthResult;
delete window.__aprunOAuthResult;
const status = document.getElementById('callbackStatus')!;
const production = location.origin === ACCOUNT_SITE_ORIGIN && location.pathname === ACCOUNT_CALLBACK_PATH;
const development = import.meta.env.DEV && location.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(location.hostname) && location.pathname === '/auth-callback.html';
if ((!production && !development) || !result || !validOAuthResult(result, result.attempt)) {
  status.textContent = 'Não foi possível validar este retorno. Volte ao portal e inicie um novo login.';
} else {
  const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(oauthChannel(result.attempt));
  let accepted = false;
  const accept = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    const response = value as Record<string, unknown>;
    if (response.type !== 'aprun-oauth-accepted' || response.attempt !== result.attempt || accepted) return;
    accepted = true;
    channel?.close();
    window.removeEventListener('message', receive);
    status.textContent = 'Retorno recebido. Continue na página original para verificar o resultado do login.';
    window.close();
  };
  const receive = (event: MessageEvent) => {
    if (event.origin === location.origin && event.source === window.opener) accept(event.data);
  };
  window.addEventListener('message', receive);
  if (channel) channel.onmessage = event => accept(event.data);
  try { window.opener?.postMessage(result, location.origin); } catch { /* BroadcastChannel also supports a severed opener. */ }
  channel?.postMessage(result);
  result.code = null;
  setTimeout(() => {
    if (!accepted) {
      channel?.close();
      window.removeEventListener('message', receive);
      status.textContent = 'A página original não recebeu este retorno. Volte ao portal e inicie um novo login.';
    }
  }, 5000);
}
