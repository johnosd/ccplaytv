---
description: "Lista de tasks da feature 063 — código saudável e benchmark de importação"
---

# Tasks: Código saudável — divisão do repositório do catálogo, fronteiras e tamanho por lint, benchmark de importação

**Input**: Documentos de design de `sdd/specs/063-codigo-saudavel-benchmark/`

**Prerequisites**: plan.md, spec.md, research.md, `logic/divisao-repositorio.md`, `logic/catraca-arquitetura.md`, `logic/benchmark.md`, quickstart.md

**Organization**: Tasks agrupadas por user story, na ordem do pacote (US1 → US2 → US3). A US2 **depende** da US1: a lista de exceções é gerada depois da divisão.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)
- Incluir caminhos de arquivo exatos nas descrições

## Path Conventions

- Frontend em `tv-web/`. App em `tv-web/src/`, scripts Node em `tv-web/scripts/`, E2E em `tv-web/e2e/`.
- Repositório do catálogo: a fachada fica em `tv-web/src/lib/catalog/catalogRepository.ts`, e os módulos em `tv-web/src/lib/catalog/repository/`.
- Comandos de teste, lint e build rodam em `tv-web/`. Os scripts `.planning/scripts/powershell/*.ps1` rodam na raiz do repositório.

---

## Phase 1: Setup

**Purpose**: Registrar o ponto de partida, para comparar depois.

- [X] T001 Em `tv-web/`, rodar `npx tsc -b`, `npm run lint` e `npm run test`, e registrar no Registro da Fase o resultado: falhas pré-existentes, se houver, com o nome do teste. Sem isso, uma falha depois da divisão não tem com o que ser comparada.
- [X] T002 Na raiz, rodar `check-contract-tests.ps1` para cada feature listada em `handoff.md` → "travas de outras features" e registrar que estão íntegras.

---

## Phase 2: Foundational

Nenhuma. As três stories partem do código atual. A dependência US1 → US2 está declarada na Fase 4.

---

## Phase 3: User Story 1 - Repositório do catálogo dividido sem mudar nada por fora (Priority: P1) 🎯 MVP

**Objetivo**: `catalogRepository.ts` vira fachada sobre 11 módulos de `lib/catalog/repository/`, sem mudança de comportamento nem de superfície.

**Independent Test**: o contrato da fachada passa, e `tsc`, `npm run test`, as travas de outras features e `npm run test:e2e` ficam verdes, sem editar nenhum importador.

### Contrato da Fase

- `exporta exatamente os mesmos valores, só reexporta de repository/ e cada módulo cabe no limite (FR-001, FR-002, SC-001, SC-002)`
- Comando: `npx vitest run src/lib/catalog/catalogRepository.codigo-saudavel.contract.test.ts`

### Implementation

Leia `logic/divisao-repositorio.md` antes de começar. A regra é **mover, não
reescrever** (D-002), copiando corpo, comentários e assinatura.

- [X] T010 [US1] Criar `tv-web/src/lib/catalog/repository/shared.ts` com `KEY_MIN`/`KEY_MAX`, `StorageFullError`, `isQuotaError`, `activeGenerationOf`, `activeGeneration`, `query`, `allGenerations`, `allCategoryGenerations`, `allStoredEntriesGenerations` e a sentinela `FavoritesScanComplete`, numa definição só (logic §2 e §4).
- [X] T011 [P] [US1] Criar `tv-web/src/lib/catalog/repository/categories.ts` (logic §2). Mover o docblock órfão das linhas 204–221 para cima de `listCategories`.
- [X] T012 [P] [US1] Criar `tv-web/src/lib/catalog/repository/structureRefresh.ts` (`RefreshedCategory`, `StructureRefreshResult`, `applyStructureRefresh`).
- [X] T013 [P] [US1] Criar `tv-web/src/lib/catalog/repository/categoryItems.ts` (`CategoryItemsTarget`, `storeCategoryItems`, `renewCategoryItems`, `StoredCategoryTarget`, `storeStoredCategory`).
- [X] T014 [P] [US1] Criar `tv-web/src/lib/catalog/repository/kindReads.ts` (`listAllOfKind`, `KindPageChunk`, `KindPage`, `readKindPage`, `kindSortFields`) e `tv-web/src/lib/catalog/repository/categoryReads.ts` (`categoriesAtOrder`, `readCategory`, `listChannels`, `getActiveCategoryBlock`, `countChannels`, `getChannel`).
- [X] T015 [P] [US1] Criar `tv-web/src/lib/catalog/repository/series.ts`, `stableIds.ts` e `continueWatching.ts` (logic §2), respeitando as dependências do logic §3. Depois verificar o R-001: o spy do teste (k) de `src/features/live/LiveScreen.favorites.test.tsx` precisa interceptar. Para isso, provoque temporariamente uma chamada a `resolveFavorites` ao focar, veja o teste ficar vermelho e desfaça. Registre isso no Registro da Fase.
- [X] T016 [P] [US1] Criar `tv-web/src/lib/catalog/repository/generations.ts` e `tv-web/src/lib/catalog/repository/staging.ts` (logic §2). `generations` importa `clearStagedItems` de `staging`.
- [X] T017 [US1] Reescrever `tv-web/src/lib/catalog/catalogRepository.ts` como fachada: o cabeçalho atual (as duas regras estruturais) mais um par `export { … } from` / `export type { … } from` por módulo, sempre por lista explícita (D-001, logic §5) → contrato: `exporta exatamente os mesmos valores…`
- [X] T018 [US1] Rodar `npx tsc -b`, `npm run lint` (só o oxlint por enquanto), `npm run test` e as travas do T002, e comparar com o T001. Conferir que `git diff --stat` da fase só toca a fachada e `repository/` (logic §6).
- [X] T019 [US1] Com `npm run dev` rodando, `npm run test:e2e` verde (FR-005, SC-003).

### Testes da Fase

- [X] T020 [P] [US1] Teste em `tv-web/src/lib/catalog/repository/fachada.test.ts` (projeto `node`, com `/// <reference types="node" />`): nenhum arquivo `.ts`/`.tsx` de `tv-web/src`, de produção ou teste, fora de `lib/catalog/repository/` e de `lib/catalog/catalogRepository.ts`, importa um caminho que contenha `/repository/` (D-001).

**Critério de Conclusão**: o contrato da fase passa (1/1), `check-contract-tests.ps1 -Slug 063-codigo-saudavel-benchmark` está íntegro, `tsc` e `npm run test` estão verdes ou sem falha nova em relação ao T001, todas as travas do T002 estão íntegras, `npm run test:e2e` está verde, nenhum importador foi editado e o R-001 foi verificado.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: concluída em 2026-10-07.
- Feito: catalogRepository.ts (1 517 linhas) virou fachada de 44 linhas sobre 11 módulos em 	v-web/src/lib/catalog/repository/ (shared 101, categories 160, structureRefresh 129, categoryItems 158, kindReads 112, categoryReads 160, series 188, stableIds 177, continueWatching 98, generations 199, staging 54 linhas). Os módulos foram gerados por script a partir das faixas de linha do original (só acrescentam import e export nos ajudantes internos), e nenhum importador foi editado. FavoritesScanComplete e StorageFullError têm definição única em shared.ts. O docblock órfão das linhas 204–221 desceu para cima de listCategories. Teste complementar T020 em epository/fachada.test.ts (2 testes). R-001 verificado: com uma chamada síncrona a esolveFavorites provocada em useFavoritesContent, o teste (k) de LiveScreen.favorites.test.tsx ficou vermelho (called 11 times), então o spy intercepta pela fachada. A provocação foi desfeita (git diff de catalogApi.ts vazio).
- Contrato: 
px vitest run src/lib/catalog/catalogRepository.codigo-saudavel.contract.test.ts → 1/1 verde; check-contract-tests.ps1 -Slug 063-codigo-saudavel-benchmark → trava íntegra (5 testes); as 11 travas de outras features (T002) íntegras antes e depois.
- Testes executados: linha de base (T001, código intocado): 
px tsc -b exit 0, 
pm run lint exit 0 (só avisos antigos de eact(refs)/exhaustive-deps), 
pm run test 2 867 verdes e 5 vermelhos (exatamente os 5 contratos desta feature, sem falha pré-existente). Depois da US1: 
px tsc -b exit 0, 
px oxlint sem erro novo, 
pm run test → 2 870 verdes e 4 vermelhos (os contratos de US2/US3, ainda 
ot implemented), ou seja, +1 contrato verde e +2 de achada.test.ts, sem regressão. 
pm run test:e2e (com 
pm run dev) → 42/42 scripts em 307 s. git status de 	v-web/src: só a fachada, epository/ e o contrato. Foi preciso gerar os módulos duas vezes: a primeira saída tinha uma linha em branco entre cada linha (defeito do script de extração, não do código), corrigida antes de qualquer teste.
- Pendências: o teste (k) da 013 tem asserção síncrona. Com a guarda enabled && removida de useFavoritesContent, ele continuou verde, porque a consulta assíncrona ainda não tinha chamado esolveFavorites quando o expect rodou. Isso já era assim antes da divisão e não é regressão da 063 (R-008). O dev server desta sessão (
pm run dev) segue no ar para os próximos E2E.

---

## Phase 4: User Story 2 - Fronteiras e tamanho verificados pelo lint, como catraca (Priority: P2)

**Objetivo**: `npm run lint` reprova import proibido novo e arquivo acima do limite ou do teto. O estado atual fica numa lista de exceções que só diminui.

**Independent Test**: com o lint verde no estado atual, cada alteração da tabela do `quickstart.md` §3 faz o lint falhar com a regra certa.

**Depende de**: Fase 3 concluída. A lista de exceções não pode herdar o tamanho antigo do repositório.

### Contrato da Fase

- `fronteiras: import novo proibido reprova em todas as formas; o herdado passa; catalog→player não tem exceção (FR-007..FR-010, FR-015)`
- `tamanho: arquivo novo acima do limite e herdado acima do teto reprovam; obsoletos são apontados; teste e fixture ficam de fora (FR-011, FR-013, FR-014)`
- `o código real, com a lista de exceções versionada, passa sem violação nem exceção catalog→player (SC-004, SC-005, FR-016)`
- Comando: `npx vitest run scripts/architecture.codigo-saudavel.contract.test.mjs`

### Implementation

Leia `logic/catraca-arquitetura.md` antes de começar.

- [X] T030 [US2] Mover a definição de `tv-web/src/lib/player/resumePolicy.ts` para `tv-web/src/lib/catalog/resumePolicy.ts`, com conteúdo e comentários iguais. O arquivo antigo vira `export { … } from '../catalog/resumePolicy'` com todos os nomes (não pode ser apagado: a trava da 019 o importa). `tv-web/src/lib/catalog/homeHero.ts` passa a importar `./resumePolicy` (D-006, FR-010). Os outros importadores não mudam.
- [X] T031 [US2] Em `tv-web/scripts/architecture.mjs`, implementar `countLines`, `isProductionFile`, `loadSourceFiles` e `loadBaseline` (logic §2, §3). `loadBaseline` lança um erro claro se o arquivo não existir.
- [X] T032 [US2] Em `tv-web/scripts/architecture.mjs`, implementar a extração (`ts.preProcessFile`), a resolução e as 4 regras de importação de `checkArchitecture` (logic §4, §5) → contrato: `fronteiras: …`
- [X] T033 [US2] Em `tv-web/scripts/architecture.mjs`, implementar a regra de tamanho e as exceções obsoletas (logic §6, §7) → contrato: `tamanho: …`
- [X] T034 [US2] Em `tv-web/scripts/architecture.mjs`, implementar `buildBaseline` (que nunca inclui `catalog-to-player`) e o `main()` com os modos verificar, `--write-baseline` (recusa se o arquivo existe) e `--prune` (só aperta), mais o formato de saída e os códigos de saída do logic §8.
- [X] T035 [US2] Gerar `tv-web/scripts/architecture-baseline.json` com `node scripts/architecture.mjs --write-baseline`, **só depois** do T017 e do T030. Revisar à mão: sem `lib/catalog/catalogRepository.ts` nem `lib/catalog/repository/*` em `maxLines`, sem par catalog→player e com 1 entrada `components-to-features` (`usePlayerSession.ts`). Registrar os totais (imports herdados, arquivos com teto) no Registro da Fase → contrato: `o código real…`
- [X] T036 [US2] Em `tv-web/package.json`, mudar `lint` para `oxlint && node scripts/architecture.mjs` (D-004, FR-016).

### Testes da Fase

- [X] T037 [P] [US2] Testes em `tv-web/scripts/architecture.test.mjs`: resolução para `index.ts`/`index.tsx`, especificador com `.ts` explícito, pacote ignorado, destino `.css` classificado pelo prefixo, destino fora de `src` ignorado; `buildBaseline` sem `catalog-to-player`; `--prune` (via função pura extraída do `main`) nunca acrescenta nem sobe teto; `--write-baseline` recusa quando a lista existe.
- [X] T038 [US2] Executar à mão a tabela do `quickstart.md` §3 (SC-004) num ramo descartável e registrar a regra que apareceu para cada linha.

**Critério de Conclusão**: `npx vitest run scripts/architecture.codigo-saudavel.contract.test.mjs` → 3/3 verdes, `check-contract-tests.ps1` íntegro, `npm run lint` verde no estado atual e vermelho nos 6 casos do T038, nenhum import de `lib/catalog` para `lib/player` (SC-005), e `npm run test` verde (incluindo `resumePolicy.test.ts` e a trava da 019).

**Checkpoint**: User Story 2 funcional e testável isoladamente.

**Registro da Fase**:

- Status: concluída em 2026-10-07.
- Feito: T030 — a definição de `resumePolicy` passou para `tv-web/src/lib/catalog/resumePolicy.ts` (cópia idêntica); `lib/player/resumePolicy.ts` reexporta os 7 nomes e `lib/catalog/homeHero.ts` importa `./resumePolicy` (era o único import `lib/catalog` → `lib/player`). T031–T034 — `tv-web/scripts/architecture.mjs` implementado: contagem física, `isProductionFile`, extração por `ts.preProcessFile` (só relativos, incluindo `import type`, `export … from` e `import()`), resolução (`index.ts[x]`, extensão explícita, `.css` classificado pelo prefixo, fora de `src` ignorado), as 4 regras de importação, regra de tamanho com teto herdado, exceções obsoletas, `buildBaseline` (nunca `catalog-to-player`), `pruneBaseline` (só aperta), `serializeBaseline` (ordem alfabética, 2 espaços) e `runCli` (`0` ok, `1` violação, `2` sem lista ou lista já existente). T035 — `scripts/architecture-baseline.json` gerado uma vez depois da US1 e do T030: 145 imports herdados em 50 origens, 37 arquivos com teto, 1 entrada `components-to-features` (`components/player/usePlayerSession.ts` → `features/catalog/catalogApi.ts`), nenhuma `lib-to-ui`, nenhum par catalog→player, sem `catalogRepository.ts` nem `repository/*` em `maxLines`. Os 5 maiores: `catalogApi.ts` 2 190, `SeriesDetailScreen.tsx` 1 021, `importPipeline.ts` 981, `VodCategoryScreen.tsx` 950, `xtreamConnector.ts` 910. T036 — `"lint": "oxlint && node scripts/architecture.mjs"`. T037 — `scripts/architecture.test.mjs` com 12 testes (resolução, `isProductionFile`, `countLines`, `buildBaseline`, `pruneBaseline`, `serializeBaseline`, CLI: `--write-baseline` recusa, `--prune`, sem lista = `2`, violação = `1` sem imprimir trecho de código).
- Contrato: `npx vitest run scripts/architecture.codigo-saudavel.contract.test.mjs` → 3/3 verdes; `check-contract-tests.ps1 -Slug 063-codigo-saudavel-benchmark` → trava íntegra (5 testes). **Emenda aprovada pelo usuário em 2026-10-07 (R-009):** o `rulesOf` do contrato gerava `max-lines lib/x.ts ->` e o teste 2 esperava `max-lines lib/x.ts`, impossível de passar; só o formatador foi trocado e a trava regravada com `-Write`.
- Testes executados: `npx vitest run scripts/architecture.test.mjs scripts/architecture.codigo-saudavel.contract.test.mjs` → 15/15; `npx tsc -b` exit 0; `npm run lint` exit 0 (oxlint + `architecture: ok — 326 arquivos de produção, 145 imports herdados, 37 arquivos com teto`); `npm run test` → 2 885 verdes e 1 vermelho (o contrato de fixtures da US3, ainda `not implemented`), +15 em relação à US1, sem regressão. T038 (quickstart §3, feito no próprio working tree com backup e restauração de cada arquivo, não num ramo, porque há alterações não commitadas): (1) `feature-to-feature` em `LiveScreen.tsx` → lint `1` (e também `max-lines` 350 > 349, porque a linha a mais estourou o teto do arquivo); (2) `lib-to-ui` em `history.ts` → `1`; (3) `components-to-features` em `Stage.tsx` → `1`; (4) `catalog-to-player` em `freshness.ts` → `1`; (5) `lib/novo.ts` com 301 linhas → `max-lines (301 > 300)`; (6) +1 linha em `catalogApi.ts` → `max-lines (2191 > 2190)`. Tirando 2 linhas de `xtreamConnector.ts`, o lint passou com o aviso `teto pode baixar (909 < 910)`, `--prune` baixou o teto para 909 e `--write-baseline` recusou com `exit 2`; arquivos e lista restaurados, `git status` limpo para eles. O primeiro teste do caso 5 reprovou no oxlint (301 declarações repetidas) antes de a catraca rodar; refeito com nomes únicos.
- Pendências: nenhuma da US2. O `npm run test:e2e` completo fica para o Polish (T054); a US2 não mexe em comportamento do app além da troca de lugar do `resumePolicy`, coberta pela suíte e pela trava da 019.

---

## Phase 5: User Story 3 - Benchmark de importação com resultado registrado (Priority: P3)

**Objetivo**: `npm run bench:import` mede Xtream, M3U e XMLTV em 1k, 10k e 100k, etapa a etapa e pelo caminho real, com uso e quota de armazenamento, e grava um resultado versionado comparável.

**Independent Test**: `quickstart.md` §4 produz um arquivo em `tv-web/bench-results/` com as combinações pedidas, `countsMatch: true` e comparação com o anterior.

### Contrato da Fase

- `mesma semente gera o mesmo conteúdo, outra semente não, e cada formato tem exatamente o tamanho pedido (FR-018, SC-007)`
- Comando: `npx vitest run scripts/bench/fixtures.codigo-saudavel.contract.test.mjs`

### Implementation

Leia `logic/benchmark.md` antes de começar. **Nenhuma linha** muda no pipeline de
produção (D-007). Se precisar de uma função que não é exportada, compõe com o que
já é. Se não der, pare e registre em `Riscos e Decisões`.

- [X] T040 [US3] Implementar `generateFixture` em `tv-web/scripts/bench/fixtures.mjs` (logic §2): PRNG com semente, proporções, host `127.0.0.1`, `clock` no XMLTV e `expected` → contrato: `mesma semente gera…`
- [X] T041 [US3] Criar `tv-web/bench.html` (carrega `/src/bench/importBench.ts`) e implementar o modo `stages` em `tv-web/src/bench/importBench.ts`, expondo `window.__importBench.run` (logic §3). O arquivo tem de caber em 300 linhas; se não couber, divida em `src/bench/`.
- [X] T042 [US3] Implementar o modo `real` e a leitura de uso e quota (`"não informado"` como fallback) em `tv-web/src/bench/importBench.ts` (logic §3, FR-019, FR-020).
- [X] T043 [P] [US3] Criar `tv-web/scripts/bench/report.mjs` com as funções puras: slug do aparelho (sem hostname nem usuário), nome do arquivo de resultado, busca do anterior do mesmo `device` e tabela de variação por etapa (logic §4, §5, FR-021, FR-022).
- [X] T044 [US3] Criar `tv-web/scripts/bench/run-import-bench.mjs`: servidor das fixtures, um contexto Playwright por modo e combinação, `--cpu` por CDP, timeout de 15 min por combinação, `countsMatch`, gravação em `tv-web/bench-results/` e impressão da comparação. Sai com `0` mesmo se ficou mais lento (logic §4, FR-017, FR-023).
- [X] T045 [US3] Implementar `--serve-only` em `tv-web/scripts/bench/run-import-bench.mjs` (servidor na LAN, `POST /result`, URL impressa) e `?auto=1&fixtures=` em `tv-web/src/bench/importBench.ts` (FR-024).
- [X] T046 [US3] Em `tv-web/package.json`, acrescentar `"bench:import": "node scripts/bench/run-import-bench.mjs"`. Conferir que `tv-web/bench-results/` não está em nenhum `.gitignore` e que `e2e/run.mjs` não inclui o benchmark.
- [X] T047 [US3] Rodar `npm run bench:import` completo (1k/10k/100k, os 3 formatos) com `npm run dev`, e versionar o resultado. Rodar `--sizes 1000` de novo e conferir a comparação. Registrar no Registro da Fase as combinações que falharam, se houver, com a etapa.

### Testes da Fase

- [X] T048 [P] [US3] Testes em `tv-web/scripts/bench/report.test.mjs`: slug sem hostname nem usuário, nome do arquivo, comparação só com o mesmo `device`, primeira execução sem anterior não quebra, e uma combinação com falha aparece na tabela sem derrubar as outras.

**Critério de Conclusão**: `npx vitest run scripts/bench/fixtures.codigo-saudavel.contract.test.mjs` → 1/1 verde, `check-contract-tests.ps1` íntegro, `report.test.mjs` verde e um resultado versionado com 9 combinações, `countsMatch: true` nas que terminaram, sem URL, hostname ou usuário (SC-006, SC-007). O benchmark fica fora do `npm run test:e2e`.

**Checkpoint**: User Story 3 funcional e testável isoladamente.

**Registro da Fase**:

- Status: concluída em 2026-10-07 (T047 feito depois do checkpoint parcial; ver Pendências).
- Feito: T040 `generateFixture` (PRNG mulberry32 com semente; proporções 40/40/20; categorias `max(2, round(n/500))`; `BENCH_CLOCK` fixo exportado e devolvido em `clock`; só host `127.0.0.1`; 100k gera 14–17 MB em ~100–180 ms). T041/T042 bancada em `tv-web/bench.html` + `tv-web/src/bench/` dividida em `benchTypes.ts`, `benchStages.ts` (modo `stages`), `benchReal.ts` (modo `real`, uso e quota por `navigator.storage.estimate()` com `"não informado"` de reserva) e `importBench.ts` (`window.__importBench.run/cleanup` e o modo `?auto=1&fixtures=`); só compõe funções públicas, nenhuma linha do pipeline mudou. T043 `scripts/bench/report.mjs` (slug do aparelho sem nome da máquina nem usuário, nome do arquivo, `findPrevious` do mesmo `device`, `compareResults`, `formatComparison`, `findLeaks`). T044/T045 `scripts/bench/run-import-bench.mjs` (servidor das fontes, Playwright com um contexto novo por modo e combinação, `--cpu` por CDP, timeout de 15 min, `mergeCombination`, gravação em `bench-results/` recusando resultado com URL, comparação com o anterior, exit 0 mesmo se ficou mais lento; `--serve-only` com `GET /plan` e `POST /result`). T046 `"bench:import"` no `package.json`; `bench-results/` não está em nenhum `.gitignore` e `e2e/run.mjs` não referencia o benchmark. T048 `report.test.mjs`. Complementares: `importBench.test.mjs` (9 testes da bancada com `fake-indexeddb` e `fetch` servindo as fixtures, 3 formatos × 2 modos, quota, falha) e `run-import-bench.test.mjs` (8 testes: argumentos, rotas do servidor, junção dos modos).
- Decisões do execute (não mudam o contrato): (1) cada combinação é servida sob `/f/<formato>-<tamanho>/…` (`player_api.php`, `playlist.m3u`, `epg.xml`), e `/plan` e `/result` ficam na raiz, para a página da TV rodar várias combinações num servidor só; `normalizeServerAddress` preserva o subpath. (2) `counts` : no modo `stages`, `items` = tudo o que foi gravado; no `real`, `items` = canais + filmes + séries (episódio de M3U vira série, não item), que é o que `expected.items` descreve; `countsMatch` exige os dois modos que terminaram. (3) Falha em um modo marca a combinação como `failed` (`failedStage` = `<modo>:<etapa>`) e guarda o que o outro modo mediu. (4) O runner não lê o nome da máquina nem o usuário (um teste confere o código-fonte) e por isso o guarda de vazamento só procura URL.
- Contrato: `npx vitest run scripts/bench/fixtures.codigo-saudavel.contract.test.mjs` → 1/1 verde; `check-contract-tests.ps1 -Slug 063-codigo-saudavel-benchmark` → trava íntegra (5 testes). Com isso os 5 contratos da feature estão verdes.
- Testes executados: `npx vitest run scripts/bench` → 26/26 (1 contrato + 8 + 9 + 8); `npx tsc -b` exit 0; `npm run lint` exit 0 (`architecture: ok — 330 arquivos de produção`; os arquivos de `src/bench/` cabem em 300 linhas e não têm import proibido); `npm run test` → 2 911 verdes em 467 arquivos. Fumaça do CLI: `--formats dash` → exit 2; sem dev server → exit 1 com a instrução de rodar `npm run dev`; `--serve-only` de ponta a ponta (plano servido, `POST /result` recebido, arquivo gravado com `runtime: tv-browser` e `countsMatch: true`, depois apagado). **Teste instável corrigido**: na primeira rodada da suíte completa, `importBench.test.mjs` (xmltv/stages) estourou o timeout padrão de 5 s sob a carga dos 6 workers e passava isolado; era do meu teste, não do código, e ganhou `vi.setConfig({ testTimeout: 60_000 })`. A segunda rodada completa passou 2 911/2 911.
- Pendências: nenhuma da US3. **T047 feito** (autorizado pelo usuário, dev server subido para isso): `npm run bench:import` completo — 9 combinações `ok`, todas `countsMatch: true`, classifyMs `null` só no XMLTV, uso e quota lidos (`storage` com números). Tempos de referência neste aparelho (desktop win32, i7-10700F, Chromium 153, sem throttling), `stages` total / caminho real: Xtream 1k 52/67 ms, 10k 135/146 ms, 100k 1 138/1 344 ms; M3U 1k 42/76 ms, 10k 155/339 ms, 100k 1 228/3 190 ms; XMLTV 1k 80/80 ms, 10k 624/602 ms, 100k 6 408/6 127 ms. Uso gravado em 100k: Xtream 3,8 MB, M3U 28,4 MB, XMLTV 59,6 MB. Segunda rodada `--sizes 1000` imprimiu a comparação contra a anterior do mesmo aparelho, com variação de −10% a +31% em etapas de 1–5 ms (ruído) e exit 0. Dois arquivos versionados em `tv-web/bench-results/` (um completo, um de 1k; `dirty: true` porque o commit ainda não foi feito). Ajuste feito no meio: o nome do arquivo tem resolução de minuto, então o runner passou a acrescentar `-2`, `-3`… em vez de sobrescrever. Contorno de PowerShell (o `--` do `npm run` é consumido): `node scripts/bench/run-import-bench.mjs --flag`, documentado no `CLAUDE.md` e no `quickstart.md`. Não rodado: a rodada opcional na TV física (`--serve-only` foi exercitado só com um resultado simulado).

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Gates finais e documentação.

- [X] T050 Em `tv-web/`, rodar `npx tsc -b`, `npm run lint` (oxlint + catraca) e `npm run test` completos.
- [X] T051 `npm run build`: conferir que `tv-web/dist/` não contém `bench.html` nem código de `src/bench/` (procurar por `__importBench`) e que `scripts/check-no-demux-in-build.mjs` passa (FR-025).
- [X] T052 Atualizar `CLAUDE.md` → "Commands": `npm run lint` agora inclui a catraca (`scripts/architecture.mjs`, lista em `scripts/architecture-baseline.json`, só aperta; import herdado ou teto novo só por edição manual justificada) e `npm run bench:import` (fora do `test:e2e`, resultados em `tv-web/bench-results/`). Uma frase curta para cada, sem parágrafo de status de feature (regra do próprio `CLAUDE.md`).
- [X] T053 Revisão de segredos (constitution, Fluxo): fixtures, `bench-results/*.json`, a saída do runner e a da catraca sem credencial, URL de painel, hostname ou nome de usuário.
- [X] T054 Com `npm run dev` rodando, `npm run test:e2e` completo verde.
- [X] T055 Rodar `quickstart.md` inteiro.
- [X] T056 Na raiz, `check-contract-tests.ps1` desta feature e das features listadas em `handoff.md`, todas íntegras.

### Checklist de Release

- [X] Fase 3 (US1) concluída
- [X] Fase 4 (US2) concluída
- [X] Fase 5 (US3) concluída
- [X] Testes de contrato 5/5 verdes na suíte completa e `check-contract-tests.ps1` íntegro (desta e das outras features)
- [X] `npx tsc -b`, `npm run lint`, `npm run test` e `npm run build` verdes
- [X] `npm run test:e2e` verde (gate da constitution antes de qualquer TV)
- [X] `dist/` sem nada do benchmark
- [X] Revisão de segredos feita
- [X] `CLAUDE.md` atualizado
- [X] `quickstart.md` executado com sucesso
- [ ] TV física: **não é gate**. A rodada `--serve-only` é opcional (R-004).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sem dependências.
- **US1 (Fase 3)**: depende do Setup.
- **US2 (Fase 4)**: depende da US1 (T035 depois de T017) e do próprio T030.
- **US3 (Fase 5)**: independente da US1. Mas, se a US2 já estiver ativa, os arquivos novos do benchmark têm de caber no limite e respeitar as fronteiras (`src/bench/` só tem a regra de tamanho).
- **Polish (Fase 6)**: depende das três.

### Parallel Opportunities

- T011–T016 criam arquivos diferentes, a partir do mesmo arquivo de origem. Podem ser feitos em paralelo depois do T010, e a fachada (T017) fecha.
- T037 em paralelo ao T034.
- T043 e T048 em paralelo ao T041/T042.

---

## Parallel Example: User Story 1

```bash
# Depois do T010:
Task: "T011 [P] [US1] categories.ts"
Task: "T012 [P] [US1] structureRefresh.ts"
Task: "T013 [P] [US1] categoryItems.ts"
Task: "T016 [P] [US1] generations.ts + staging.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Fase 1: Setup (linha de base dos testes).
2. Fase 3: US1.
3. **PARAR E VALIDAR**: contrato, suíte, travas e E2E.

### Incremental Delivery

1. US1, que entrega um repositório navegável.
2. US2, que gera a lista de exceções sobre o código já dividido.
3. US3, o benchmark.
4. Polish.

## Notes

- `[P]` = arquivos diferentes, sem dependência
- `[Story]` mapeia a task pra uma user story específica
- Commitar após cada task ou grupo lógico coerente
- Parar em qualquer checkpoint pra validar a story isoladamente

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
