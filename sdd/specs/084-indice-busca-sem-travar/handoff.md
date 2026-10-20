# Handoff — 084-indice-busca-sem-travar

## Contexto

- Repositório `ccplayTv`, branch `feature/licenca`. Frontend React 19 + TypeScript + Vite em `tv-web/` (TV Samsung Tizen 9,
  `file://`).
- Próximo comando: `/sdd-execute 084-indice-busca-sem-travar`. Backlog: **Planejada**.
- Origem: assessment `sdd/assessments/ajustes-cpu-tv/` (veredito `go`). A linha de base na TV está em
  `sdd/assessments/ajustes-cpu-tv/evidencias/quadros-indice-tv-2026-10-19.md`.
- O sdd-plan editou `catalogSearch.ts`, `vodSort.ts` e `prefetchApi.ts` (stubs). Releia antes de mexer.

## O que a feature entrega

- **US1 (P1)**: a busca global abre sem travar o controle; índice em fatias, cancelável, **mesmo resultado de hoje**.
- **US2 (P1)**: "Todos" ordenado sem congelar, **mantendo exatamente a ordem atual** de A–Z, Ano, Adicionados e Nota (o
  usuário recusou trocar a ordem por velocidade).
- **US3 (P2)**: com a tela aberta durante a pré-carga, o índice é remontado no máximo 1× a cada ~10 s (o usuário aceitou a
  cobertura defasada por até ~10 s).

## Leitura obrigatória, em ordem

1. `spec.md`: FR-001..FR-011, SC-001..SC-006 e as Clarifications (decisões do usuário).
2. `plan.md`: Decisões Invariantes D-001..D-006, Constitution Check, riscos R-001..R-006, estratégia de testes.
3. `logic/fatias.md`: **o "como" travado**: relógio de fatias, merge sort estável, índice com as regras de
   `listAllOfKind`, "Todos" por hook novo, limite de remontagem.
4. `tasks.md`: T001–T021 em 5 fases (fundação, US1, US2, US3, Polish).
5. `quickstart.md`: comandos, sonda na TV e app real com `PerfOverlay`.
6. `.planning/memory/constitution.md`: foco (estado carregando focável) e "voltar restaura foco por id".

## Testes de contrato

Travados em `contract-tests.lock` (4 de 5):
- `tv-web/src/lib/catalog/catalogSearch.indice-sem-travar.contract.test.ts`: 2 testes, Fase 3 (FR-001/FR-002 e FR-008).
- `tv-web/src/features/vod/vodSort.indice-sem-travar.contract.test.ts`: 1 teste, Fase 4 (FR-005).
- `tv-web/src/features/catalog/prefetchApi.indice-sem-travar.contract.test.ts`: 1 teste, Fase 5 (FR-006).

Comandos:
- Rodar (de `tv-web/`): `npx vitest run src/lib/catalog/catalogSearch.indice-sem-travar.contract.test.ts src/features/vod/vodSort.indice-sem-travar.contract.test.ts src/features/catalog/prefetchApi.indice-sem-travar.contract.test.ts`
- Trava (da raiz): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 084-indice-busca-sem-travar`

Travas de **outras** features nos mesmos arquivos, que não podem quebrar:
- 017 `catalogSearch.contract.test.ts`
- 018 `catalogSearch.busca-categoria.contract.test.ts`
- 026 `globalSearch.home-busca-configuracoes-ds-v14.contract.test.ts`
- 025 `vodSort.filmes-series-ds-v14.contract.test.ts`
- 065 `prefetchApi.otimizacao-carga-consultas-memoria.contract.test.ts`

## Stubs criados

- `catalogSearch.ts`: `LoadSearchIndexOptions { signal, yieldToMain, normalize }` e o 4º parâmetro `_options` de
  `loadSearchIndex` (**ignorado** até a T003; tirar o `_` e o comentário).
- `vodSort.ts`: `SortInSlicesOptions` e `sortVodItemsInSlices` (lança `not implemented` até a T010).
- `prefetchApi.ts`: `SEARCH_INDEX_REFRESH_MS = 10_000` e o 3º parâmetro `_refreshMs` de `createPrefetchInvalidator`
  (**ignorado** até a T014).

## Armadilhas já mapeadas

- **Tetos de linha do ratchet** (`npm run lint`):
  - `catalogApi.ts` tem 2 184 linhas de 2 187;
  - `VodCategoryScreen.tsx` está em 949 de 949;
  - `SearchScreen.tsx` está em 345 de 345.
  A lógica vai para arquivos novos (`lib/slices.ts`, `features/catalog/aggregatedIndex.ts`,
  `features/vod/useVodListItems.ts`). **Nunca subir o teto** no `architecture-baseline.json`.
- **Regra da 082**: bloco `format === 2` só por `readHeaderChunks`/`readBlockChunks`; nunca `block.items`.
- **Regra da 066**: categorias escondidas/bloqueadas fora do índice. O contrato tem uma categoria escondida.
- **Ordem idêntica**: use um `comparatorFor(option)` único e merge estável que pega da esquerda no empate. Ordenar pedaços
  com `sort` nativo e juntar **muda a ordem**.
- **Cancelamento**: confira o sinal também **depois** de cada `await yieldToMain()`. O contrato FR-008 exige exatamente 1
  cessão quando o abort acontece dentro dela.
- **Duas caches de nome normalizado**: `searchGlobal`/`searchWithinItems` filtram pelo `WeakMap` do **registro/item**, não
  pelo `entry.normalizedName`. A opção `normalize` aquece as duas (o contrato confere `entry.normalizedName`).
- **`toItemOut`** vive em `catalogApi.ts` e não é exportado: passe-o como parâmetro para `aggregatedIndex.ts`, porque
  importar de `catalogApi` criaria ciclo.
- **Invalidador**: a borda de entrada (1º lote remonta na hora) mantém verdes o contrato 065 e o `prefetchApi.test.ts`. A
  chave da vitrine (`['catalog-search-index', f, kind, 'showcase', …]`, 6 elementos) continua relida a cada lote.
  `categoryAccessApi.ts` e `App.tsx` **não mudam** (FR-007).
- **`yieldToMain`** está em `lib/metadata/discoveryRules.ts` (`MessageChannel`). Na TV não há `scheduler.yield`.
- **Sonda**: o código dela fica em `sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/`, nunca em `tv-web/`. Instalar
  sonda ou app na TV **exige pedir autorização antes**, sempre.
- No PowerShell, `npm run x -- --flag` perde o `--`; para listas de `-Paths` do `check-contract-tests.ps1`, chame o script
  com `&` e um array `@(...)`.

## Pendências do Analyze

- A-01 (MEDIUM): R-003. Todas as ordenações passam por `sortVodItemsInSlices`, embora o FR-005 diga "fica como está se já
  cumpre". A ordem é a mesma (D-002); comunicar ao usuário no relato da Fase 4.
- A-02 (MEDIUM): R-004. A 1ª tecla com termo de 2 caracteres pode ter uma ordenação longa de acertos, fora do escopo da
  spec. Medir na T019 e, se passar de 100 ms, registrar como achado novo no backlog.
- A-03 (LOW): a T008 acrescenta o caso de FR-009 "se couber" (`SearchScreen.tsx` está no teto). Se não couber, cobrir no
  teste do hook ou no E2E.

## Gate de pronto

- Os 4 contratos verdes, `check-contract-tests.ps1` íntegro e os contratos 017/018/025/026/065 verdes.
- `npx tsc -b`, `npm run lint` (tetos), `npm run test`, `npm run build`, `npm run test:e2e` (com `npm run dev`).
- `quickstart.md` executado.
- **TV física é gate**:
  - sonda `quadrosIndice` (SC-001/SC-002/SC-003) em ≥ 2 medições;
  - leitura do `PerfOverlay` pelo usuário (SC-005), com autorização para cada instalação.
- Docs: `plan.md` (Estado Atual) e backlog via `update-feature-status.ps1`; nenhuma regra nova no `CLAUDE.md`, salvo se
  surgir.
