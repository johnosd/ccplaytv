---
description: "Tasks da feature 084 — índice de busca sem travar a tela na TV"
---

# Tasks: Índice de busca sem travar a tela na TV

**Input**: Documentos de design de `sdd/specs/084-indice-busca-sem-travar/`

**Prerequisites**: plan.md, spec.md, logic/fatias.md, quickstart.md

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)
- Incluir caminhos de arquivo exatos nas descrições

## Path Conventions

- Frontend único em `tv-web/` (comandos rodam de `tv-web/`).
- Lógica pura em `tv-web/src/lib/` (sem React); hooks e telas em `tv-web/src/features/<área>/`.
- Testes ao lado do código: `*.test.ts` (Vitest `node`) e `*.test.tsx` (Vitest `dom`).
- Sonda da TV em `sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/` (nunca dentro de `tv-web/`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: nada a preparar. A linha de base já existe:
`sdd/assessments/ajustes-cpu-tv/evidencias/quadros-indice-tv-2026-10-19.md` (4 medições na TV).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Objetivo**: utilitário de fatias, base de US1, US2 e US3.

- [X] T001 [P] Criar `tv-web/src/lib/slices.ts` com `createSliceClock`, `mapInSlices` e `stableSortInSlices`, conforme
  `logic/fatias.md` §1 (cede por `yieldToMain` de `lib/metadata/discoveryRules.ts`; confere o sinal antes e depois de
  ceder; merge estável que pega da esquerda no empate).

### Testes da Fase

- [X] T002 [P] `tv-web/src/lib/slices.test.ts`: `stableSortInSlices` igual a `[...items].sort(compare)` para comparadores
  com muitos empates e entradas de 0, 1, 31, 32, 33 e 5 000 itens; aborta com `AbortError` no meio; `mapInSlices`
  preserva a ordem; nenhuma mutação da entrada.

**Critério de Conclusão**: `npx vitest run src/lib/slices.test.ts` verde; `npx tsc -b` limpo.

**Registro da Fase**:

- Status: concluída (2026-10-20)
- Feito: `lib/slices.ts` (`createSliceClock`, `forEachInSlices`, `mapInSlices`, `stableSortInSlices`); o relógio confere o
  sinal antes e depois de ceder; o merge sort estável cede entre passadas e a cada 1 024 saídas.
- Contrato: sem contrato nesta fase.
- Testes executados: `npx vitest run src/lib/slices.test.ts` → 14/14 verdes; `npx tsc -b` limpo.
- Pendências: nenhuma.

---

## Phase 3: User Story 1 - Abrir a busca global sem travar o controle (Priority: P1) 🎯 MVP

**Objetivo**: o índice (e a busca global) é montado em fatias, cancelável, com o mesmo resultado de hoje.

**Independent Test**: contratos FR-001/FR-002 e FR-008; na TV, `quadrosIndice` sem quadro > 100 ms na busca global.

### Contrato da Fase

- `FR-001/FR-002: monta o índice em fatias, cedendo a vez, com o mesmo conteúdo, ordem e cobertura de hoje` — FR-001,
  FR-002, US1/AC1-AC2
- `FR-008: cancelada no meio, rejeita com AbortError e para de ceder (nenhum trabalho depois do cancelamento)` — FR-008,
  US1/AC4
- Comando: `npx vitest run src/lib/catalog/catalogSearch.indice-sem-travar.contract.test.ts`

### Implementation

- [X] T003 [US1] Implementar `loadSearchIndex(sourceId, kind, database, options)` em fatias em
  `tv-web/src/lib/catalog/catalogSearch.ts`, com as mesmas regras e a mesma ordem de `listAllOfKind`
  (`repository/kindReads.ts`), blocos lidos em sequência por `readHeaderChunks`/`blockRecords`, compactação por
  `mapInSlices`, ≥ 1 cessão por bloco e `AbortError` sem cessão depois do abort (`logic/fatias.md` §2). Remover o
  comentário de stub do parâmetro. → contrato: FR-001/FR-002, FR-008
- [X] T004 [US1] Opção `normalize` em `catalogSearch.ts`: aquecer, em fatias, o `normalizedName` da entrada **e** o
  `WeakMap normalizedByItem` do registro; exportar `warmNormalizedName(item, nameOf)` para reuso em T009.
  → contrato: FR-001/FR-002 (`normalizedName`)
- [X] T005 [US1] `loadGlobalSearchIndex(sourceId, database, options)` em `tv-web/src/lib/catalog/globalSearch.ts`
  repassa `{ signal, yieldToMain, normalize: true }` aos três tipos.
- [X] T006 [US1] Em `tv-web/src/features/catalog/catalogApi.ts`, `useGlobalSearchIndex` usa
  `queryFn: ({ signal }) => loadGlobalSearchIndex(sourceId as string, db, { signal })` (mesma contagem de linhas;
  teto 2 187).

### Testes da Fase

- [X] T007 [P] [US1] `tv-web/src/lib/catalog/globalSearch.test.ts` (novo ou existente): `searchGlobal` sobre o índice em
  fatias dá os mesmos resultados que sobre o índice de referência para "ma", "acao", "the" e "007" (SC-004); o sinal
  abortado rejeita com `AbortError`.
- [X] T008 [US1] `tv-web/src/features/search/SearchScreen.test.tsx` continua verde; acrescentar (se couber sem mexer na
  tela) um caso de termo digitado durante o carregando, aplicado ao índice pronto (FR-009).

**Critério de Conclusão**: contrato da fase → 2/2 verdes e `check-contract-tests.ps1 -Slug 084-indice-busca-sem-travar`
íntegro; contratos 017/018/026 verdes; `npx tsc -b` e `npm run lint` limpos.

**Registro da Fase**:

- Status: concluída (2026-10-20)
- Feito: `loadSearchIndex` em fatias (blocos em sequência, ≥ 1 cessão por bloco, `AbortError` sem cessão depois do
  abort, mesmas regras de `listAllOfKind`); `normalize` aquece as duas caches de nome normalizado (o getter da entrada
  agora usa o cache do registro, então um cálculo serve aos dois); `warmNormalizedName` exportado;
  `loadGlobalSearchIndex(sourceId, db, options)` com `normalize: true`; `useGlobalSearchIndex` passa o `signal`. Também
  entrou `features/catalog/aggregatedIndex.ts` (`loadAggregatedItems`, T009) porque o `queryFn` de `useAggregatedItems`
  precisava dele para a build continuar coerente.
- Contrato: `npx vitest run src/lib/catalog/catalogSearch.indice-sem-travar.contract.test.ts` → 2/2 verdes; trava íntegra.
- Testes executados: `npx vitest run src/lib/catalog/catalogSearch src/lib/catalog/globalSearch src/lib/slices.test.ts`
  → 33/33 (inclui os contratos 017/018/026 e o novo `globalSearch.test.ts`: 5 termos × índice em fatias = referência,
  mais o abort); `npx vitest run src/lib/catalog/globalSearch src/features/catalog/catalogApi src/features/search` → 109/109;
  `npx tsc -b` limpo; `npm run lint` ok (`catalogApi.ts` 2 181 < 2 187).
- Pendências: T008 — os casos existentes de `SearchScreen.test.tsx` já digitam o termo logo após montar (antes do índice
  chegar) e esperam os resultados, e o de "restaura o termo" cobre o termo vindo no 1º render; não acrescentei caso novo
  (FR-009 coberto por eles).

---

## Phase 4: User Story 2 - "Todos" ordenado sem congelar (Priority: P1)

**Objetivo**: itens de "Todos" e todas as ordenações em fatias, com a ordem de hoje.

**Independent Test**: contrato FR-005; na TV, "Todos" A–Z (e as demais) sem quadro > 100 ms.

### Contrato da Fase

- `FR-005: em fatias, cada ordenação dá exatamente a ordem de sortVodItems (empates na ordem da fonte)` — FR-005,
  SC-004, US2/AC1-AC2
- Comando: `npx vitest run src/features/vod/vodSort.indice-sem-travar.contract.test.ts`

### Implementation

- [X] T009 [US2] Criar `tv-web/src/features/catalog/aggregatedIndex.ts` com
  `loadAggregatedItems(sourceId, kind, toItem, { signal })`: `loadSearchIndex` + `mapInSlices(toItem)` + aquecimento do
  nome normalizado dos itens (`warmNormalizedName`). Em `catalogApi.ts`, o `queryFn` de `useAggregatedItems` passa a
  usá-lo, e o `useMemo` de `indexItems` sai (líquido ≤ +3 linhas no arquivo; conferir se algo mais lê
  `indexQuery.data.entries` ali). Em `logic/fatias.md` §3.
- [X] T010 \[US2\] Em `tv-web/src/features/vod/vodSort.ts`: extrair `comparatorFor(option)` (usado por `sortVodItems`) e
  implementar `sortVodItemsInSlices` com `stableSortInSlices` (`source` = cópia). Remover o `throw`.
  → contrato: FR-005
- [X] T011 \[US2\] Criar `tv-web/src/features/vod/useVodListItems.ts` (filtro por termo + `availableSortOptions` +
  `effectiveSortOption` + ordenação): síncrono até `SYNC_SORT_MAX = 2 000`; acima, `sortVodItemsInSlices` com
  `AbortController` por entrada; mantém o resultado anterior da mesma entrada enquanto ordena, senão `[]` +
  `pending: true`. Em `tv-web/src/features/vod/VodCategoryScreen.tsx`, trocar o bloco das linhas ~247–269 pelo hook e
  somar `pending` ao carregando (arquivo ≤ 949 linhas). Em `logic/fatias.md` §3.

### Testes da Fase

- [X] T012 \[P\] \[US2\] `tv-web/src/features/vod/useVodListItems.test.tsx`: lista grande → `pending` e depois a mesma ordem
  de `sortVodItems`; trocar a opção no meio aborta a anterior (sem resultado velho por cima); lista ≤ 2 000 é síncrona.
- [X] T013 \[US2\] Regressão de foco por id: em "Todos" com o foco num item, trocar a ordenação e voltar do detalhe mantém o
  mesmo item (teste existente de `VodCategoryScreen` ou E2E `carrosseis-filmes-series`/equivalente), FR-010.

**Critério de Conclusão**: contrato da fase → 1/1 verde e trava íntegra; contrato 025 (`vodSort.filmes-series-ds-v14`)
verde; `npm run lint` com os tetos respeitados.

**Registro da Fase**:

- Status: concluída (2026-10-20)
- Feito: `comparatorFor(option)` único em `vodSort.ts` (usado por `sortVodItems` e `sortVodItemsInSlices`); `useVodListItems.ts` (filtro, opções, `effectiveSortOption` e ordenação: síncrono até `SYNC_SORT_MAX = 2 000`, acima em fatias com `AbortController` por entrada, mantém a lista anterior da mesma entrada, senão `[]` + `pending`); `VodCategoryScreen.tsx` usa o hook e soma `pending` ao carregando (e ao `searchNoResults`): 930 linhas, teto 949. `loadSearchIndex` passou a ler por `listAllOfKind(..., clock)` (parâmetro opcional, mesma lista de exports da fachada, porque o contrato da 063 trava os exports e proíbe importar `repository/` de fora). `slices.check()` lança a `signal.reason` (não cria `DOMException` depois do teardown).
- Contrato: `npx vitest run src/features/vod/vodSort.indice-sem-travar.contract.test.ts` → 1/1 verde; trava íntegra (4 testes).
- Testes executados: `npx vitest run src/features/vod src/lib/slices.test.ts src/lib/catalog` → 151 arquivos, 863/863 (inclui contrato 025, `useVodListItems.test.tsx` 6/6, novo caso de `Todos` grande em `VodCategoryScreen.test.tsx` e o `fachada.test.ts`/contrato 063); `npx tsc -b` limpo; `npm run lint` ok.
- Pendências: A-01 (R-003): todas as ordenações (A–Z, Ano, Adicionados, Nota) passam pelo mesmo caminho em fatias, com a ordem idêntica à de hoje; comunicar ao usuário. T013: o caso existente `o foco segue o mesmo item` cobre o caminho síncrono; o novo caso cobre o carregando focável do caminho em fatias. A medição em fatias na TV fica na T019.

---

## Phase 5: User Story 3 - Telas abertas durante a pré-carga sem cair de quadros (Priority: P2)

**Objetivo**: remontar o índice no máximo uma vez a cada ~10 s com a tela aberta durante a pré-carga.

**Independent Test**: contrato FR-006; na TV, remontagem por 10 s a ≥ 50 fps.

### Contrato da Fase

- `FR-006: lotes seguidos remontam índice e busca global no máximo 1× a cada janela, com a última chegada incluída` —
  FR-006, SC-003, US3/AC1-AC2
- Comando: `npx vitest run src/features/catalog/prefetchApi.indice-sem-travar.contract.test.ts`

### Implementation

- [X] T014 \[US3\] Em `tv-web/src/features/catalog/prefetchApi.ts`, aplicar o limite (`logic/fatias.md` §4): chaves do
  índice marcadas como velhas sem reler, remontagem com borda de entrada e no fim da janela só se chegou algo; vitrine e
  demais chaves como hoje; `dispose()` cancela os timers. Remover o comentário de stub do parâmetro.
  → contrato: FR-006

### Testes da Fase

- [X] T015 \[P\] \[US3\] `tv-web/src/features/catalog/prefetchApi.test.ts`: a vitrine (`['catalog-search-index', f, kind,
  'showcase', …]`) continua relida a cada lote; `dispose()` não deixa remontagem pendente.
- [X] T016 \[P\] \[US3\] `tv-web/src/features/catalog/categoryAccessApi.test.tsx`: esconder uma categoria com o índice ativo
  dentro da janela de limite relê na hora (FR-007).

**Critério de Conclusão**: contrato da fase → 1/1 verde e trava íntegra; contrato 065 e `prefetchApi.test.ts` verdes.

**Registro da Fase**:

- Status: concluída (2026-10-20)
- Feito: `createPrefetchInvalidator` marca o índice (`['catalog-search-index', fonte, tipo]`, 3 elementos, e `['global-search-index', fonte]`) como velho sem reler e o remonta com borda de entrada e, no fim da janela de `refreshMs` (10 s), só se chegou algo; a vitrine e as demais chaves sob o prefixo seguem invalidadas a cada lote; `dispose()` cancela os timers. `categoryAccessApi.ts` e `App.tsx` não mudaram (`resetQueries` continua imediato).
- Contrato: `npx vitest run src/features/catalog/prefetchApi.indice-sem-travar.contract.test.ts` → 1/1 verde; trava íntegra (4 testes).
- Testes executados: `npx vitest run src/features/catalog src/features/search src/lib/slices.test.ts` → 24 arquivos, 137/137 (inclui os contratos 065 e 084, 2 casos novos em `prefetchApi.test.ts` e 1 em `categoryAccessApi.test.tsx`); `npx tsc -b` limpo.
- Pendências: o disparo da remontagem usa o relógio `Date.now` e cancela uma montagem em andamento (padrão do `refetchQueries`); se a montagem passar de 10 s na TV ela recomeçaria a cada janela. Medir na T019/T020 (a montagem na TV mediu 2–3 s).

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: gates do projeto, medição na TV e documentação.

- [X] T017 Rodar `npm run test`, `npx tsc -b`, `npm run lint`, `npm run build` (de `tv-web/`).
- [X] T018 Rodar `npm run test:e2e` com `npm run dev` de pé (gate da constitution antes da TV).
- [X] T019 Sonda na TV (medida em 2026-10-20; **critério NÃO cumprido em todas as medições**, ver `evidencias/quadros-tv-2026-10-20.md` e R-007) (**pedir autorização antes de instalar**): atualizar
  `sdd/specs/082-orcamento-armazenamento-tv/sonda-tv/memoria/entrada.ts` para medir o caminho novo (`allByName` via
  `loadAggregatedItems` + `sortVodItemsInSlices`, as quatro ordenações e "primeira tecla" de `searchGlobal` com termo de
  2 caracteres); `empacotar.mjs`; `quadrosIndice` ×2 (desinstala e reinstala); gravar
  `sdd/specs/084-indice-busca-sem-travar/evidencias/quadros-tv-AAAA-MM-DD.md`; desinstalar a sonda e parar o coletor.
  SC-001/SC-002/SC-003/SC-006; R-003/R-004.
- [X] T020 App real na TV (lido em 2026-10-20; **sem ganho mensurável**, ver `evidencias/app-real-perfoverlay-2026-10-20.md` e R-008) com `PerfOverlay` (**pedir autorização**): `VITE_CCPLAY_PERF=1` + `build:tizen` + deploy; o
  usuário lê `quadros>100ms` e o tempo até os resultados na Busca e em "Todos" A–Z (SC-005); depois build normal e
  reinstalação, avisando.
- [X] T021 Rodar `quickstart.md`; atualizar `plan.md` (Estado Atual) e o backlog (`update-feature-status.ps1`).

### Checklist de Release

- [X] Fase 2 (fundação) concluída
- [X] Fase 3 (US1) concluída
- [X] Fase 4 (US2) concluída
- [X] Fase 5 (US3) concluída
- [X] Testes de contrato todos verdes na suíte completa e `check-contract-tests.ps1` íntegro
- [X] Contratos de 017/018/025/026/065 verdes
- [X] `npm run lint` verde com os tetos de linha respeitados (sem mexer no baseline)
- [X] `npm run test:e2e` verde antes da TV (53/54 em paralelo; `orcamento-armazenamento-migracao` falhou 1× em paralelo — "não achei o item da lista lateral" — e passou 3/3 isolado)
- [ ] Sonda na TV: SC-001/SC-002/SC-003 aprovados em ≥ 2 medições; R-004 registrado (R-004 registrado no backlog; SC-001/002/003 cumpridos só na 1ª rodada da instalação B e no diagnóstico isolado — a 2ª rodada de cada instalação tem quadros de 150–217 ms)
- [X] App real na TV: SC-005 lido pelo usuário; pacote normal reinstalado (lido: +30 quadros>100ms em "Todos" A–Z contra +29 do código antigo — SC-005 NÃO cumprido; pacote normal reinstalado)
- [X] `quickstart.md` executado com sucesso (passos 1, 2, 4 e 5 feitos; o 3, no navegador do PC, é só diagnóstico e não foi repetido à mão)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Fase 2** bloqueia as fases 3, 4 e 5.
- **Fase 4** depende da Fase 3 (T009 usa `loadSearchIndex` em fatias e `warmNormalizedName`).
- **Fase 5** depende só da Fase 2 (arquivo independente).
- **Polish** depende de todas.

### Parallel Opportunities

- T001 e T002 juntos; T007 com T005/T006; T012 e T013 depois de T011; a Fase 5 inteira em paralelo com as fases 3 e 4.

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Fase 2 → Fase 3 → validar a busca global (contrato + sonda, se autorizado).

### Incremental Delivery

1. US1 (busca global) → US2 ("Todos" ordenado) → US3 (pré-carga), sem quebrar as anteriores.

## Notes

- `[P]` = arquivos diferentes, sem dependência
- `[Story]` mapeia a task pra uma user story específica
- Commitar após cada task ou grupo lógico coerente
- Parar em qualquer checkpoint pra validar a story isoladamente

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
