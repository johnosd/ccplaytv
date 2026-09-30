# Handoff — 032-metadata-tmdb-integracoes (sdd-plan → sdd-execute)

## Contexto

- Repositório `ccplayTv`, branch `feature/novo-design-system`. Stack: React 19 + TS + Vite (`tv-web/`), Dexie/IndexedDB, client-first (ADR-008), alvo Tizen 8 / Chromium 108.
- Próximo comando: `/sdd-execute 032-metadata-tmdb-integracoes`. Backlog: **Planejada**.
- Mudou fora do código nesta sessão: `.planning/memory/constitution.md` → **1.6.0** (exceção BYOK para chave TMDB/OpenAI digitada pela pessoa). `CLAUDE.md` ainda diz "TMDB/OpenAI keys never reach the client at all" — corrigir no Polish (T038).

## O que a feature entrega

- **US1 (P1)** detalhe de filme/série com backdrop, sinopse + "Ver mais" (modal), gênero, duração, direção, país, elenco em texto — **do provedor, sem chave** (painel real já manda: filmes em `get_vod_info`, séries em `get_series_info.info`).
- **US2 (P2)** aba real "Integrações & BYOK" (card TMDB: Configurar / Testar / Editar / Remover) + tela própria para digitar a chave + ícone TMDB do dock da Home com estado real.
- **US3 (P3)** TMDB **só preenche campo vazio**; `tmdb_id` do provedor primeiro, senão título + ano com **candidato único**; selo "Dados: TMDB".
- Decisões do usuário que contrariam o óbvio: provedor **vence** o TMDB; **nota/rating fora**; Elenco navegável, Semelhantes e Trailer **continuam mock**; nada é buscado por foco nem em lote; episódio não ganha TMDB.

## Leitura obrigatória, em ordem

1. `spec.md` — FR-001…FR-027, SC-001…SC-006, Clarifications.
2. `plan.md` — Decisões Invariantes D-001…D-011, Constitution Check, R-001…R-007.
3. `tasks.md` — T001…T040 por fase.
4. `data-model.md` — Dexie v12 (`titleMetadata`, `integrations`), formato real dos campos do painel.
5. `logic/metadados-e-casamento.md` — pipeline, casamento TMDB, mescla, série.
6. `logic/chave-tmdb.md` — formatos v3/v4, estados, higiene da chave.
7. `logic/detalhe-com-metadata.md` — hero, "Ver mais" (220 chars), foco `more/actions/tabs`, modal.
8. `logic/integracoes-e-dock.md` — painel, `TmdbKeyScreen`, dock.
9. `quickstart.md`; constitution 1.6.0.

## Testes de contrato (5/5, travados)

| Arquivo | Testes | Fase |
| --- | --- | --- |
| `tv-web/src/lib/metadata/titleMetadata.metadata-tmdb.contract.test.ts` | 3 | 1º → Fase 3; 2º e 3º → Fase 5 |
| `tv-web/src/lib/metadata/tmdbKeyRepository.metadata-tmdb.contract.test.ts` | 1 | Fase 4 |
| `tv-web/src/features/movies/MovieDetailScreen.metadata-tmdb.contract.test.tsx` | 1 | Fase 3 |

- Rodar: `cd tv-web; npx vitest run src/lib/metadata src/features/movies/MovieDetailScreen.metadata-tmdb.contract.test.tsx`
- Trava: `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 032-metadata-tmdb-integracoes`
- Podem quebrar: travas de **026** (`HomeScreen…contract`, Configurações), **028**, **022** (`ComingSoon`/`Modal`), **025** (`vodMetadata`). Rodar `check-contract-tests.ps1` delas no fim.

## Stubs criados

- `tv-web/src/lib/metadata/types.ts` — tipos **definitivos** (`TitleMetadataView`, `MetadataField`, `TmdbStatusView`, `SaveTmdbKeyResult`, `MetadataOptions`). Os contratos dependem deles.
- `tv-web/src/lib/metadata/titleMetadata.ts` — `ensureTitleMetadata(itemId, options)` → `not implemented`.
- `tv-web/src/lib/metadata/tmdbKeyRepository.ts` — `saveTmdbKey`, `getTmdbStatus`, `removeTmdbKey` → `not implemented`.
- `tv-web/src/features/catalog/catalogApi.ts` — `useTitleMetadata(itemId)` **já funcional** (queryKey `['title-metadata', itemId]`), delega ao stub; o contrato da tela o mocka.

## Armadilhas já mapeadas

- **Backdrop nunca como fundo do `.screen.vod-detail`**: `player.css` só esconde *filhos* do `.screen` quando o AVPlay exibe; fundo no root pinta sobre o vídeo na TV (bug histórico da 011). Use `<img>` dentro do hero (D-008).
- **"Ver mais" por comprimento (> 220)**, não por medição: jsdom não mede layout; o contrato usa 400+ chars e espera o botão com nome `/Ver mais/`, que ↑ a partir de "Assistir" o foque, e `Modal ariaLabel="Sinopse completa"`; RETURN (`Escape` no teste) fecha e o foco **fica** em "Ver mais".
- `getTmdbStatus` sem chave precisa devolver **exatamente** `{ state: 'not_configured' }` (contrato usa `toEqual`).
- Chave v3 no contrato: 32 hex; o fake do TMDB identifica a chave por `url.href` + `init.headers` — v3 **tem** de ir na query `api_key` para o teste distinguir recusada/aceita.
- Painel real (medido 29/09): `backdrop_path` é **array**; `episode_run_time` é número no filme e **string** na série; série **não** tem `tmdb_id` (só episódios); `country` só em filme e em inglês ("United States of America") — exibir como veio.
- `fetchSeriesInfo` hoje devolve array; mudar para `{episodes, info}` (T003) exige ajustar `seriesLoader` e seus testes — sem mudar episódios.
- Nunca `console.*` com URL/erro cru em `lib/metadata` (o contrato captura `console.log/info/warn/error/debug`). A URL v3 carrega `api_key`.
- Foco nunca dispara rede: só `MovieDetailScreen`/`SeriesDetailScreen` usam `useTitleMetadata`.
- Tela da chave = foco DOM real (`useTvKeyNav`, molde `EpgSettingsScreen`); o resto de Configurações é foco por estado. O `Modal` só atende um por vez (singleton) e ativa em `useLayoutEffect`.
- Flakes conhecidos: `MoviesScreen.favorites.test.tsx`/`SeriesScreen.favorites.test.tsx` falham sob paralelismo; confirmar com `--no-file-parallelism` (8/8 em 29/09).
- E2E: `executablePath` Linux hardcoded nos `e2e/*.mjs` — sobrescrever localmente no Windows; reiniciar o `npm run dev` antes de rodar a bateria.
- Comandos de shell às vezes falham com "classifier gave no verdict" nesta máquina — é transitório; repetir.

## Pendências do Analyze

- A-01 (MEDIUM) **Resolvido em 2026-09-29**: SC-003 medido com a chave TMDB real (`e2e/metadata-tmdb-real-match.mjs`) — 74 de 74 casamentos por título + ano certos, 0 errados.
- A-02 (MEDIUM) Spec Edge Case diz que episódios mostram sinopse do provedor, mas nenhum FR/task exibe (plan R-007 deixa fora) → decidir com o usuário: aceitar fora (atualizar a spec no converge) ou pequena task extra em T013.
- A-03 (LOW) FR-010 "capacidades do DS relevantes" é vago → `logic/integracoes-e-dock.md` fixa "Metadata" e "Imagens"; seguir o logic.
- A-04 (LOW) Assumption "hero de catálogo/Home podem exibir do cache" sem task → intencionalmente fora (D-002); não implementar.

## Gate de pronto

- Contratos 5/5 verdes + trava íntegra; travas de 022/025/026/028 íntegras.
- `npx tsc -b`, `npm run lint`, `npx vitest run`, `npm run build:tizen` limpos.
- `npm run test:e2e` com `e2e/metadata-tmdb.mjs` (com `npm run dev` rodando).
- `quickstart.md` cenários 1–5 no navegador; `e2e/metadata-tmdb-real.mjs` contra a lista real (SC-001).
- Polish: `CLAUDE.md` (BYOK + status), backlog item 28, `migracao-design-system-v14.md`.
- Passada na TV física: **recomendada, não gate** (backdrop × plano AVPlay, IME da chave, CORS do TMDB — R-002).
