import { AccountAuth, AccountAuthError } from './account-auth.ts';
import { AccountDeletionApi, DeletionApiError, DELETION_CONFIRMATION, validProtocol, type DeletionStatus } from './account-deletion-api.ts';
import { startAccountOAuth, callbackUrl } from './account-oauth.ts';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const login = element<HTMLButtonElement>('accountLogin');
const cancelLogin = element<HTMLButtonElement>('accountLoginCancel');
const logout = element<HTMLButtonElement>('accountLogout');
const refresh = element<HTMLButtonElement>('accountRefresh');
const requestButton = element<HTMLButtonElement>('accountRequestButton');
const confirmButton = element<HTMLButtonElement>('accountConfirmButton');
const cancelButton = element<HTMLButtonElement>('accountCancelButton');
const phrase = element<HTMLInputElement>('accountConfirmation');
const receiptCheck = element<HTMLButtonElement>('receiptCheck');
const receiptInput = element<HTMLInputElement>('receiptProtocol');
const feedback = element('accountFeedback');
const key = import.meta.env.VITE_ACCOUNT_PUBLISHABLE_KEY as string | undefined;
const enabled = import.meta.env.VITE_ACCOUNT_WEB_ENABLED === 'true';
let auth: AccountAuth | null = null;
let api: AccountDeletionApi | null = null;
let status: DeletionStatus | null = null;
let pending: ReturnType<typeof startAccountOAuth> | null = null;
let busy = false;
let requestId: string | null = null;
let configured = false;
try {
  callbackUrl(new URL(location.href), import.meta.env.DEV);
  configured = enabled && /^sb_publishable_[A-Za-z0-9_-]+$/.test(key ?? '');
} catch { /* Fixed production route only; local development is explicit. */ }

const stateLabels = {
  REQUESTED: 'Pedido registrado. A exclusão ainda precisa da sua confirmação.',
  CONFIRMED: 'Exclusão confirmada pelo titular. Execução pendente no serviço.',
  EXECUTING: 'Execução em andamento. O cancelamento já não está disponível.',
  AUTH_PENDING: 'Finalização da conta de acesso pendente no serviço.',
  COMPLETED: 'Exclusão concluída segundo o serviço.',
  CANCELLED: 'Pedido cancelado.',
};
const explain = (error: unknown): string => {
  if (error instanceof DeletionApiError) {
    if (error.kind === 'disabled') return 'O serviço de pedidos está desativado. Nenhuma conclusão foi confirmada por esta ação.';
    if (error.kind === 'recent-login') return 'Entre novamente com Google para confirmar: esta etapa exige login recente.';
    if (error.kind === 'expired') return 'Sua sessão expirou. Entre novamente com Google para continuar.';
    if (error.kind === 'invalid') return 'Não foi possível validar a resposta. Não considere esta ação concluída; consulte a situação do pedido.';
  }
  if (error instanceof AccountAuthError) {
    if (error.kind === 'popup') return 'Permita a janela de login neste site e tente novamente.';
    if (error.kind === 'cancelled') return 'Login cancelado. Nenhum pedido foi enviado.';
    if (error.kind === 'expired') return 'O tempo para este login terminou. Inicie um novo login.';
    if (error.kind === 'authentication') return 'Não foi possível confirmar esta conta Google. Use a conta já vinculada ao Apocalypse Run.';
  }
  return 'Não foi possível confirmar o resultado. Tente consultar a situação antes de repetir uma ação.';
};

function render(): void {
  const identity = auth?.identity;
  element('portalAvailability').textContent = !configured
    ? 'Portal ainda não habilitado neste ambiente. Use o contato de assistência; esta página não enviará pedidos.'
    : status && !status.enabled ? 'O servidor informa que o serviço de pedidos está desativado.'
      : status && !status.executionEnabled ? 'Registro de pedidos disponível; a execução de exclusões ainda não está liberada no serviço.'
        : 'Use somente sua conta Google já vinculada. Entrar não registra nem confirma exclusão.';
  login.disabled = !configured || busy;
  login.textContent = identity ? 'Entrar novamente com Google' : 'Entrar com Google';
  cancelLogin.hidden = !pending;
  logout.hidden = !identity;
  logout.disabled = busy;
  element('accountIdentity').textContent = identity ? `Conta Google autenticada${identity.email ? ': ' + identity.email : '.'}` : '';
  element('accountRequest').hidden = !identity || !status;
  if (status) {
    element('accountRequestState').textContent = status.found && status.status ? stateLabels[status.status] : 'Nenhum pedido registrado para esta conta.';
    element('accountProtocol').textContent = status.requestId ? 'Protocolo: ' + status.requestId : '';
  }
  const canRequest = Boolean(status?.enabled && (!status.found || status.status === 'CANCELLED'));
  const canConfirm = Boolean(status?.enabled && status.status === 'REQUESTED');
  const canCancel = Boolean(status?.enabled && ['REQUESTED', 'CONFIRMED'].includes(status.status ?? ''));
  element('accountIntent').hidden = !canRequest && !canConfirm;
  requestButton.hidden = !canRequest;
  confirmButton.hidden = !canConfirm;
  cancelButton.hidden = !canCancel;
  requestButton.disabled = busy || phrase.value !== DELETION_CONFIRMATION;
  confirmButton.disabled = busy || phrase.value !== DELETION_CONFIRMATION || Boolean(status?.needsRecentLogin);
  cancelButton.disabled = busy;
  refresh.disabled = busy;
  receiptCheck.disabled = !configured || busy;
  if (status?.needsRecentLogin && status.status === 'REQUESTED') feedback.textContent = 'Entre novamente com Google para confirmar: esta etapa exige login recente.';
}

async function run(action: () => Promise<void>): Promise<void> {
  if (busy) return;
  busy = true; feedback.textContent = 'Aguarde a resposta do serviço…'; render();
  try { await action(); }
  catch (error) {
    if (error instanceof DeletionApiError && error.kind === 'disabled' && status) status.enabled = false;
    if (error instanceof DeletionApiError && error.kind === 'recent-login' && status) status.needsRecentLogin = true;
    feedback.textContent = explain(error);
    if (!auth?.identity) { status = null; requestId = null; }
  } finally { busy = false; render(); }
}

login.addEventListener('click', () => {
  if (!configured || busy || !key) return;
  // New Auth object per attempt: a cancelled exchange cannot revive another session.
  auth?.clear(); auth = new AccountAuth(key); api = new AccountDeletionApi(key, auth);
  status = null; requestId = null; phrase.value = '';
  void run(async () => {
    pending = startAccountOAuth(auth!, new URL(location.href), import.meta.env.DEV); render();
    try { await pending.result; } finally { pending = null; }
    status = await api!.status();
    feedback.textContent = 'Conta verificada. Nenhum pedido foi enviado pelo login.';
    element('portalTitle').focus();
  });
});
cancelLogin.addEventListener('click', () => pending?.cancel());
logout.addEventListener('click', () => void run(async () => {
  const previous = auth; status = null; requestId = null; phrase.value = '';
  try { await previous?.signOut(); feedback.textContent = 'Sessão encerrada neste navegador. As outras instalações não foram encerradas por esta ação.'; }
  catch { feedback.textContent = 'Sessão descartada neste navegador. Não foi possível confirmar a revogação no servidor.'; }
}));
phrase.addEventListener('input', render);
refresh.addEventListener('click', () => void run(async () => { status = await api!.status(); feedback.textContent = 'Situação consultada no serviço.'; }));
requestButton.addEventListener('click', () => {
  if (phrase.value !== DELETION_CONFIRMATION || !status?.enabled || (status.found && status.status !== 'CANCELLED')) return;
  void run(async () => {
    requestId ??= crypto.randomUUID();
    const receipt = await api!.request(requestId, phrase.value);
    status = { ...status!, ...receipt, found: true }; phrase.value = '';
    feedback.textContent = 'Resposta de registro recebida pelo serviço. Guarde o protocolo e confira a situação mostrada acima.';
  });
});
confirmButton.addEventListener('click', () => {
  if (phrase.value !== DELETION_CONFIRMATION || !status?.enabled || status.status !== 'REQUESTED' || status.needsRecentLogin || !status.requestId) return;
  void run(async () => {
    const receipt = await api!.confirm(status!.requestId!, phrase.value);
    status = { ...status!, ...receipt }; phrase.value = '';
    feedback.textContent = 'Confirmação recebida pelo serviço. Acompanhe a situação; confirmar não significa execução concluída.';
  });
});
cancelButton.addEventListener('click', () => {
  if (!status?.enabled || !['REQUESTED', 'CONFIRMED'].includes(status.status ?? '') || !status.requestId) return;
  void run(async () => {
    const receipt = await api!.cancel(status!.requestId!);
    status = { ...status!, ...receipt }; phrase.value = ''; requestId = null;
    feedback.textContent = 'Resposta de cancelamento recebida. Confira a situação exibida pelo serviço.';
  });
});
receiptCheck.addEventListener('click', () => {
  if (!configured || !key || busy) return;
  const protocol = receiptInput.value.trim();
  if (!validProtocol(protocol)) { element('receiptFeedback').textContent = 'Informe o protocolo do pedido no formato recebido.'; return; }
  element('receiptFeedback').textContent = 'Consultando a conclusão no serviço…';
  void run(async () => {
    try {
      const client = api ?? new AccountDeletionApi(key, new AccountAuth(key));
      const result = await client.completedReceipt(protocol);
      element('receiptFeedback').textContent = result === 'COMPLETED'
        ? 'O serviço confirmou a conclusão para este protocolo.'
        : 'Não há confirmação de conclusão disponível para este protocolo. Essa resposta não identifica uma conta.';
      feedback.textContent = 'Consulta de conclusão respondida pelo serviço.';
    } catch (error) { element('receiptFeedback').textContent = explain(error); throw error; }
  });
});
receiptInput.addEventListener('input', () => { element('receiptFeedback').textContent = ''; });
const expiry = setInterval(() => {
  if (status && !auth?.identity) { status = null; requestId = null; feedback.textContent = 'Sua sessão expirou. Entre novamente com Google para continuar.'; render(); }
}, 5000);
window.addEventListener('pagehide', () => { pending?.cancel(); auth?.clear(); clearInterval(expiry); });
window.addEventListener('pageshow', render);
render();
