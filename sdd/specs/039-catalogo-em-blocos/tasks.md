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

- [X] T011 [US4] `categoryBlocks.ts`: `convertLegacyCategories` (§6), preservando `itemsFetchedAt` → contrato 3
- [X] T012 [US4] `prefetch/index.ts`: `housekeeping` roda a conversão (1 categoria por chamada) antes de `collectStaleGenerations`; enquanto houver o que converter, o agendador não para de chamar (FR-008/FR-012)

### Testes da Fase

- [X] T013 [US4] Teste: conversão interrompida no meio (erro simulado na 2ª categoria) → retomada sem duplicar; categoria `eager` também converte
- [X] T014 [US4] E2E `e2e/catalogo-em-blocos.mjs` cenário 2 (migração): semear o banco no formato antigo pelo próprio app (build anterior não disponível — semear linhas via `page.evaluate` no IndexedDB), abrir, conferir conversão, favoritos e progresso

**Critério de Conclusão**: 5/5 contratos verdes + trava íntegra; T013/T014 verdes.

**Registro da Fase**:

- Status: Concluída (2026-09-30).
- Feito: `convertLegacyCategories` (§6): percorre as categorias da geração ativa por id; pula as que já têm bloco ou não têm linha; converte até `maxCategories` (padrão 1) numa transação por categoria, na ordem que a leitura de linhas usava (`categoryPosition`, depois id), com `writeBlockWithin` (que apaga as linhas) e restaurando `itemsFetchedAt` (converter não é renovar); devolve `true` se sobrou categoria. Ganhou um `onConverted` opcional (aditivo; o contrato não o usa): a pré-carga avisa a tela (`onCategoryDone`) porque os ids mudam (R-003). `prefetch/index.ts`: `housekeeping` converte 1 categoria por chamada e só depois limpa gerações; enquanto houver o que converter devolve `true` e o agendador chama de novo (mesmo portão: 2 s sem tecla, sem player, visível, online).
- Contrato: `npx vitest run src/lib/catalog/categoryBlocks.catalogo-em-blocos.contract.test.ts` → 5/5 verdes; `check-contract-tests.ps1 -Slug 039-catalogo-em-blocos` → trava íntegra.
- Testes executados: `npx vitest run src/lib/catalog/categoryBlocks.test.ts src/lib/catalog/prefetch` → 21/21 (novos: conversão interrompida na 2ª categoria — transação desfeita, linhas intactas, retomada sem duplicar, categoria `eager` convertida, `itemsFetchedAt` preservado; categoria guardada e nunca aberta não conta como pendente); `npx vitest run src/lib/catalog src/features/catalog` → 427/435 (as 8 falhas são os contratos já vermelhos de 034/036); `npx tsc -b` limpo; `node e2e/catalogo-em-blocos.mjs` (cenário 2, dev server em :5173) → 10/10, duas rodadas seguidas.
- Pendências: A2 do Analyze continua — no navegador o formato antigo é semeado pelo script; a prova real (build anterior instalado, usado, e este por cima) é na TV (T026).

---

## Phase 4: User Stories 1 e 2 — medir abrir categoria e catálogo pronto (Priority: P1)

- [X] T015 [US1] E2E `e2e/catalogo-em-blocos.mjs` cenário 1: lista nova → `channels` só com episódios; abrir categoria, "Todos", busca, ★, ↺, detalhe e tocar (painel falso)
- [X] T016 [US1/US2] Probe com a lista real (`carga-listas-real.mjs`/probe de seção da 038), CPU 4×: tempo até tudo pronto, abrir a categoria de 11 mil filmes, "Todos" de Filmes; registrar em `plan.md` R-002
- [X] T017 [US2] Se o tempo total não melhorar com os blocos, investigar o gargalo restante (mapear itens no Worker, assinatura) — task ad-hoc com a medição
- [X] T028 [US1] (ad-hoc, descoberta na T016/T017 — R-009, opção 1 escolhida pelo usuário em 2026-09-30) Reduzir o custo de abrir uma categoria muito grande (meta: 11 mil filmes ≤ 300 ms no PC, build de produção, CPU 4×): leitura direta do bloco pelo id da categoria com uma conversão por item (sem `categoriesAtOrder`, `blockRecord`, sort e slice); leitura iniciada no OK, em paralelo com a renderização; depois, o custo de renderização que cresce com o nº de itens. Medir cada passo com `e2e/catalogo-em-blocos-real.mjs`.

**Critério de Conclusão**: medições registradas; E2E cenário 1 verde.

**Registro da Fase**:

- Status: Concluída (2026-09-30).
- Feito: cenário 1 no `e2e/catalogo-em-blocos.mjs` (painel falso ganhou `get_series_info`): lista nova toda em blocos e `channels` sem item de categoria; abrir categoria na ordem da fonte, busca dentro dela, detalhe, "Minha Lista", tocar e sair com progresso ("Continuar"), "Todos" (6 filmes de 2 categorias), ↺ Histórico, ★ Favoritos → detalhe, e detalhe de série obtendo episódios (`channels` = só os 2 episódios). Probe novo `e2e/catalogo-em-blocos-real.mjs` (fora do `test:e2e`; lê o `.env`, imprime só números): CPU N× por CDP, `CCPLAY_APP_URL` para medir o build de produção (`vite preview`), `CCPLAY_PROFILE=1` para perfil de CPU da maior categoria; para na hora se a importação mostra "Falhou". T017: o tempo total **melhorou** (catálogo inteiro 17,1 s na 038 → 9,5 s), então a condição da task não se cumpriu; o perfil da entrada na categoria de 11 mil foi registrado mesmo assim (R-009).
- Contrato: `npx vitest run src/lib/catalog/categoryBlocks.catalogo-em-blocos.contract.test.ts` → 5/5 verdes; `check-contract-tests.ps1 -Slug 039-catalogo-em-blocos` → trava íntegra.
- Testes executados: `node e2e/catalogo-em-blocos.mjs` (dev server em :5173) → cenários 1+2, 27/27, duas rodadas seguidas (a 1ª tentativa travou no `page.goto`: `page.route('**/series/**')` capturava os módulos do Vite em `src/features/series/` — restrito ao host do painel); `npx oxlint` nos dois scripts → limpo. Medições (lista real): build de produção CPU 4× (2 rodadas) — catálogo inteiro pronto 9,5–9,6 s; categoria de 11.131 filmes 653–907 ms; outras de filmes (1.919–3.461) 191–413 ms; canais (122–550) 142–260 ms; "Todos" de Filmes (31.407) 939–1.073 ms. Produção CPU 1×: 11.131 filmes 102 ms, "Todos" 226 ms. Dev server CPU 4× (React em modo dev, só referência): 11.131 filmes 1,2–1,5 s, "Todos" 1,3–1,8 s.
- Pendências: **SC-001 não bate no PC com CPU 4×** para a categoria de 11 mil (653–907 ms contra ≤ 300 ms) e SC-003 está no limite (939–1.073 ms contra ≤ 1 s) — R-009; o usuário escolheu atacar agora (T028). O painel real recusou 2 de ~8 importações seguidas (limite de frequência, 038 R0-2) — o probe espera e repete.
- T028 (concluída, 2026-09-30 — **decisão do usuário: parar aqui e medir na TV**; o que resta, itens enxutos ou "cabeça" do bloco, só se o gate SC-007/T026 mostrar necessidade): **feito** — `getActiveCategoryBlock` (repositório, novo; API existente intacta) + `loadCategoryContent` lê o bloco pela chave e converte cada item uma vez (`blockItemOut`), sem `categoriesAtOrder`/`blockRecord`/sort/slice; reserva por `listChannels` quando não há bloco. Medido (produção, CPU 4×, maior categoria por último — sem o custo da 1ª montagem): 11.131 filmes **455–536 → 365–464 ms** (p50 371–438 entre rodadas). **Testado e descartado**: começar a leitura no OK (`prefetchQuery` antes do `setEntered`) — 404–486 ms, sem ganho (a leitura disputa a thread com a renderização); revertido. **Medido**: layout completo com a grade aberta ≈ 0,5 ms em qualquer categoria (não cresce com o nº de itens); o layout forçado na entrada é custo fixo da 1ª pintura; a 1ª entrada da sessão custa ~150 ms a mais em qualquer categoria. O que ainda cresce com o nº de itens é **desserializar o bloco** (IndexedDB): +~150 ms para 11 mil. Ler como uma string JSON só ganhou ~0–30 ms num microbenchmark (descartado). Próximo passo depende de decisão (mexe no formato): itens mais enxutos no bloco, ou uma "cabeça" do bloco para a 1ª pintura. Testes: `categoryBlocks.test.ts` (+2: `getActiveCategoryBlock`), `catalogApi.test.tsx` (+1: bloco lido direto = mesmos itens/ids de `listChannels`); `npx vitest run src/features/catalog src/lib src/features/vod src/features/movies src/features/series src/features/live` → 1252/1264 (9 contratos já vermelhos de 034/036 + 3 flakes conhecidos, 101/101 isolados); `npx tsc -b` e `oxlint` limpos; `node e2e/catalogo-em-blocos.mjs` verde; travas 039/038/025 íntegras.

---

## Phase 5: User Story 3 — listas agregadas (Priority: P2)

- [X] T018 [US3] "Todos"/busca (`catalogSearch.loadSearchIndex`, `globalSearch`): medir com 31 mil filmes; se > 1 s (CPU 4×), cachear o índice por sessão invalidado por `onCategoryDone` (R-002)
- [X] T019 [US3] `resolveContinueWatching`: resolver em lote por tipo (uma varredura por tipo, não uma por item)
- [X] T020 [US3] Teste de componente/E2E: ★ Favoritos, ↺ Histórico e Semelhantes mostram os mesmos itens antes/depois da conversão

**Critério de Conclusão**: SC-003 medido no PC (CPU 4×); T020 verde.

**Registro da Fase**:

- Status: Concluída (2026-09-30).
- Feito: T018 — perfil da entrada em "Todos" (`CCPLAY_PROFILE_ALL=1`) mostrou ~150 ms normalizando os 31 mil nomes em `buildSearchIndex`, campo que ninguém lê: o índice passou a normalizar **sob demanda** (`LazySearchIndexEntry`, mesma interface `SearchIndexEntry`, agora `readonly`). A busca por tecla (`searchWithinItems`) guarda o nome normalizado por item entre teclas (`WeakMap`, recalcula se o nome mudar) e ordena com um `Intl.Collator` único (mesma ordem de `localeCompare` sem argumentos). Com "Todos" abaixo de 1 s, o cache de índice por sessão **não foi necessário**. T019 — `resolveFavorites` virou casca de um núcleo `resolveStableIdsIn` (identidade → registro); `resolveContinueWatching` resolve **em lote por tipo** e as séries-pai numa passada só (`findSeriesManyIn`), mantendo a ordem de entrada. T020 — teste de integração `categoryBlocks.conversao-leitores.test.ts`: catálogo no formato antigo + favoritos/histórico/metadados; ★ (filme e série), ↺ (filmes e séries), Semelhantes (por identidade TMDB e por título + ano, com cobertura) antes × depois de `convertLegacyCategories` até o fim → iguais, e os ids novos resolvem por `getChannel`.
- Contrato: `npx vitest run src/lib/catalog/categoryBlocks.catalogo-em-blocos.contract.test.ts` → 5/5; travas 017/018/019/025/026/035/038/039 íntegras.
- Testes executados: `npx vitest run src/lib src/features/catalog src/features/home src/features/vod src/features/movies src/features/series src/features/live src/features/search` → 1302/1314 (12 = 9 contratos já vermelhos de 034/036 + 3 flakes conhecidos, 101/101 isolados); novos: `catalogSearch.test.ts` (+3: índice sob demanda, cache entre teclas e item renomeado, itens não-objeto), `categoryBlocks.test.ts` (+1: lote = 2 passadas por blocos em vez de 4), `categoryBlocks.conversao-leitores.test.ts` (1); `npx tsc -b` e `oxlint` limpos; E2E `catalogo-em-blocos`, `home-busca-configuracoes`, `historico-continuar-assistindo`, `busca-por-categoria` → verdes. Medido (lista real, produção, CPU 4×, 3 rodadas): "Todos" de Filmes **790–1.006 → 677–920 ms** (SC-003 ✅ no PC); busca por tecla em "Todos" 467–813 → 1ª tecla 553–625 ms, seguintes **172–271 ms**.
- Pendências: variação entre rodadas de ±150–300 ms nas medições do PC (uma rodada de "Todos" deu 1.138 ms antes do ajuste da busca) — a TV decide (T026). Observado, fora das tasks: `loadSeriesHistory` (`history.ts`) ainda resolve episódio e série um por vez (mesmo padrão que a T019 tirou de "Continuar assistindo") — não medido; registrado em R-010.

---

## Phase 6: User Story 5 — lista enorme sem fechar (Priority: P2)

- [X] T021 [US5] `e2e/catalogo-em-blocos.mjs` cenário 3: painel falso gerando ~300 mil itens (seção de filmes); medir heap (CDP `Performance.getMetrics`) durante a carga e em "Todos"; registrar em R-005
- [X] T022 [US5] Se o heap passar do orçamento (a definir pela medição; referência: ~278 MB livres num aparelho webOS pesquisado), reduzir o pico (busca em fluxo por blocos) — task ad-hoc

**Critério de Conclusão**: cenário 3 roda até o fim sem quebrar a página; pico registrado.

**Registro da Fase**:

- Status: Concluída (2026-09-30). T022 resolvida pela **opção escolhida pelo usuário: "Todos" carrega aos poucos conforme a pessoa desce** (variante simples: ordenar e buscar leem o tipo inteiro), em vez de fixar um orçamento e reduzir cópias.
- T022 — feito: `readKindPage` (repositório, novo): a partir de um cursor de categoria, na ordem de `order` (a mesma de `listAllOfKind`), lê categoria inteira por categoria (bloco, ou linhas se no formato antigo) até juntar o mínimo; concatenar as páginas = `listAllOfKind`. `useAggregatedItems` ganhou `{ progressive }` (aditivo — telas que não passam, TV ao vivo e Guia, e todos os testes que o simulam continuam iguais): `useInfiniteQuery` (`['catalog-all-pages', …]`, página mínima 240 itens), itens montados direto do bloco (`blockItemOut`), cobertura lida na 1ª página, `hasMore`/`loadMore`. `VodCatalogScreen` passa `progressive` quando "Todos" está na ordem da fonte e sem busca, e pede a próxima página a 10 fileiras do fim **ou enquanto o item a restaurar ainda não foi lido** (Voltar restaura foco). `prefetchApi` invalida `catalog-all-pages` quando uma categoria chega. Testes: `categoryBlocks.test.ts` (+2: páginas = `listAllOfKind` com blocos e linhas misturados, categorias nunca partidas; sem geração/episódio → vazio), `catalogApi.test.tsx` (+1: 1ª página, `loadMore`, mesmos ids e ordem do modo inteiro), `VodCatalogScreen.test.tsx` (+3: pede mais só a partir da fileira certa; busca aberta → tipo inteiro; restauração continua lendo até o item). Medido: estresse 300 mil (produção) — "Todos" **959 → 155 ms**, heap ao abrir **~217 → ~17 MB**, depois de descer 300 fileiras ~45 MB; lista real CPU 4× — "Todos" de Filmes **677–920 → 242–317 ms**. Custo novo: a 1ª tecla da busca em "Todos" passa a incluir a leitura do tipo inteiro (950–1.005 ms com CPU 4×; antes 553–625 ms) — na TV a leitura começa ao abrir o campo, antes da digitação pelo controle; teclas seguintes 154–378 ms. O Worker da carga (~123–132 MB para 300 mil) ficou como está (opção 2 não escolhida).
- Feito: cenário 3 em `e2e/catalogo-em-blocos.mjs`, fora da rodada padrão (`CCPLAY_E2E_ESTRESSE=1` roda os três; `=so`, só ele; `CCPLAY_E2E_ESTRESSE_POR_CATEGORIA` muda o tamanho; `CCPLAY_APP_URL` aponta para o build de produção). Painel falso com 30 categorias × 10 mil filmes no formato do `get_vod_streams` real (~300 B/item, intercalados, escritos em fluxo). Heap medido por CDP a cada 250 ms: página por `Runtime.getHeapUsage`; Worker anexando ao alvo pela sessão do navegador (`Target.attachToTarget`/`sendMessageToTarget` — a sessão da página não alcança o Worker). Confere: sem `crash`, 30/30 blocos com 300.000 itens, "Todos" abre, uma categoria de 10 mil abre depois.
- Contrato: sem contrato nesta fase; `check-contract-tests.ps1 -Slug 039-catalogo-em-blocos` → trava íntegra.
- Testes executados: `CCPLAY_APP_URL=http://localhost:4173 CCPLAY_E2E_ESTRESSE=so node e2e/catalogo-em-blocos.mjs` (build de produção, sem redução de CPU) → 30 mil: verde; **300 mil: verde** — carga 6 s; pico de heap na carga: **Worker ~123 MB** (`loadSection` guarda a seção inteira em `groups` antes de gravar) + página 46 MB; armazenamento ~13 MB (estimativa do navegador); "Todos" com 300 mil em 959 ms e pico de heap da página **~217 MB**; categoria de 10 mil em 54 ms. `node e2e/catalogo-em-blocos.mjs` (padrão) → cenários 1+2 verdes; `oxlint` limpo.
- Testes (T022): suítes `src/lib src/features/{catalog,home,vod,movies,series,live,search}` — numa rodada a máquina sobrecarregou (3 arquivos não iniciaram, "Failed to start forks worker"); em partes: só os 9 contratos já vermelhos de 034/036 e instáveis conhecidos (`LiveScreen*`, `*Screen.favorites`, `HomeContent` — todos verdes isolados, `LiveScreen*` 98/98); `npx tsc -b` limpo; `oxlint` sem erro (avisos pré-existentes); E2E `catalogo-em-blocos` (padrão e estresse), `busca-por-categoria`, `filmes-series-ds-v14`, `semelhantes-elenco-ator`, `home-busca-configuracoes` verdes; travas 018/024/025/026/031/038/039 íntegras.
- Pendências: a amostragem a cada 250 ms pode subestimar o pico do Worker (vive poucos segundos). A TV é quem mede a memória de verdade (SC-004 no gate T026). R-011: as opções de "Ordenar" em "Todos" aos poucos são calculadas sobre o que já foi lido.

---

## Phase 7: Polish & Cross-Cutting

- [X] T023 `tv-web/package.json`: `e2e/catalogo-em-blocos.mjs` no `test:e2e`
- [X] T024 `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build:tizen`, `npm run test:e2e` (dev server reiniciado)
- [X] T025 SC-006: `node e2e/paridade-limpeza.mjs` sem diferença visual
- [X] T026 Gate na TV física (SC-007): tabela do `quickstart.md`; fechar sem ele só com decisão explícita do usuário em Riscos
- [X] T027 Docs: `CLAUDE.md` (parágrafo da 039 e "Known deviation"), backlog via script

**Registro da Fase**:

- Status: Em andamento (2026-09-30) — T023, T024 e T027 feitas; T025 bloqueada por um defeito anterior à 039 no roteiro de paridade (decisão pedida ao usuário); T026 é o gate na TV.
- Feito: `test:e2e` termina com `node e2e/catalogo-em-blocos.mjs` (cenários 1+2; o 3 é opt-in). `CLAUDE.md`: parágrafo da 039 e nota em "Known deviation" (itens de categoria só pelo repositório, nunca `db.channels`). `paridade-limpeza.mjs` ganhou `CCPLAY_PARIDADE_DIR` (outra pasta de evidências, sem herdar a lista INTENTIONAL da 028).
- Contrato: `check-contract-tests.ps1` em **todas as 23 features com trava** → íntegras; contratos da 039 5/5 na suíte completa.
- Testes executados: `npx tsc -b` limpo; `npm run lint` sem erro (avisos pré-existentes); `npm run build:tizen` → sincronizado sem arquivo faltando no `tizen_web_project.yaml`; `npm run test` → 1968/1983 (15 = 10 contratos já vermelhos de 034/036 + 5 instáveis conhecidos `LiveScreen*`/`*Screen.favorites`; isolados verdes — o `LiveScreen.test` T010 falhou 1× em 3 sozinho e passou 4/4 no commit anterior e 4/4 de novo depois; a TV ao vivo não mudou nesta feature, `git diff` vazio em `src/features/live`); `npm run test:e2e` com o dev server reiniciado → **20/20 roteiros verdes**, saída 0. T025: `node e2e/paridade-limpeza.mjs antes` contra o código pré-039 (worktree em 06a2304) para no passo 10 — espera "Em breve" em "Integrações & BYOK", que virou tela real na 032; o roteiro já estava desatualizado antes desta feature.
- T025 (2026-09-30, usuário: "corrigir agora todos erros e bugs"): `paridade-limpeza.mjs` tinha dois defeitos anteriores à 039 — (1) o passo 10 abria "Integrações & BYOK" esperando "Em breve", tela real desde a 032 → agora abre "Player" (`ComingSoonPanel`); (2) a data da sincronização (gravada no Worker de importação) muda a largura da linha e desloca o vizinho mesmo mascarada → com `CCPLAY_PARIDADE_DIR`, relógio da página congelado, `.sources-panel-epg` mascarado e dígitos de largura fixa (`tabular-nums`) **só na captura**, nos textos mascarados. Linha de base "antes" = código pré-039 (06a2304) servido de uma worktree; "depois" = atual → **21/21 telas sem diferença fora do limiar de ruído** (`sdd/specs/039-catalogo-em-blocos/evidencias/paridade/`). Evidências da 028 intocadas.
- Testes instáveis antigos corrigidos (mesma autorização; fora do escopo original, R-012): os seis "segurar OK"/"Minha Lista" (`LiveScreen.favorites` b/l/n, `MoviesScreen.favorites`, `SeriesScreen.favorites`, `HomeContent`) procuravam o aviso de favorito sem esperar — ele só aparece depois da gravação (`useFavoriteToggle` → `mutateAsync`), e sob carga isso passa dos 850 ms do gesto → `waitFor` (o teste vizinho da tecla amarela já fazia assim). `LiveScreen.test` T010: "Test timed out in 5000ms" — levava 4,3–4,9 s **sozinho** já no commit anterior (colado no limite de 5 s; sem regressão desta feature), por apertar ↓ 200 vezes (~20 ms cada no jsdom) quando bastava sair da janela inicial (~14 canais). Agora desce 60 (mais de 4× a janela), confere antes que "Canal 60" não está desenhado (o teste continua provando que a janela se move) e tem limite de 10 s: ~1,7 s sozinho; 3,9–6,9 s com outra suíte disputando a CPU, 4/4 verdes. Nenhum arquivo de contrato travado foi tocado.
- Depois das correções: `npm run test` → **1973/1983**; as 10 falhas são só os contratos já vermelhos de 034/036 (features não executadas) — **nenhum instável** nesta rodada.
- T026 (2026-09-30): instalado na TV de referência (192.168.0.2, `deploy-tv.ps1`, por cima da versão anterior — IndexedDB preservado). **Visto pelo usuário**: "agora está muito mais rápido. Todos os canais, filmes e séries abriram corretamente." Não confirmados explicitamente pelo usuário: migração de um banco pré-039 (se a TV tinha dados do formato antigo antes desta instalação), tempos medidos (SC-001 ≤ 300 ms, SC-002 ≤ 60 s, SC-003 ≤ 1 s — só a percepção "muito mais rápido"), SC-004 (300 mil na TV, não executado) e SC-006 visual na TV (no PC: paridade 21/21).
- Pendências: o usuário pediu para fechar a feature (`sdd-converge`) com esse resultado. Incidente registrado: uma rodada do roteiro de paridade sem `CCPLAY_PARIDADE_DIR` gravou 7 capturas por cima das evidências "antes" da 028 — restauradas com `git checkout` na mesma hora (`git status` da pasta limpo).

### Checklist de Release

- [X] Fase 1 concluída
- [X] Fase 2 concluída
- [X] Fase 3 (US4) concluída
- [X] Fase 4 (US1/US2) concluída
- [X] Fase 5 (US3) concluída
- [X] Fase 6 (US5) concluída
- [X] 5/5 contratos da 039 verdes na suíte completa e `check-contract-tests.ps1 -Slug 039-catalogo-em-blocos` íntegro
- [X] Travas de 017/018/024/025/026/027/029/030/031/032/033/034/035/036/038 íntegras
- [X] `npm run test:e2e` verde
- [X] Gate SC-007 na TV (ou decisão explícita registrada) — passagem do usuário em 2026-09-30 (ver Registro da Fase 7); cenários não confirmados listados ali

---

## Dependencies & Execution Order

- Fase 1 → Fase 2 (bloqueante) → Fase 3 → Fases 4/5/6 (qualquer ordem) → Fase 7.
- A 038 precisa estar no código (pré-carga por seção, `renewCategoryItems`).

## Notes

- Nunca editar arquivos `*.contract.test.*`.
- Telas não mudam: se alguma precisar mudar, é sinal de que a API pública do repositório mudou (D-002) — parar e revisar.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->

## Phase 8: Convergence

Achados do `sdd-converge` (2026-09-30). CRITICAL/HIGH primeiro.

- [X] T029 [HIGH] (SC-007 → SC-001/SC-002/SC-003, US1/US2) Medir na TV com o build de medição da 038 (`VITE_CCPLAY_PERF=1`, painel `PerfOverlay`): OK → itens em 10 categorias prontas (incluindo a de 11 mil filmes), ressincronizar e cronometrar o catálogo inteiro pronto, abrir "Todos" de Filmes; registrar os números em `plan.md` (R-002/R-009). Se SC-001 não bater, retomar a opção 2 do R-009 ("cabeça" do bloco).
- [X] T030 [HIGH] (SC-005, US4, SC-007) Migração na TV: instalar o build pré-039 (commit 06a2304), carregar a lista, favoritar, assistir parte de um filme e de um episódio, marcar "assistido"; instalar o build atual por cima (sem desinstalar) e conferir conversão, ★ Favoritos, "Continuar assistindo", "assistido" e ↺ Histórico.
- [X] T031 [HIGH] (FR-013, US5) Catálogo inteiro na memória em três operações — busca global (`globalSearch.ts`, três tipos inteiros), ordenar/buscar em "Todos" (tipo inteiro, R-011) e `sectionLoader.ts` (seção inteira no Worker antes de gravar). Decisão do usuário: emendar FR-013 para o comportamento atual (via `sdd-specify`/`sdd-plan`, registrando o motivo) ou implementar (busca por blocos em fluxo; gravação por partes no Worker).
- [X] T032 [MEDIUM] (SC-004, US5, SC-007) 300 mil itens na TV: servir o painel falso de estresse do `e2e/catalogo-em-blocos.mjs` na LAN, cadastrar na TV, carregar e navegar ("Todos", busca) sem o app fechar.
- [X] T033 [LOW] (FR-007, R-011) Opções de "Ordenar" em "Todos" aos poucos calculadas sobre o tipo inteiro (varredura leve só de `year`/`addedAt` no repositório), para não esconder "Ano"/"Recém-adicionados" que antes apareciam.
- [X] T034 [LOW] (US3, R-010) `loadSeriesHistory` em lote (`resolveStableIdsIn`/`findSeriesManyIn`), como a T019 fez em "Continuar assistindo".

**Registro da Fase**:

- Status: Em andamento (2026-09-30) — T031, T033, T034 feitas; T029, T030 (TV, próximas) e T032 abertas. Escolhas do usuário: emendar FR-013 para busca/ordenação e implementar o Worker; TV na ordem medição → migração; commits por fase (feitos: `a075488`…`0b64b4b`).
- Feito: T031 — FR-013 emendado na spec (busca global e buscar/ordenar em "Todos" como exceção pedida pela pessoa); Worker da carga por seção descarrega numa área de preparo (Dexie v15 `sectionStaging`, a cada 20 mil itens) e grava uma categoria por vez; `readJsonArrayStream` ganhou `afterChunk` (aditivo); sobra de carga interrompida apagada no começo da próxima e em falha; `deleteAllForSource` limpa o preparo. T033 — `kindSortFields` (um bloco por vez, para ao achar ano e data) + `useKindSortFields`, só com o modal "Ordenar" aberto em "Todos" aos poucos; opções = união com as dos itens lidos (nenhuma some). T034 — `resolveStableIds` (público) e `loadSeriesHistory` em duas passadas, mesma ordem e mesma contagem de não resolvidos.
- Contrato: `npx vitest run src/lib/catalog/categoryBlocks.catalogo-em-blocos.contract.test.ts` → 5/5; trava íntegra.
- Testes executados: `sectionLoader.test.ts` 8/8 (+3: preparo a cada 2 itens = mesmo resultado e sem sobra; sobra de carga interrompida não entra; falha no meio do fluxo apaga o preparo e não grava pela metade); `categoryBlocks.test.ts` 15/15 (+2: `kindSortFields`; ↺ de Séries em 1 passada); `VodCatalogScreen.test.tsx` (+1: "Ano" no modal vindo de categoria não lida); `npx tsc -b` limpo; `oxlint` sem erro; `build:tizen` sincronizado. Estresse 300 mil (produção, 2 rodadas): pico do Worker **50–70 MB** (antes ~123–132), carga 10 s (antes 5–6 s), "Todos" 84 ms. Lista real CPU 4×, importação nova: catálogo inteiro 9,7–12,8 s (antes 9,5–14 s); "Todos" 344–382 ms.
- T029 (2026-09-30, TV de referência, build de medição `VITE_CCPLAY_PERF=1`, visto e relatado pelo usuário com fotos do painel): entrada em categorias de Filmes já no aparelho, **incluindo a de 11 mil**: OK → primeiro quadro **24 ms e 56 ms** (`start=0 first=24/56`); ressincronizar → "Catálogo atualizado" **em até 60 s** (usuário, sem número exato); "Todos" de Filmes **em até ~1 s** (usuário). Ressalvas: (1) as duas entradas não têm `read` — a categoria já estava no cache de memória pela pré-busca de 300 ms do foco (feature 010), que é o uso normal com o controle; a leitura "fria" (OK sem nenhuma pausa no cursor) não foi capturada na TV (PC, CPU 4×: 365–464 ms); (2) uma primeira passada mostrou a categoria de 11 mil **ainda não estava no aparelho** (`reque=0 mappe=2937 first=5010`: buscada da rede, 5,0 s) — entrou antes de a pré-carga terminar, comportamento esperado da 038; (3) o painel tinha um defeito (a marca `start` não recomeçava um registro de busca em segundo plano antigo — `start=240247`), corrigido em `entryTiming.ts` (+1 teste) antes da segunda passada.
- T030 (2026-09-30): **não executado na TV, por decisão explícita do usuário** — testar exigia desinstalar o app (o build pré-039 não abre o banco v15 já presente na TV), o que apagaria lista, favoritos, progresso, histórico e chave TMDB. SC-005 fica provado só no navegador: `e2e/catalogo-em-blocos.mjs` cenário 2 (formato antigo semeado no IndexedDB do app → blocos, mesmos itens/ordem, favorito e progresso intactos) e `categoryBlocks.conversao-leitores.test.ts` (★/↺/Semelhantes iguais antes × depois).
- T032 (2026-09-30): **não executado na TV, por escolha do usuário** (ordem "medição, depois migração", sem os 300 mil). SC-004 provado só no navegador do PC: 300 mil filmes sem quebrar, Worker 50–70 MB, "Todos" ~17–32 MB.
- Pendências: nenhuma task aberta; SC-004/SC-005 sem prova na TV, registrados acima como decisão do usuário.
