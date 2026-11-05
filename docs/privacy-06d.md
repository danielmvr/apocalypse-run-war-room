# 06D — portal web autenticado de conta (em preparação)

Base: `57a40dbe1e900c2182d01f39476310b5c06b4a23` (06C preservada no origin); branch local `codex/privacy-06d`. Não houve merge, deploy, configuração OAuth, criação de conta/jogador, resgate de código real ou execução em produção.

## Contrato OAuth aprovado para preparo local

- Portal: `exclusao-conta.html`, na origem fixa `https://danielmvr.github.io`, sob `/apocalypse-run-war-room/`.
- Retorno: `auth-callback.html?attempt=<nonce aleatório de 192 bits>`, no mesmo prefixo/origem. A allowlist precisa ser limitada a esse path e à query da tentativa; não aceitar URL/origem fornecida em query pelo visitante, glob amplo de domínio ou redirect externo. A configuração real depende de autorização específica e não foi alterada. Conferir a correspondência da query na allowlist do Auth antes do GO.
- Login social Supabase existente: `GET /auth/v1/authorize` com `provider=google`, `redirect_to`, desafio PKCE SHA-256 e método `s256`; troca com `POST /auth/v1/token?grant_type=pkce` e JSON `auth_code`/`code_verifier`; confirmação com `GET /auth/v1/user`. Apenas chave `sb_publishable_…` no cliente.
- Não usar `/oauth/authorize` ou `/oauth/token` do produto Supabase OAuth Server, nem criar novo OAuth client/servidor. Não chamar signup, entrada anônima, join ou vínculo de conta.
- Janela de login aberta pelo clique; página original conserva verifier e nonce em memória, com limite de cinco minutos e consumo único. Callback limpa query/hash em script clássico antes dos assets e usa `no-referrer`; devolve somente código efêmero + nonce ao contexto original. `postMessage` verifica origem/source; `BroadcastChannel` de nome aleatório ligado ao nonce cobre isolamento do opener por COOP. Sem access/refresh tokens no canal, URL, logs, cookies ou storage. Contexto perdido, retorno implicit, popup bloqueado ou nonce inválido falham fechados, sem fallback persistente.
- Login não solicita nem confirma exclusão. API própria do principal deriva o titular da sessão viva. Uma conta Auth legítima sem linha de jogador também pode solicitar exclusão: não se exige consulta/criação de `ar_players`. O bloqueio de novos Google é responsabilidade do hook/configuração servidor: o cliente sozinho não comprova que nenhuma conta Auth será criada. Não habilitar produção sem essa prova e allowlist aprovada.

## Implementação

`src/account-auth.ts`: verificador/desafio/nonce aleatórios; troca HTTP PKCE com origem e paths fixos; validação do usuário Google não anônimo retornado pelo servidor e correspondência com o usuário da sessão. Retém apenas access token/expiração/identidade em campos privados de memória, descarta refresh/provider tokens e não inicia refresh automático. Expiração limpa estado local. Logout `scope=local` somente por ação explícita; não encerra deliberadamente sessões dos outros aparelhos.

`src/account-oauth.ts` e `src/account-callback.ts`: popup, transação PKCE em memória, validação de nonce/origem, retorno sem dependência exclusiva do opener, cancelamento e expiração. Uma troca em andamento não pode restaurar sessão após cancelamento. Retorno órfão não troca códigos por tokens. Não se persiste sequer o verifier em storage.

`src/account-deletion-api.ts`: apenas métodos nomeados para status, solicitação, confirmação, cancelamento e recibo. Origem fixa, publishable key e bearer só nas chamadas autenticadas; campos de saída allowlist, dono comparado ao usuário confirmado e mensagens do servidor nunca exibidas cruas. Apenas `PRIVACY_DISABLED` e `RECENT_LOGIN_REQUIRED` recebem classificação conhecida. Não há método/rota de executor ou administração.

| RPC pública específica | Entrada / resposta |
|---|---|
| `ar_account_deletion_status()` | `{ownerId,found,enabled,executionEnabled,needsRecentLogin,requestId?,status?}` |
| `ar_request_account_deletion(p_request,p_confirmation)` | UUID da tentativa e frase exata `EXCLUIR MINHA CONTA`; recibo `{ownerId,requestId,status}`. Retry após erro preserva o UUID; replay pode retornar protocolo existente do titular |
| `ar_confirm_account_deletion(p_request,p_confirmation)` | Mesma frase; confirmação separada, sem interpretar como execução concluída; servidor exige login Google recente quando aplicável |
| `ar_cancel_account_deletion(p_request)` | Disponível na UI somente em `REQUESTED`/`CONFIRMED`, com serviço ativo; nenhum cancelamento em `EXECUTING` |
| `ar_deletion_receipt(p_request)` | Consulta explícita sem bearer, somente `{status:COMPLETED\|UNAVAILABLE}`; rejeita resposta com dados pessoais ou campos adicionais |

Estados aceitos: `REQUESTED`, `CONFIRMED`, `EXECUTING`, `AUTH_PENDING`, `COMPLETED`, `CANCELLED`. O limite de login recente é requisito de segurança do servidor (dez minutos no contrato), não SLA ou prazo legal. A UI nunca chama executor e não cria resultado bem-sucedido sem resposta validada. O recibo público não procura e-mail/apelido nem divulga dono.

`src/account-portal.ts`: login → consulta de situação → intenção e digitação da frase → registro → nova digitação/ação para confirmação. Estado `enabled:false` desabilita as ações e explica indisponibilidade; `executionEnabled:false` informa execução não liberada. Reautenticação não confirma pedido automaticamente. Logout só por clique e escopo local. Erros mantêm copy honesta; trocar protocolo ou falhar uma consulta não conserva uma conclusão anterior como se fosse a nova resposta.

## Configuração e desativação preservada

`.env.example` mantém `VITE_ACCOUNT_WEB_ENABLED=false` e chave vazia. Nenhuma chave nova ou configuração real foi inserida em `.env.production`; o build padrão não habilita o portal. Só há chave sintética em `playwright.config.ts` para desenvolvimento sob interceptação de rede. Para futura ativação: aprovar hook existente de não criação, redirect exato/query da tentativa, API/ACL/sessões/retentores e fornecer **somente** publishable key em build revisado. Não configurar Auth/Google ou produção por este documento. Origem de produção é fixa; loopback HTTP só é aceito quando o Vite está em modo explícito de desenvolvimento.

## Validação efetiva

- **35 testes Node aprovados**, incluindo regressões da API pública e 16 casos de Auth/PKCE/contratos da conta. Cobrem conta Google não anônima, correspondência de proprietário, headers/paths, nenhum signup/join/link, expiração, cancelamento de login em andamento, logout com falha, erros sanitizados e recibo anônimo sem dados pessoais.
- **24 cenários Chromium aprovados** na suíte completa: dez novos de portal, quatro de privacidade e regressões existentes de recrutamento/rotas/mapa. OAuth é um redirect sintético local interceptado, não login de uma conta real. Cobrem ausência de pedido no login, consumo único, opener removido, query/hash limpos, retorno órfão/forjado/expirado mesmo com timer atrasado, serviço desativado, login recente, retry idempotente, confirmação separada, cancelamento e consulta pós-Auth. Storage/cookie permanecem vazios. Recrutamento é mock; nada real é enviado.
- **TypeScript/Vite build aprovado**, incluindo `auth-callback.html` e portal. Permanece o aviso de bundle do mapa acima de 500 kB, sem refatoração fora de escopo. Preview mobile sintético: `.qa/account-06d-mobile.png` (ignorado no Git). Testes locais não comprovam provider Google, hook/redirect/SQL de produção, execução destrutiva ou aparelho físico.

## Auditoria estrutural do recrutamento

Em 05/11/2026 foram consultados exclusivamente fontes de `beta-signup` v6/`beta-comando` v4 e metadados `information_schema`/catálogo, **sem ler linhas de candidatos, URLs de convite configuradas ou segredos**.

- `public.ar_beta_signups`: `id bigint`, `email text`, `status text`, `consent_version text`, `consent_at/created_at/updated_at timestamptz`, `approved_at/play_added_at/invited_at/rejected_at timestamptz` opcionais, `internal_note text` opcional, `notification_state text`, `notification_sent_at timestamptz` opcional e `invite_delivery_state text`.
- E-mail tem `UNIQUE(email)` e `CHECK email=lower(btrim(email))`; a Edge exige normalização e usa `on_conflict=email`. Não há FK de Auth na tabela consultada. Correlação de purga deve partir do e-mail verificado pelo Auth no executor autorizado, antes da remoção do Auth, não de input livre do portal.
- `public.ar_beta_comando_admins(user_id uuid,created_at timestamptz)` é autorização administrativa; `public.ar_beta_comando_config(id smallint,invite_url text,invite_track text,updated_at timestamptz)` é configuração global. Não tratar configuração global como registro individual de candidato. Trigger de inscrição: `tr_ar_beta_signups_stamp` → `ar_beta_signups_stamp()`.
- A fonte de signup também notifica via HTTPS `script.google.com` (Google Apps Script), passando identificador da inscrição e e-mail do candidato. Valores de segredo e destino não foram lidos. Esses destinos/mensagens e registros externos precisam entrar no runbook de retenção/purga; apagar apenas a tabela não prova sua remoção. Nenhum envio, atualização ou exclusão foi executado.

## Gates e limites

Política continua candidata. Nome do responsável, operação da caixa, retenções, prazos realistas e processo testado são decisões pendentes com o principal/usuário. O prazo preexistente de 180 dias no recrutamento permanece registrado, sem alteração nesta etapa. Um pedido registrado não é conta apagada nem cumprimento completo da política da loja.

Fontes primárias: [PKCE no Supabase Auth](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [URLs de redirecionamento](https://supabase.com/docs/guides/auth/redirect-urls), [Google social login](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) e [OpenAPI oficial](https://github.com/supabase/auth/blob/master/openapi.yaml). Contratos consultados em 05/11/2026; referências do produto OAuth Server foram descartadas por tratar de outro fluxo.
