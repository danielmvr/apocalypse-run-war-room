# 06E — revisão editorial e inventário de mídia

**Candidata local/de branch, sem publicação ou ativação.** Base `40b7d6651f3e54f963321cd08209ae5888a63d25` da 06D; branch `codex/privacy-06e`, iniciada com árvore limpa em 05/11/2026. Reaproveita Auth/PKCE/RPCs e testes existentes; não refaz a 06D. Nenhum Android, backend, Git do pai, Covil ou serviço de produção foi alterado.

## Responsável e contato

O enquadramento informado pelo principal é **desenvolvimento independente por pessoa física**, sem apresentar empresa ou pessoa jurídica. A candidata `privacidade.html` foi ajustada para esse enquadramento, substituindo a identificação genérica anterior de equipe. O nome público ainda depende de confirmação humana; não se publicou um nome sugerido como se estivesse confirmado. Não foram inventados CPF, CNPJ, endereço, registro ou prazo legal.

Contato oficial autorizado e preservado nas duas páginas: `appcalypserun@gmail.com`. Ser um endereço autorizado não comprova frequência de monitoramento, capacidade de executar pedidos ou prazo de resposta. Esses pontos ficam expressamente pendentes. `exclusao-conta.html` passou a se referir ao responsável independente, sem mudar ações/estado do portal ou pedir material adicional.

`VITE_ACCOUNT_WEB_ENABLED=false`, chave de exemplo vazia, política candidata e gates do servidor continuam preservados. Não houve habilitação, teste OAuth real, alteração de redirect, envio de formulário, operação sobre conta ou publicação de arquivo de mídia.

## Proposta operacional separada — DESATIVADA

Esta seção é uma proposta para decisão, **não configuração consumida pelo aplicativo, calendário de atendimento ou processo operacional já ativo**.

| Decisão | Proposta a revisar | Estado efetivo |
|---|---|---|
| Identificação | Publicar o nome real escolhido pelo responsável, coerente com a ficha e o contato | Pendente de confirmação humana |
| Caixa oficial | Canal único informado nas páginas; triagem humana por pessoa responsável | Endereço autorizado; rotina/capacidade ainda não confirmadas |
| Frequência e atendimento | Definir uma frequência praticável e prazos de primeiro retorno/execução após conhecer a disponibilidade real | Não definidos; nenhuma promessa de monitoramento diário ou atendimento em número de dias |
| Prova de titularidade | OAuth/conta existente no portal ou sessão autenticada no app; assistência não toma e-mail/apelido/protocolo isolado como prova | Fluxo cliente preparado; Auth/servidor/execução reais dependem do GO do principal |
| Retenção | Deliberar separadamente Auth/vínculos, perfil, atividade/GPS/H3, progresso/ledger, auditoria, backups, recrutamento, suporte e logs de provedores | Sem prazo geral aprovado; não derivar prazo da expiração de recibos técnicos |
| Histórico compartilhado | Mapear dependências e decidir remoção, desvinculação ou anonimização antes de executar | Decisão/teste e aprovação futura pendentes |
| Rastreamento do pedido | Separar registro, confirmação, execução e conclusão; usar recibos/status reais | Sem afirmar exclusão operacional só por existir política/portal |

O prazo anterior de revisão após 180 dias no recrutamento permanece intocado e registrado como pendência de consistência operacional. A política final não deve repetir essa alegação como rotina comprovada até haver demonstração ou decisão explícita de correção.

## Mídia localizada — somente leitura

Não foram criadas artes, telas, composições, recortes ou novas capturas para esta etapa. Não foram copiados arquivos de imagem/vídeo para o site ou para o commit. A inspeção visual limitou-se aos dois assets oficiais sem dados de jogador; o restante foi inventariado por origem/arquivo, sem afirmar sanitização que não foi realizada.

| Arquivo / origem no projeto | Verificação | Classificação e gate |
|---|---|---|
| `.work/play-compliance-06c/docs/google-play/assets-06c/play-icon-512.png` | PNG 512×512, RGBA/32 bits, 345.608 bytes; SHA-256 `4579e67cb2b98da108425b4a573be7338460deb25d3f963e3b1489a090434c7d`, igual ao README; visualmente corresponde à arte oficial | **Ícone candidato com ressalva**, não screenshot. Fonte oficial de 256×256 ampliada e arredondamento/cantos incorporados; não foi localizada fonte quadrada maior no recorte. Requer revisão visual/preview da Console e decisão do principal; não declarar conformidade integral só pela dimensão |
| `.work/play-compliance-06c/docs/google-play/assets-06c/feature-1024x500.png` | PNG 1024×500, RGB/24 bits, 1.045.684 bytes; SHA-256 `b333f0228b5a3624a6f4081c0e4e318a7499aece08566ea9fbc04a130276f1f4`, igual ao README; cena neutra oficial | **Destaque de branding candidato**, não imagem da interface nem prova de gameplay. Requer preview/aceite antes de envio à loja |
| Fontes oficiais e script documentados no README de `assets-06c` | Ícone derivado de `ic_launcher_art.webp`; destaque derivado de `onboarding_neutral_v1.webp`; transformações determinísticas já documentadas na 06C | Fontes e transformação rastreáveis; nenhuma geração/edição de imagem foi executada na 06E |
| `.work/apocalypse-run-war-room/.qa/` | Há previews web de War Room, migração e candidatas; os testes da 06D usam identidade/territórios sintéticos | **QA do site**, não captura do APK. Imagens de produção web também não comprovam a tela Android nem autorização para expor localização; não usar como substituto de screenshot real |
| `war-report-validation.jpg` e mídia antiga fora do roteiro atual | Arquivo legado localizado, sem revisão de conteúdo pessoal/versão para ficha nesta etapa | **Quarentena editorial/privacidade**. Não copiado ou aprovado para publicação |
| Material de laboratório OAuth/Arca e artes antigas | Localizados arquivos de laboratório e arte no projeto; não foram abertos para reutilização | **Fora de escopo para ficha**; não transformar tela de autorização em screenshot de gameplay |
| Capturas reais atuais de mapa/Energia do APK | Não localizadas com referência verificável no recorte de mídia do checkout/docs auditado | **Não aprovadas / fonte pendente**. Se estão em anexos do operador fora desse recorte, o principal precisa fornecer a referência autorizada. Não gerar UI, reutilizar web ou supor ausência de dados pessoais para preencher a lacuna |

A classificação não é declaração de que o material real esteja anonimizado. Mapa pode expor área/posição/rota; telas de Energia podem incluir perfil, saldo e atividades. Antes de publicação, confirmar versão/origem, consentimento de uso e dados visíveis. Nenhum tratamento cosmético deve alterar números, tela ou localização para simular prova de uso. O vídeo FGS informado pelo principal é separado de screenshots e ainda depende de avaliação de exposição; seu conteúdo não foi aberto ou enviado por esta tarefa.

## Gates separados para publicação

**Política estática final:** confirmação humana da identificação pública e contato; copy consistente com as práticas realmente habilitadas; decisões/retenções e capacidade de atendimento informadas com verdade; revisão do principal e autorização explícita de publicação. Não retirar os avisos de candidata por conta própria. Publicar uma política não habilita automaticamente o portal nem resolve todos os requisitos da Play.

**Portal:** além dos itens acima, Auth Google oficial e bloqueio de criação de conta validados, allowlist exata do callback/origem/tentativa aprovada e testada, chave apenas publishable, API/ACL/sessão/confirm/recibo consistentes e operação real de execução/retentores aprovada. Até o GO do principal, manter OFF. Fixtures e build aprovados não substituem esse teste oficial ou a operação de atendimento.

**Mídia/loja:** revisão de fonte/formato/qualidade, privacidade e aceite do operador; publicação ou envio à Console exigem autorização própria. Nenhum ícone, destaque, screenshot ou vídeo foi enviado nesta etapa.

## Validação deste checkpoint

Resultados executados neste checkpoint: **16 testes unitários direcionados de Auth/PKCE/contratos da conta aprovados**, **cinco cenários Chromium afetados aprovados** (política/contato, assistência sem envio, links dos footers, leitura mobile/teclado e serviço de pedidos desativado) e **build TypeScript/Vite aprovado**. Não houve chamadas reais de Auth, conta ou recrutamento. O aviso de bundle do mapa acima de 500 kB permanece; não se fez refatoração fora do escopo. A 06D já registrou 35 Node, 24 Chromium e build aprovados; esses números são históricos dessa base, não uma nova execução integral da 06E.
