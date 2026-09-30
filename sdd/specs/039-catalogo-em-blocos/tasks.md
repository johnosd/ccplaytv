---
description: "Tasks da feature 039 — catálogo em blocos por categoria"
---

# Tasks: Catálogo em blocos por categoria — leitura e gravação instantâneas

**Input**: Documentos de design de `sdd/specs/039-catalogo-em-blocos/`

**Prerequisites**: plan.md, spec.md, data-model.md, logic/blocos-e-identidade.md, quickstart.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence

## Path Conventions

- Código: `tv-web/src/lib/catalog/` (armazenamento), `tv-web/src/lib/catalog/prefetch/` (conversão em segundo plano). Telas não mudam.
- E2E: `tv-web/e2e/*.mjs`; comandos em `tv-web/`, scripts `.planning/…` na raiz.

---

## Phase 1: Setup

- [X] T001 `tv-web/src/lib/catalog/db.ts`: `CategoryBlockRecord`/`BlockItem` e tabela `categoryBlocks: 'categoryId, [sourceId+generation+kind]'` em `this.version(14)` (data-model.md)

---

## Phase 2: Foundational — blocos, identidade e leitura com reserva (US1/US2/US3) 🎯

**Objetivo**: toda escrita de itens de categoria vai para bloco; toda leitura pública acha itens em blocos e, na falta, nas linhas antigas.

### Contrato da Fase

- `grava a categoria como um bloco, com id estável por identidade e sem linha por item` — FR-001/002/003
- `episódios continuam por série e a marca de obtenção da série sobrevive à renovação do bloco` — FR-004
- `varreduras de um tipo leem blocos e formato antigo juntos, sem duplicar` — FR-006
- `categoria removida numa atualização some com o bloco; a mantida continua servindo` — FR-002
- Comando: `npx vitest run src/lib/catalog/categoryBlocks.catalogo-em-blocos.contract.test.ts` (4/5 verdes nesta fase; o de conversão fica para a Fase 3)

### Implementation

- [X] T002 `categoryBlocks.ts`: `blockItemId`/`categoryIdOfBlockItem` (§3 de `logic/blocos-e-identidade.md`) e identidade (reusar a de `renewWithin`) → contrato: `grava a categoria como um bloco…`
- [X] T003 `categoryBlocks.ts` + `catalogRepository.ts`: `writeBlock` (§4) no lugar do corpo de `renewWithin` — `renewCategoryItems`, `storeCategoryItems` e os itens de `storeStoredCategory` passam a gravar bloco e apagar as linhas antigas da categoria; `storeBatch` intocado (D-008) → contratos 1 e 2
- [X] T004 `catalogRepository.ts`: leitura com reserva (§5) — `listChannels`, `countChannels`, `getChannel` (id negativo → bloco, confere geração ativa), `listAllOfKind` → contratos 1 e 4
- [X] T005 `catalogRepository.ts`: `resolveFavorites` varrendo blocos um por vez e depois linhas; `resolveContinueWatching` e `homeHero.resolveSeriesParent` via `findSeriesRecord` (linhas → blocos de séries) → contrato 4
- [X] T006 `catalogRepository.ts`: `storeSeriesEpisodes` carimba `episodesFetchedAt` no item do bloco quando `seriesRecordId < 0` (§7) → contrato 2
- [X] T007 `catalogRepository.ts`: `publishGeneration`, `applyStructureRefresh`, `collectStaleGenerations`, `discardGeneration`, `deleteAllForSource` também tratam `categoryBlocks` (§8) → contrato 5
- [X] T008 Conferir consumidores sem mudar assinatura: `catalogSearch.ts`, `globalSearch.ts`, `history.ts`, `localTitleMatch.ts` (varredura própria na linha ~45 — passar por `listAllOfKind`/blocos), `playbackUrl.ts`, `seriesLoader.ts`, `titleMetadata.ts`, `features/catalog/catalogApi.ts` (`loadCategoryContent`: uma leitura do bloco em vez de `listChannels` + `countChannels`)

### Testes da Fase

- [X] T009 [P] `categoryBlocks.test.ts`: colisão de slot forçada (identidades com o mesmo hash) é determinística e estável na renovação (R-004); M3U com nomes repetidos; `categoryIdOfBlockItem` de id positivo = `undefined`
- [X] T010 Rodar **todas as travas** das features 017/025/026/032/033/035/036/038 e a suíte `src/lib` + `src/features/catalog` — nenhuma regressão (D-002, R-006)

**Critério de Conclusão**: 4 contratos da fase verdes (o 3º fica para a Fase 3) e trava íntegra; travas de outras features íntegras e verdes (exceto as já vermelhas de 034/036, que continuam compilando); `npx tsc -b` limpo.

**Registro da Fase**:

- Status: Concluída (2026-09-30).
- Feito: `categoryBlocks.ts` com identidade/assinatura (movidas de `renewWithin`), `blockItemId`/`categoryIdOfBlockItem`, `writeBlockWithin` (id reaproveitado por identidade em duas passadas, `episodesFetchedAt` mantido, linhas antigas da categoria apagadas na mesma transação), faixas `blocksOfSource`/`blocksOfKind`. No repositório: `storeCategoryItems` = `renewCategoryItems` = bloco (R-007); `storeStoredCategory` grava bloco; `listChannels`/`countChannels`/`getChannel`/`listAllOfKind` leem bloco com reserva nas linhas; `resolveFavorites` varre blocos um por vez e depois linhas; `findSeriesRecord` (novo, exportado) usado por `resolveContinueWatching` e `homeHero`; `storeSeriesEpisodes` carimba o item do bloco (id < 0); `applyStructureRefresh`/`publishGeneration`/`collectStaleGenerations`/`discardGeneration`/`deleteAllForSource` tratam blocos. `catalogApi.loadCategoryContent`: uma leitura (`totalCount = records.length`). T008: `catalogSearch`/`globalSearch`/`history`/`localTitleMatch` (a varredura própria é de `titleMetadata`)/`playbackUrl`/`seriesLoader`/`titleMetadata` só usam a API pública — sem mudança. Testes não travados que liam `channels` cru passaram a usar `src/testing/catalogStorage.ts` (`storedItems`), e os de falta de espaço espionam `categoryBlocks.put`.
- Contrato: `npx vitest run src/lib/catalog/categoryBlocks.catalogo-em-blocos.contract.test.ts` → 4/5 verdes (o de conversão falha em `not implemented`, esperado até a Fase 3); trava íntegra. Travas de todas as 23 features íntegras (`check-contract-tests.ps1 -Slug <cada>`).
- Testes executados: `npx vitest run src/lib/catalog/categoryBlocks.test.ts` → 6/6; `npx vitest run src/lib src/features/catalog` → 18 falhas na 1ª rodada (DataError com `Dexie.minKey` em chave composta — R-008 — e testes lendo `channels` cru), 0 minhas depois dos ajustes; `npx vitest run` completo → 1953/1967 (14 falhas: 11 contratos de 034/036 já vermelhos, o contrato de conversão da 039, e 3 flakes conhecidos `LiveScreen.favorites`/`LiveScreen`/`MoviesScreen.favorites`, 103/103 isolados); `npx tsc -b` limpo; `npm run lint` sem erro.
- Pendências: flakes de tela sob paralelismo (conhecidos, não desta feature). Nenhuma medição ainda (Fase 4).

---

## Phase 3: User Story 4 — Conversão sem perder nada (Priority: P1)

**Objetivo**: listas já guardadas viram blocos em segundo plano, retomável, sem tocar no estado do usuário.

### Contrato da Fase

- `converte o formato antigo em partes, sem perder itens nem favoritos, e sem refazer` — US4, FR-008..011
- Comando: o mesmo da Fase 2 (5/5 verdes ao fim desta fase)

### Implementation

- [ ] T011 [US4] `categoryBlocks.ts`: `convertLegacyCategories` (§6), preservando `itemsFetchedAt` → contrato 3
- [ ] T012 [US4] `prefetch/index.ts`: `housekeeping` roda a conversão (1 categoria por chamada) antes de `collectStaleGenerations`; enquanto houver o que converter, o agendador não para de chamar (FR-008/FR-012)

### Testes da Fase

- [ ] T013 [US4] Teste: conversão interrompida no meio (erro simulado na 2ª categoria) → retomada sem duplicar; categoria `eager` também converte
- [ ] T014 [US4] E2E `e2e/catalogo-em-blocos.mjs` cenário 2 (migração): semear o banco no formato antigo pelo próprio app (build anterior não disponível — semear linhas via `page.evaluate` no IndexedDB), abrir, conferir conversão, favoritos e progresso

**Critério de Conclusão**: 5/5 contratos verdes + trava íntegra; T013/T014 verdes.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 4: User Stories 1 e 2 — medir abrir categoria e catálogo pronto (Priority: P1)

- [ ] T015 [US1] E2E `e2e/catalogo-em-blocos.mjs` cenário 1: lista nova → `channels` só com episódios; abrir categoria, "Todos", busca, ★, ↺, detalhe e tocar (painel falso)
- [ ] T016 [US1/US2] Probe com a lista real (`carga-listas-real.mjs`/probe de seção da 038), CPU 4×: tempo até tudo pronto, abrir a categoria de 11 mil filmes, "Todos" de Filmes; registrar em `plan.md` R-002
- [ ] T017 [US2] Se o tempo total não melhorar com os blocos, investigar o gargalo restante (mapear itens no Worker, assinatura) — task ad-hoc com a medição

**Critério de Conclusão**: medições registradas; E2E cenário 1 verde.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 5: User Story 3 — listas agregadas (Priority: P2)

- [ ] T018 [US3] "Todos"/busca (`catalogSearch.loadSearchIndex`, `globalSearch`): medir com 31 mil filmes; se > 1 s (CPU 4×), cachear o índice por sessão invalidado por `onCategoryDone` (R-002)
- [ ] T019 [US3] `resolveContinueWatching`: resolver em lote por tipo (uma varredura por tipo, não uma por item)
- [ ] T020 [US3] Teste de componente/E2E: ★ Favoritos, ↺ Histórico e Semelhantes mostram os mesmos itens antes/depois da conversão

**Critério de Conclusão**: SC-003 medido no PC (CPU 4×); T020 verde.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 6: User Story 5 — lista enorme sem fechar (Priority: P2)

- [ ] T021 [US5] `e2e/catalogo-em-blocos.mjs` cenário 3: painel falso gerando ~300 mil itens (seção de filmes); medir heap (CDP `Performance.getMetrics`) durante a carga e em "Todos"; registrar em R-005
- [ ] T022 [US5] Se o heap passar do orçamento (a definir pela medição; referência: ~278 MB livres num aparelho webOS pesquisado), reduzir o pico (busca em fluxo por blocos) — task ad-hoc

**Critério de Conclusão**: cenário 3 roda até o fim sem quebrar a página; pico registrado.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 7: Polish & Cross-Cutting

- [ ] T023 `tv-web/package.json`: `e2e/catalogo-em-blocos.mjs` no `test:e2e`
- [ ] T024 `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build:tizen`, `npm run test:e2e` (dev server reiniciado)
- [ ] T025 SC-006: `node e2e/paridade-limpeza.mjs` sem diferença visual
- [ ] T026 Gate na TV física (SC-007): tabela do `quickstart.md`; fechar sem ele só com decisão explícita do usuário em Riscos
- [ ] T027 Docs: `CLAUDE.md` (parágrafo da 039 e "Known deviation"), backlog via script

### Checklist de Release

- [X] Fase 1 concluída
- [X] Fase 2 concluída
- [ ] Fase 3 (US4) concluída
- [ ] Fase 4 (US1/US2) concluída
- [ ] Fase 5 (US3) concluída
- [ ] Fase 6 (US5) concluída
- [ ] 5/5 contratos da 039 verdes na suíte completa e `check-contract-tests.ps1 -Slug 039-catalogo-em-blocos` íntegro
- [ ] Travas de 017/018/024/025/026/027/029/030/031/032/033/034/035/036/038 íntegras
- [ ] `npm run test:e2e` verde
- [ ] Gate SC-007 na TV (ou decisão explícita registrada)

---

## Dependencies & Execution Order

- Fase 1 → Fase 2 (bloqueante) → Fase 3 → Fases 4/5/6 (qualquer ordem) → Fase 7.
- A 038 precisa estar no código (pré-carga por seção, `renewCategoryItems`).

## Notes

- Nunca editar arquivos `*.contract.test.*`.
- Telas não mudam: se alguma precisar mudar, é sinal de que a API pública do repositório mudou (D-002) — parar e revisar.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
