# 06C — páginas candidatas de privacidade e exclusão

Estado: **preparado localmente, não publicado, exclusão operacional BLOQUEADA**. Base do site `07a765e617df9332d6fcd555a0df6323c61cad14`; branch `codex/privacy-06c`; revisão em 05/11/2026. Nenhum dado, permissão, conta ou serviço de produção foi alterado. Nenhum formulário real foi enviado. O Covil é atualizado pelo fluxo principal, não por esta tarefa.

## Entrega e limites

- `privacidade.html`: inventário compreensível do Android, recursos online e site; contato público autorizado `appcalypserun@gmail.com`; retenção sem prazo aprovado declarada como pendência, sem promessa de ausência de coleta/terceiros.
- `exclusao-conta.html`: orientação condicional para futuro registro autenticado no app e protocolo; assistência por `mailto:`. Sem formulário, JavaScript próprio, coleta web de identificadores, chamada RPC ou ação destrutiva. Abrir o link apenas abre o cliente de e-mail, sem envio automático.
- As duas páginas têm aviso destacado de candidata **ainda não ativa** e `noindex`. Não são URLs operacionais para declarar cumprimento na Play. Links identificados como candidatos nos footers públicos; entradas adicionadas ao build Vite. Não se mudou texto, consentimento, CAPTCHA, endpoint ou comportamento do recrutamento.
- Fontes de estilo locais; as candidatas não carregam mapas, fontes externas, CAPTCHA ou SDKs. As dependências dos outros recursos do site foram descritas, não removidas.

O contrato informado pelo principal é uma proposta aditiva local: `ar_request_account_deletion(p_request UUID,p_confirmation texto)` deriva o titular de `auth.uid()` e exige sessão viva em `auth.sessions`, com idempotência por titular e cancelamento próprio. Não recebe e-mail, token, coordenadas ou Arca no pedido. Não há `DELETE` de jogo/Auth a implantar automaticamente. A página não apresenta a proposta como funcionalidade já disponível nem inventa nome de botão/menu Android.

## Inventário para revisão de Segurança dos dados

Código Android/backend consultado **somente em leitura** no checkout separado `identity-05f5c`; nenhuma consulta de dados de jogadores ou produção. Referências abaixo pertencem ao repositório privado e descrevem fontes técnicas, sem copiar dados reais para este repositório público. O documento `docs/google-play/privacidade-permissoes.md` serviu de ponto de partida; suas afirmações antigas sobre ausência de fluxo Google não foram reutilizadas como verdade atual.

| Categoria / finalidade | Evidência no código | Limite da declaração |
|---|---|---|
| Localização precisa, percurso local | `gps/GpsTrackStore.kt`, `gps/GpsTrackingService.kt`; permissões no manifesto | GPS permanece informação sensível; permissões aproximadas e precisas não provam sozinhas o conteúdo transmitido |
| Localização por célula, atividade/fitness e diagnóstico | `online/PatrolPayload.kt`: H3, horários, metros/segmentos, duração, decisões, velocidades, precisão, contadores, `movement` | Upload normal omite rota bruta, mas H3/horários ligados à conta continuam localização. Não marcar “não coleta localização” |
| Posições em Caçadas opcionais | `online/HuntRuntime.kt` constrói amostra com latitude/longitude/tempo; `online/HuntContract.kt`; migração `20261028002414_hunts_v1.sql` | SQL guarda eventos/intervalos sem coordenadas, mas logs dos fornecedores não foram certificados. Não declarar processamento exclusivamente efêmero |
| Identificação, perfil e atividade do jogo | `online/OnlineApi.kt`, `online/OnlineCoordinator.kt`, tabelas de jogadores/patrulhas/eventos/missões | UUID, apelido, facção, avatar e progresso; aparência/biologia do jogo não são diagnóstico de saúde real |
| Google e sessão | `online/NativeGoogleIdentityProvider.kt`, `online/SupabaseIdentityAuth.kt`, `online/IdentityAuthContract.kt`, `online/OnlineCredentials.kt` | Prova de login é enviada ao Auth; Google/Supabase tratam identidade/e-mail do provedor. Adaptador nativo não retém conta/token. Confirmar metadados efetivamente retidos no Auth antes de fechar o formulário; não pedir senha Google |
| Arquivos e compartilhamento voluntário | `migration/Arca2Envelope.kt`, `migration/ArcaSafIO.kt`, `migration/ArcaIntegratedService.kt`, `sharing/ShareImageSender.kt` | Arca cifrada local e chooser de compartilhamento. Destino escolhido pode sincronizar arquivo; não dizer que Google restaura o histórico local nem que suporte recebe Arca |
| Inscrição nos testes | `beta.html`: e-mail, consentimento/versão, resposta Turnstile e honeypot; registros de tratamento são descritos no aviso existente | Não se auditou banco/logs remotos de recrutamento. A resposta CAPTCHA não é senha da conta do jogo |
| Transporte e terceiros | App: Supabase, Google, OpenFreeMap/tiles e GitHub para Alpha. Site: Pages, Supabase público, CARTO, Google Fonts e Cloudflare Turnstile | IP e área de tiles requisitada podem revelar localização/interesse geográfico. Verificar papéis, logs, regiões e retenções de cada provedor. Não declarar automaticamente “não compartilha” |
| Armazenamento no navegador | `guia.html`: preferência de modo e capítulos em `localStorage`; `comando.html`: sessão administrativa em `sessionStorage` | Preferências do Guia não são progresso do jogador. A sessão administrativa é dado de acesso separado, não coletado pelas candidatas; não copiar dados ou credenciais reais |

Sem SDK de anúncios/analytics/crash identificado no recorte consultado. Não equivale a auditoria completa dos provedores. App usa HTTPS e armazenamento privado; sessão cifrada com Keystore e Arca cifrada não tornam todo o histórico local cifrado nem constituem garantia de segurança absoluta.

Classificações candidatas a validar na Console: localização precisa/aproximada conforme uso real; identificadores de usuário, e-mail e apelido; atividade/fitness e interações; diagnósticos e arquivos/conteúdo compartilhado conforme definições aplicáveis. Distinguir o site/recrutamento do que o APK efetivamente transmite, e não somar automaticamente recursos exclusivamente web ao formulário do app. A declaração deve corresponder às versões distribuídas na Play e aos SDKs, não só a esta branch.

## Decisões humanas e gates antes de qualquer publicação/uso na Console

1. Confirmar responsável compatível com o nome do app/listing, operação do contato autorizado e responsáveis pelo atendimento; definir instruções verificáveis para falta de acesso ao app, sem aceitar e-mail/apelido/protocolo isolado como prova.
2. Aprovar retenção por conjunto: conta/Auth, vínculos, patrulhas, contribuições, ledger/missões/Energia/Caçadas, eventos compartilhados, auditoria, logs, backups, recrutamento e suporte. Não existe prazo geral aprovado. A limpeza técnica de recibos de Caçadas após sete dias não remove histórico, conta ou todos os dados.
3. **Divergência a resolver:** `beta.html` afirma que pedidos não aprovados serão revisados para exclusão após 180 dias. Não foi comprovada a rotina operacional neste escopo. Não se alterou o consentimento ou essa copy sem decisão específica. A alegação precisa de operação demonstrada ou texto corrigido antes da publicação da política final.
4. Integrar/testar no app e servidor o registro autenticado, confirmação, idempotência, sessão expirada, acesso de terceiro, cancelamento e protocolo, com dados sintéticos. Pedido confirmado não equivale a exclusão executada.
5. Mapear dependências/FKs/dados derivados e compartilhados, definir remoção versus desvinculação/anonimização e base de eventual retenção, testar num ambiente sintético e exigir aprovação futura para execução manual protegida. Nada aqui autoriza apagar jogadores/Auth ou implantar uma rotina destrutiva.
6. Verificar logs/retentores dos provedores, tratamento do Google Auth e IP/tiles, destinos de compartilhamento, declarações de criptografia/efemeridade e categorias de Segurança dos dados. Confirmar tratamento de público 16–17 anos já autorizado pelo principal, sem inventar política etária ou base legal nesta tarefa.
7. Revisar textos com Android/backend finais, resolver discrepâncias, ativar operação e atendimento, publicar URLs HTTPS, testar links no APK e caminho dentro/fora do app. Só então retirar rótulos de candidata e revisar respostas da Console. Uma página candidata local ou um link `mailto:` não comprova exclusão operacional nem cumprimento completo da política Google Play.

## Validação local

Testes Chromium com serviços externos bloqueados/mocks locais: estado de candidata, dados sensíveis declarados, assistência sem formulário/envio silencioso, contatos e links cruzados, footers, 320/390/1440 px, texto ampliado e teclado. Regressão de recrutamento usa apenas e-mail e token sintéticos, interceptados localmente. Capturas em `.qa/` são ignoradas pelo Git e não incluem jogadores reais. Build deve conter as duas páginas e apenas recursos locais para elas.

Resultados locais: **19 testes Node e seis cenários Chromium direcionados aprovados** (quatro novos de privacidade, regressão de recrutamento com mock e rotas editoriais/mobile), além de **TypeScript/Vite build aprovado**. Inspeção dos HTMLs de produção confirmou ambas as páginas com CSS local existente e sem script/formulário. Sem CI remoto, push, merge ou deploy nesta etapa. Testes de browser não substituem execução do fluxo Android/backend nem teste em aparelho.

Fontes oficiais consultadas em 05/11/2026: [dados do usuário/privacidade](https://support.google.com/googleplay/android-developer/answer/10144311?hl=pt-BR), [exclusão de contas](https://support.google.com/googleplay/android-developer/answer/13327111?hl=pt-BR) e [Segurança dos dados](https://support.google.com/googleplay/android-developer/answer/10787469?hl=pt-BR). Esses requisitos não tornam este candidato aprovado pela loja.
