# Apocalypse Run: War Room

Frontend estático de observação de guerra do Apocalypse Run. React 19, TypeScript, Vite, MapLibre GL JS, H3; preparado para GitHub Pages.

## Status da integração

**Não há API pública configurada.** A auditoria de 24/10/2026 mostrou que as RPCs `ar_world`, `ar_war_report` e `ar_season_report` exigem tester autenticado. O frontend não utiliza credenciais do jogo nem publica dados reais sem uma API deliberadamente autorizada. Exibe `--` até existir resposta válida. O mapa básico utiliza tiles CARTO Dark Matter (serviço externo; conferir termos/limites de uso antes de divulgação ampla).

## Rodar localmente

```bash
npm install
cp .env.example .env.local
npm run dev
npm run build
```

Configure `VITE_PUBLIC_WAR_API` somente após implantar um endpoint público read-only específico. Nunca inclua `service_role`, senhas ou tokens de tester no GitHub Pages.

## Contrato esperado (schemaVersion 1)

```json
{
  "schemaVersion":1,"asOf":"2026-10-24T13:00:00Z",
  "war":{"factions":[{"id":"HUMAN","score":0,"ownedCells":0},{"id":"ZOMBIE","score":0,"ownedCells":0}],"players":{"total":0,"active24h":0},"discoveredCells":0,"contestedCells":0},
  "season":{"number":1,"startsAt":"2026-10-19T03:00:00Z","endsAt":"2026-10-26T03:00:00Z","factions":[{"id":"HUMAN","score":0,"ownedCells":0},{"id":"ZOMBIE","score":0,"ownedCells":0}],"leader":null},
  "events":[],"cells":[]
}
```

`season` pode ser `null`. `cells` recebe `{id, owner, control, contagion, structure}`; `id` deve ser H3 válido. `events` recebe `{id,kind,actorName,actorType,faction,at,structure,points}`. Não publicar dados privados de patrulha, localização do jogador, IDs de autenticação, convites ou diagnósticos. Usar agregados com política de supressão de pequenos grupos conforme o público alvo. Para mapas globais grandes, criar paginação por viewport ou tiles vetoriais.

## Implantação no GitHub Pages

1. Criar repositório público `apocalypse-run-war-room` (separado do repositório Android privado).
2. Enviar o conteúdo desta pasta para a branch `main`, e gerar `package-lock.json` no primeiro `npm install`.
3. Em Settings → Pages, definir Source `GitHub Actions`.
4. O workflow `.github/workflows/pages.yml` gera `dist/` e publica o site no Pages. URL esperada após deploy (não verificada): `https://danielmvr.github.io/apocalypse-run-war-room/`.
5. Configurar o endpoint read-only com CORS para a origem do site; inserir a URL nas variáveis de build de forma segura (a URL pública não é segredo). O Vite só lê VITE_PUBLIC_WAR_API durante o build. Sem ela, o site permanece em modo seguro.

## Auditoria 24/10/2026

- Projeto Supabase `apocalypse-run-alpha`, PostgreSQL 17.
- 7 linhas em `ar_cells`: 5 HUMAN, 1 ZOMBIE, 1 sem dono das duas facções, conforme consulta de auditoria.
- 7 perfis em `ar_players`, todos habilitados na amostra; não confundir com ativos 24h.
- `ar_war_report`, `ar_world`, `ar_season_report`, `ar_season_telemetry`: EXECUTE não concedido a anon.
- `ar_world(p_cell_ids text[])`: não assume cobertura global; necessita rota pública paginada/câmera.
- A pontuação da temporada e a territorial são independentes e devem preservar sua fonte canônica.
- **Pendente**: criar/revisar camada pública com output allowlist, rate limit/cache, ACLs e testes de acesso anon. Não elevar permissões das RPCs internas.

## Fontes oficiais

- `docs/covil-de-memorias.md`
- `docs/war-report-api.md`
- `docs/season-engine-api.md`
- `docs/field-progression-api.md`

Esses arquivos pertencem ao repositório privado `danielmvr/apocalypse-run-android`. O frontend público não deve copiá-los indiscriminadamente.
