# War Room v0.2.0 — Frente A

Base: `812e03223ec6679e8b740ec0b43dcd3b6fc9c9a8`, repositório público separado. Implementação local em 25/10/2026; integração, aplicação remota, deploy Edge e publicação Pages são estados distintos. A Frente B não pertence a esta entrega.

## Mudanças

- Placar semanal separado do territorial: reutiliza o card e contrato existentes, mostra número/início/fim/pontos/liderança oficiais. `null`, payload sazonal inválido e período vencido mostram `--` e indisponibilidade; empate e zero oficial permanecem válidos. Não soma eventos nem recalcula regras de pontuação.
- Atualização a cada 60 s preservada; atualização ao voltar para a página e no fim da temporada. A fronteira apenas invalida a exibição antiga e solicita a nova leitura oficial; não simula o rollover.
- Fonte local da Edge derivada da v3 remota. `POST /rest/v1/rpc/ar_war_room_season` usa credencial somente do ambiente servidor, timeout de 5 s e allowlist. Falha sazonal retorna `null` sem bloquear `war`, `cells` ou `events`. A RPC executa antes das leituras do mundo para permitir a virada canônica sob lock do servidor. Nenhuma RPC de tester, tabela sazonal ou helper privado foi aberto por este repositório.
- Cache em memória de até 120 s e HTTP de até 60 s preservados, limitados por `endsAt`; chamada que atravessa a fronteira suprime a temporada antiga e não a armazena. Limites de linhas, eventos arredondados por hora, origem CORS e métodos da v3 preservados.
- Pins: `.ar-site-pin { position:relative }` sobrescrevia a posição absoluta que o MapLibre exige, acumulando deslocamento no fluxo do DOM. Wrapper absoluto e dimensionado agora pertence ao MapLibre; botão e haste ficam dentro dele. Ponta termina no centro inferior, com `anchor:bottom`, offset zero e posicionamento subpixel. Conversões H3 já corretas foram mantidas: centro `[lat,lng]` → MapLibre `[lng,lat]`, contorno GeoJSON fechado. Não há compensação por território.
- Seis ícones, filtros, inspector, zoom e centralização mantidos. Mobile usa superfície de pin menor com alvo de toque de 44 px, hexágonos menos opacos em zoom distante, pluralização correta, filtros com estado acessível/foco visível, cards e espaçamentos ajustados. `ResizeObserver` atualiza a projeção quando o contêiner muda.

## Validação e limites

`npm test` testa o contrato sazonal e a Edge com Deno/fetch/relógio simulados: placar válido, empate, zeros, null/erro/timeout, allowlist, métodos/CORS, limites, cache, concorrência de chamadas e virada. Não usa credenciais reais nem altera jogadores.

`npm run test:browser` usa Chromium real e MapLibre/WebGL real com H3 sintético próximo a 0°/0°, sem dados de testers. O basemap é vazio e determinístico, sem tiles externos. Confere os seis pins com erro de ponta inferior a 1 px em zooms 9/13/16 e larguras 1440/390/320, resize, ausência de overflow, filtros, teclado/inspector, touch targets, autorefresh e virada. Imagens de QA ficam em `.qa/` ignorada pelo Git. Isso comprova navegador emulado, não teste em aparelho físico nem disponibilidade/qualidade dos tiles externos.

Validação local final: **19 testes de contrato/Edge e cinco cenários Chromium aprovados**, mais TypeScript/Vite aprovado. A liderança enviada pelo servidor é preservada inclusive com pontos empatados e desempate canônico. O aviso do Vite de bundle acima de 500 kB não foi tratado com refatoração fora do escopo. O CI executa os mesmos testes/build antes de permitir publicação pelo fluxo existente; resultado do CI é registrado separadamente.

## Operação pendente

O principal informou a aplicação aprovada da RPC canônica no repositório privado em 25/10/2026, migração local `20261025215317_war_room_season_summary.sql`. Segundo a conferência administrativa do principal, período/liderança/pontos públicos correspondem à fonte oficial; execução é permitida a `service_role`, negada a `anon`/`authenticated`, e a leitura direta das tabelas sazonais continua fechada. Este repositório não inclui migração nem grants. A comparação da resposta da Edge publicada ainda é separada e pendente.

Antes do deploy: revisar CI/UX e publicar somente após liberação do principal; então comparar a resposta pública com o agregado oficial autorizado sem registrar dados individuais. Nenhum deploy ou publicação é afirmado por este documento até receber referência efetiva.

Referências técnicas: [MarkerOptions do MapLibre](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MarkerOptions/) e [h3-js](https://github.com/uber/h3-js). Regras sazonais canônicas permanecem nos documentos privados `docs/season-engine-api.md` e no Covil, mantidos pelo fluxo principal.
