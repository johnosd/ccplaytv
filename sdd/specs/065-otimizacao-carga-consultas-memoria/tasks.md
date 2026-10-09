# Tasks: Otimização de carga, consultas externas, memória e abertura do app

**Input**: sdd/specs/065-otimizacao-carga-consultas-memoria/
**Prerequisites**: spec.md, plan.md, research.md, data-model.md, contracts/client.md, logic/*.md e quickstart.md.
**Organization**: baseline primeiro; US1/US2 P1, US3/US4 P2, US5 P3; Polish valida a feature inteira.

## Format

[ID] [P?] [Story] descrição com caminho e rastreabilidade. [P] indica somente independência de arquivo/dependência; não autoriza delegar agentes. Contratos já existem e estão travados: não há task para escrevê-los.

## Path Conventions

- Frontend ativo em tv-web/src/; telas em features/, leitores em lib/catalog/ pela fachada catalogRepository.
- Testes colocados junto ao assunto; .ts node/fake-indexeddb e .tsx dom. Novo .ts com DOM entra em TESTES_TS_COM_DOM se necessário.
- Runners/fixtures/resultados em tv-web/scripts/bench/, tv-web/e2e/fixtures/ e tv-web/bench-results/; não entram no pacote normal.
- Pacote real em CCPlayTv/ e YAML; backend api/ não participa. Arquivos novos são explicitamente descritos como criar/adicionar.
- Releia arquivos alterados por outras sessões antes da task; não reverter alterações prévias, não ampliar tetos da catraca.

## Phase 1: Setup e baseline pareada

**Objetivo**: Preparar instrumentos e congelar a referência antes de alterar comportamento.

### Implementation

- [x] T001 [P] Criar fixtures determinísticas (43k/10k, elegibilidade, categoria 30k, episódios, favoritos/histórico e três listas) em tv-web/scripts/bench/screenFixtures.mjs e imagens locais em tv-web/e2e/fixtures/screen-perf/; fixar relógio e valores sintéticos. (FR-025, SC-001–SC-013)
- [x] T002 Criar run-screen-perf.mjs, screenInstrumentation.mjs e adapter de controle isolado em tv-web/src/bench/screenControl.ts para build/servidor efêmero, conteúdo/foco, leituras, heap, abertura/bytes e conclusão pelo scheduler real; seguir logic/abertura-benchmark.md, sem chamar invalidação manual nem entrar no pacote normal. (FR-025, SC-002–SC-012)
- [x] T003 Criar compare-screen-perf.mjs e captura de equivalência em tv-web/scripts/bench/; salvar fingerprint e ≥7 amostras por configuração em tv-web/bench-results/screen-perf-065/baseline/<run-id>/, antes das próximas fases, sem benchmarks concorrentes. (FR-001–FR-003, FR-025, SC-001–SC-013)
- [x] T004 Registrar baseline, custo de preparação/migração e roteiro de comparação em sdd/specs/065-otimizacao-carga-consultas-memoria/quickstart.md e tv-web/bench-results/screen-perf-065/baseline/<run-id>/report.md; nunca substituir por review-screen-perf de três runs. (FR-025–FR-026, SC-013)

### Testes da Fase

- [x] T005 [P] Testar fórmulas, falta de amostra, ambiente/fixture incompatível e denominador zero em tv-web/scripts/bench/compare-screen-perf.test.mjs; verificar isolamento de dados e que instrumentação não emite segredo. (FR-014, FR-025, SC-013)

**Critério de Conclusão**: Baseline imutável identificada, fixtures/instrumentação reproduzíveis e testes do comparador verdes. Não há otimização aprovada nesta fase; todos os cinco contratos futuros continuam vermelhos esperados.

**Registro da Fase**:

- Status: Concluída em 2026-10-08; T001–T005 verificadas.
- Feito: Fixtures/harness/comparador isolados; baseline/run-002 full congelada com 70 amostras, sete por configuração, sem erros. Conteúdo/seleção/foco/rolagem consistentes nas sete repetições; fingerprint atual conferido antes de otimizar. Custos/dispersão/limitações publicados no report original e quickstart.
- Contrato: Sem contrato nesta fase. `check-contract-tests.ps1 -Slug '065-otimizacao-carga-consultas-memoria' -Json` → trava íntegra, 5/5. Os cinco contratos de fases futuras permanecem vermelhos esperados.
- Testes executados: `npm run test -- scripts/bench/screenFixtures.test.mjs scripts/bench/compare-screen-perf.test.mjs scripts/bench/screenInstrumentation.test.mjs src/bench/screenFixtureEvents.test.ts` → 11/11 verdes; `npx tsc -b --pretty false`, `npm run lint` e `npm run build` passaram antes da captura. `run-screen-perf --mode baseline --suite full --cpu 4 --repeat 7` → 70/70, exit 0; `loadArtifact`/`validateArtifact` → PASS. A fixture de datas precisou de correção inline; run-001 foi rejeitada e preservada, sem misturar amostras.
- Pendências: Nenhum ganho aprovado nesta fase; US1–US5 e gates finais pendentes. A baseline não mede importação/conversão legada nem RAM física. TV recomendada/pendente.

## Phase 2: US1 — consultas externas (P1)

**Objetivo**: Encerrar consultas corretamente, preservar cache válido e compartilhar trabalho sem corridas.

### Contrato da Fase

Origem/nome integral e falha confirmada em plan.md → Testes de Contrato; arquivos travados em contract-tests.lock.

Comando (tv-web/):

~~~powershell
npm run test -- src/lib/metadata/externalQueries.otimizacao-carga-consultas-memoria.contract.test.ts
~~~

### Implementation

- [x] T006 [US1] Implementar deadline/AbortController abrangendo fetch e corpo em tv-web/src/lib/metadata/tmdbConnector.ts e helper novo requestDeadline.ts, conforme logic/consultas.md; limitar detalhes Xtream em titleMetadata.ts sem alterar importação/EPG/player. (FR-008, FR-014, SC-008) → contrato: prazo inclui rede e corpo
- [x] T007 [US1] Implementar Retry-After e mutação condicional de pausa/revisão em tv-web/src/lib/metadata/tmdbKeyRepository.ts e db.ts; preservar fallback vigente de 10 minutos e pausa após sucesso concorrente. (FR-010, FR-014, SC-008) → contrato: 429 parcial preserva cache
- [x] T008 [US1] Corrigir lotes/publicação atômica e fallback de descoberta em tv-web/src/lib/metadata/tmdbDiscovery.ts; nenhuma página necessária pode falhar e renovar o cache. (FR-009–FR-011, FR-013, SC-008–SC-009) → contrato: 429 parcial preserva cache
- [x] T009 [US1] Criar tv-web/src/lib/metadata/sharedAttempt.ts e integrar leases/contexto em tmdbDiscovery.ts, titleMetadata.ts e types.ts; remover tentativa por identidade e conferir revisão antes de persistir. (FR-007, FR-012–FR-014, SC-009)
- [x] T010 [US1] Propagar signal/liberação de consumidor nos hooks de tv-web/src/features/catalog/catalogApi.ts, incluindo o useTitleMetadata definido nesse arquivo, mantendo APIs públicas e sem nova consulta por foco. Extrair novo discoveryApi.ts se necessário para respeitar a catraca. (FR-002–FR-003, FR-012–FR-014, SC-001, SC-009)
- [x] T011 [US1] Executar casos controlados de chamadas/pausa/retentativa pelo runner tv-web/scripts/bench/run-screen-perf.mjs e registrar resultados US1 em candidate/<run-id>/report.md. (FR-025, SC-008–SC-009)

### Testes da Fase

- [x] T012 [P] [US1] Cobrir corpo pendente, JSON inválido, 401/404/5xx, Retry-After numérico/data e sem cache em tmdbConnector.test.ts, tmdbDiscovery.test.ts e tmdbKeyRepository.test.ts; sem editar contratos travados. (FR-008–FR-011, SC-008)
- [x] T013 [P] [US1] Cobrir dois consumidores, último cancelamento, chave/idioma/lista trocados e chegada antiga em novos sharedAttempt.test.ts e titleMetadata.otimizacao.test.ts e componentes de integração existentes. (FR-001–FR-003, FR-007, FR-012–FR-014, SC-001, SC-009)
- [x] T014 [US1] Rodar testes da área e o contrato externo 2/2, integridade da trava, lint e tipos; registrar os comandos em plan.md Execution Notes no checkpoint. (FR-025–FR-026, SC-013)

**Critério de Conclusão**: Comando do contrato externo → 2/2 verdes e check-contract-tests.ps1 íntegro; testes da área e tipos/lint passam. SC-008/009 demonstrados, sem bloquear catálogo local. Contratos US2/US3 permanecem pendentes.

**Registro da Fase**:

- Status: Concluída em 2026-10-08; T006–T014 verificadas.
- Feito: `requestDeadline.ts` controla prazo de 10 s, aborta transporte e cobre `response.json()`; `tmdbGet` mantém API pública e erros sanitizados. `Retry-After` numérico/data e pausa condicional foram implementados. Descoberta publica somente lotes completos e retorna cache stale sem avançar após falha. `sharedAttempt` usa leases por banco/chave, revisão opaca impede persistência de autenticação antiga e sinais dos hooks de metadata/discovery liberam consumidores individuais.
- Contrato: `npm run test -- src/lib/metadata/externalQueries.otimizacao-carga-consultas-memoria.contract.test.ts` → 2/2 verdes; `check-contract-tests.ps1` → trava íntegra 5/5.
- Testes executados: conector/descoberta/chave/title metadata + contrato → 64/64 verdes no conjunto focado; fault probe → 2/2; sharedAttempt/titleMetadata adicional → 49/49; `npx tsc -b --pretty false` → PASS; `npm run lint` → PASS com avisos preexistentes e catraca 338/145/37.
- Pendências: US2–US5, benchmark candidato e gates finais; a validação física em TV continua recomendada/pendente.

## Phase 3: US2 — carga e atualização das vitrines (P1)

**Objetivo**: Reduzir CPU/bloqueio e invalidar somente o contexto afetado sem alterar seleção.

### Contrato da Fase

Origem/nome integral e falha confirmada em plan.md → Testes de Contrato; arquivos travados em contract-tests.lock.

Comando (tv-web/):

~~~powershell
npm run test -- src/features/catalog/prefetchApi.otimizacao-carga-consultas-memoria.contract.test.ts src/features/vod/ratedSelectionAsync.otimizacao-carga-consultas-memoria.contract.test.ts
~~~

### Implementation

- [x] T015 [US2] Otimizar selectFeaturedRated em tv-web/src/features/vod/ratedSelection.ts e implementar stub ratedSelectionAsync.ts com deduplicação global, top-K estável, normalização equivalente e pausas; seguir logic/catalogo.md. (FR-001, FR-006, SC-001, SC-003) → contrato: seleção cooperativa mantém desempates
- [x] T016 [US2] Adicionar tv-web/src/lib/catalog/catalogDerivedRows.ts e leitores iteráveis pela fachada catalogRepository.ts; produzir seleções/correspondências pequenas sem carregar listAllOfKind para vitrines. Antes da US3, ler blocos um por vez. (FR-003, FR-006–FR-007, FR-015, SC-002–SC-003)
- [x] T017 [US2] Extrair showcaseApi.ts de tv-web/src/features/catalog/catalogApi.ts com reexports compatíveis, resultados pequenos/contexto por geração/dia/idioma e cancelamento de cálculo obsoleto. (FR-001–FR-003, FR-006–FR-007, SC-001–SC-003)
- [x] T018 [US2] Aplicar kind/revisão e delta por categoria em tv-web/src/features/catalog/prefetchApi.ts, lib/catalog/prefetch/index.ts, prefetchScheduler.ts e loaders; atualizar também entrada direta, conversão e carga por seção. Conservar batch de 1 s e geração no mesmo caminho. (FR-004–FR-007, SC-004) → contrato: conclusão de filmes atualiza filmes
- [x] T019 [US2] Reconciliar respostas/resultados e foco por id nos consumidores tv-web/src/features/vod/VodShowcaseScreen.tsx e features/home/HomeContent.tsx sem mudar layout/seleção; medir fluxo de três conclusões reais e carga fria/quente. (FR-001–FR-007, SC-001–SC-004)

### Testes da Fase

- [x] T020 [P] [US2] Adicionar equivalência ampla de seleção/normalização nos testes ratedSelection.test.ts e ratedSelectionAsync.test.ts; cobrir duplicatas, empates, fallback, datas, cancelamento e entrada imutável. (FR-001, FR-006–FR-007, SC-001, SC-003)
- [x] T021 [P] [US2] Cobrir eventos reais, categorias de tipos distintos, revisão obsoleta e alteração no mesmo caminho em prefetchApi.test.ts, prefetchScheduler.test.ts e catalogApi.vitrine-cache.test.tsx; comparar todos os writers. (FR-004–FR-007, SC-004)
- [ ] T022 [US2] Rodar os dois contratos locais, testes da área, trava e gates; usar runners pareados para SC-002/003/004 e registrar amostras/equivalência no relatório da fase. (FR-025–FR-026, SC-001–SC-004, SC-013)

**Critério de Conclusão**: Comando dos dois contratos locais → 2/2 verdes e trava íntegra; equivalência, carga/CPU/eventos reais e limite de propagação passam para US2. Não reduzir conteúdo para fechar percentuais.

**Registro da Fase**:

- Status: Implementação concluída (T015–T021); T022 aberta até a matriz pareada final.
- Feito: Seleção incremental (deduplicação global/top-K estável) sem cache de títulos — o cache FIFO de 16k entradas dobrava o custo com 43k títulos distintos (achado na revisão da T047, T049). As vitrines (`useRecentlyAdded`/`useTopRated`) deixaram de montar o índice do tipo inteiro: uma passada bloco a bloco, cedendo a thread por `MessageChannel`, retém só os 12 recentes e os candidatos de Bem avaliados (T050). Pré-carga invalida por tipo/categoria. T019: o foco já é reconciliado por id (`reconcileShowcaseFocus`, contrato da 053) e as três conclusões reais foram medidas nos diagnósticos `postfix-*`, com cards/foco/rolagem iguais à baseline.
- Contrato: `npm run test -- src/features/catalog/prefetchApi.otimizacao-carga-consultas-memoria.contract.test.ts src/features/vod/ratedSelectionAsync.otimizacao-carga-consultas-memoria.contract.test.ts` → 2/2; trava íntegra 5/5.
- Testes executados: `npx vitest run src/lib/catalog src/features/catalog` → 642/642; `npx vitest related --run` sobre catalogApi/vodShowcase/ratedSelection/rotas → verdes após ajustar dois testes não travados que contavam `loadSearchIndex` (detalhe de implementação substituído). Diagnóstico `diagnostic/postfix-batches-local100` (3 amostras, `screens-local-100-no-images`) contra baseline/run-002: Filmes após Home 1.458 → 411 ms; maior tarefa 1.061 → 125 ms; Filmes índice frio 250 → 205 ms; seleção 678 → 209 ms; soma de tarefas nos eventos 2.984 → 0 ms; heap retido 23,6 → 10,9 MB; propagação 0,85–1,76 s; Home fria +6,8%; equivalência e ids da seleção iguais.
- Pendências: T022 depende da matriz pareada final. "Filmes com índice frio" fica em −18% (meta −30%): o marco útil é dominado pela primeira renderização da vitrine (~159 ms), não pela leitura. Amostras de 3 são diagnóstico, não aceite.

## Phase 4: US3 — janelas e memória (P2)

**Objetivo**: Limitar leituras/retensão sem limitar conteúdo, histórico ou retorno.

### Contrato da Fase

Origem/nome integral e falha confirmada em plan.md → Testes de Contrato; arquivos travados em contract-tests.lock.

Comando (tv-web/):

~~~powershell
npm run test -- src/lib/catalog/repository/categoryWindow.otimizacao-carga-consultas-memoria.contract.test.ts
~~~

### Implementation

- [x] T023 [US3] Adicionar schema/tipos de catalogReadManifests/catalogReadChunks em tv-web/src/lib/catalog/db.ts e implementar repository/readProjection.ts e stub categoryWindow.ts; reexportar na fachada. Preparação idempotente/por revisão, campos compactos e janelas conforme data-model.md e logic/catalogo.md. (FR-001, FR-015–FR-016, FR-018, SC-005, SC-007) → contrato: janela preparada mantém ids
- [x] T024 [US3] Integrar preparação/invalidação/limpeza aos writers tv-web/src/lib/catalog/categoryBlocks.ts, repository/categoryItems.ts, repository/generations.ts, repository/structureRefresh.ts, sourceRepository.ts e conversão/Worker. Preservar canônico em quota/abort e não publicar projeção velha. (FR-007, FR-015, FR-018, SC-006–SC-007)
- [x] T025 [US3] Implementar cache limitado por itens/chunks e contexto em blockMemo.ts e novo readProjectionMemo.ts; tirar índices completos das vitrines e limitar compactos em catalogSearch.ts e showcaseApi.ts. (FR-006–FR-007, FR-015, SC-005–SC-006)
- [x] T026 [US3] Adicionar cursor categoria+offset+revisão em repository/kindReads.ts via API nova mantendo readKindPage legado; extrair categoryWindowApi.ts e adaptar grades em VodCategoryScreen.tsx e LiveScreen.tsx somente onde usam acumulação, com id/scroll/índice lógico. (FR-002, FR-015–FR-016, FR-018, SC-001, SC-007)
- [x] T027 [US3] Garantir busca/ordenação integral antes da janela em catalogSearch.ts, catalogApi.ts e leitores de categoria; consumir projeções sem reidratar todas as obras. Atualizar prévias para janela de 12. (FR-001, FR-006–FR-007, FR-016, FR-018, SC-001, SC-007)
- [x] T028 [US3] Separar resumo/contagem de histórico dos objetos em novo features/catalog/historyApi.ts e lib/catalog/history.ts, mantendo fachada catalogApi.ts; paginar histórico/favoritos, expirar payload sem consumidor e preservar contadores/estado lógico. (FR-002, FR-015, FR-017–FR-018, SC-005–SC-006)
- [x] T029 [US3] Aplicar limites de caches derivados por contexto e arte em tv-web/src/features/vod/useCoverColor.ts e features/catalog/showcaseApi.ts; executar ciclos/alternâncias com imagens, quota e conversão e registrar heap/picos/Worker/disco. (FR-014–FR-018, FR-025, SC-005–SC-007)

### Testes da Fase

- [x] T030 [P] [US3] Adicionar testes de revisão, legado, janela final, fonte removida, conversão interrompida/quota e limpeza em repository/categoryWindow.test.ts, readProjection.test.ts, blockMemo.test.ts e db.test.ts. (FR-007, FR-015–FR-018, SC-006–SC-007)
- [x] T031 [P] [US3] Cobrir histórico/favoritos/contadores após GC e RETURN por id após recarga em catalogApi.history-cache.test.tsx e VodCategoryScreen.window.test.tsx; buscar e ordenar até último item, não só primeira página. (FR-001–FR-002, FR-016–FR-018, SC-001, SC-007)
- [x] T032 [US3] Rodar contrato da janela 1/1, contratos/área antigos, trava, gates e benchmarks de heap/categoria/ciclos; medir também custo de importação/categoria/projeção e registrar qualquer regressão. (FR-025–FR-026, SC-005–SC-007, SC-013)

**Critério de Conclusão**: Comando do contrato de janela → 1/1 verde e trava íntegra; SC-005/006/007 e equivalência/RETURN passam, incluindo leitura fria e custo inicial de conversão reportados. Nenhum catálogo/userState apagado por cache limitado.

**Registro da Fase**:

- Status: Concluída — T023–T032 verificadas.
- Feito: Projeção por revisão integrada aos writers/conversão/publicação; memoização limitada a dois mil itens de blocos e oito chunks de projeção por contexto; índice de busca retém somente campos compactos e vitrines expiram consultas sem observador. Cursor por categoria/offset/revisão mantém `readKindPage` legado e alimenta a paginação progressiva de Todos; busca/ordenação continuam no conjunto completo compacto e prévias usam janela de 12. Histórico/favoritos ganharam facade e leitores por páginas de 240, enquanto contagem permanece em `useHistorySummary`; payloads sem consumidor expiram em 30 s. Cores de capa têm LRU de 256 entradas; prévias e backdrops usam GC de 30 s, preservando alternâncias e sem URLs de playback no cache derivado. Testes adicionais cobrem legado, revisão, geração inativa, quota, fonte removida, janela final, limpeza de caches, reidratação após GC, busca até o último item e RETURN por id.
- Contrato: `npm run test -- src/lib/catalog/repository/categoryWindow.otimizacao-carga-consultas-memoria.contract.test.ts` → 1/1; `check-contract-tests.ps1 -Slug 065-otimizacao-carga-consultas-memoria -Json` → trava íntegra (5/5).
- Testes executados: suíte focada T024/T025 → 11 arquivos, 52/52; cursor/grades → 17 testes; paginação de histórico/favoritos → 2/2; T029 (cores, Home e vitrine) → 17/17; T030 (projeção, janela, memo e banco) → 30/30; type-check, architecture e oxlint focado PASS. Os artefatos diagnósticos existentes registram heap/ciclos/Worker/disco; a comparação pareada formal continua em T032.
- Benchmarks diagnósticos: `diagnostic/t032-cycles-local` (heap retido 23,62 MiB, 10 ciclos de navegação + 10 alternâncias, 0 Worker), `diagnostic/t032-category-30000` (categoria 30k em 497,80 ms, pico 8,05 MiB, heap retido 15,32 MiB, 0 Worker) e `diagnostic/t032-episodes-100000` (100k episódios; resumo inicial 804,10 ms, reentrada 85,10 ms, delta 96,10 ms, heap retido 6,72 MiB, 0 Worker). São amostras únicas de diagnóstico, não substituem o comparador pareado final; custo de seed/projeção permanece registrado no JSON e não foi confundido com importação.

## Phase 5: US4 — resumos incrementais de séries (P2)

**Objetivo**: Reaproveitar resumo válido e atualizar somente séries afetadas.

### Implementation

- [x] T033 [US4] Adicionar membros/resumos e índices do data-model.md em tv-web/src/lib/catalog/db.ts e novo seriesWatchRepository.ts; mover o helper puro de features/series/seriesWatchedSummary.ts para lib/catalog/seriesWatchedSummary.ts com reexport compatível no caminho antigo, sem lib→features. Backfill fora do upgrade e mesma semântica. (FR-019–FR-020, SC-010)
- [x] T034 [US4] Integrar revisão de episódios e estado em repository/series.ts, userStateRepository.ts e caminhos de publicação/remoção de fonte; localizar todas as séries afetadas por stableId sem varredura global. (FR-001, FR-017–FR-020, SC-001, SC-010)
- [x] T035 [US4] Extrair features/catalog/seriesSummaryApi.ts com facade catalogApi.ts e carregar somente resumos válidos; não chamar ensureSeriesEpisodes/rede para selos. (FR-003, FR-019–FR-020, SC-010)

### Testes da Fase

- [x] T036 [P] [US4] Comparar resumos ao helper atual, id duplicado/multiplicidade, geração, quota, catálogo novo e alteração de episódio em seriesWatchRepository.test.ts e catalogApi.series-summary.test.tsx. (FR-019–FR-020, SC-010)
- [x] T037 [US4] Rodar testes da área, tipos/lint e benchmark de 100k episódios: zero varredura na reentrada e zero varredura de outras séries no delta; publicar leituras/equivalência. (FR-019–FR-020, FR-025, SC-010, SC-013)

**Critério de Conclusão**: Testes complementares verdes, SC-010 demonstrado com contadores/leituras reais, e estado lógico/equivalência intactos; sem novo contrato por orçamento de cinco.

**Registro da Fase**:

- Status: Concluída — T033–T037 verificadas.
- Feito: `storeSeriesEpisodes` recompõe `seriesWatchMembers` pelos stableIds dos episódios e invalida o resumo ao trocar membros; mutações de estado invalidam somente as séries localizadas pelo índice multiEntry `stableIds`; descarte de geração/fonte limpa membros e resumos sem varrer episódios globais. `seriesSummaryApi` consulta summaries válidos por geração/estado, faz backfill local único quando não há membros e nunca chama `ensureSeriesEpisodes`/rede para selos. Equivalência cobre duplicidade de stableId, catálogo novo, mudança de episódio, gerações e quota sem perder o selo em memória.
- Contrato: sem novo contrato (orçamento 5/5 preservado).
- Testes executados: repository/userState/catalogo → 79/79; integração de revisão → 3/3; API/catálogo/séries → 102/102; resumo/quota → 5/5; type-check, architecture e oxlint focado PASS.
- Benchmark T037: `diagnostic/t037-episodes-100000-r2` com 100k episódios, summary-first 828,9 ms (backfill), reentrada 86,8 ms e delta 88,5 ms. Na reentrada o roteiro leu summaries/members por série e zero registros de `episode`; no delta, apenas 51 estados locais do cenário alterado e zero episódio. Heap retido 7,01 MiB, Worker 0, seed 22,9 s; a leitura `userStates.getAll` observada pertence ao restante do roteiro de tela, não à facade de summaries.

## Phase 6: US5 — splash e código inicial (P3)

**Objetivo**: Liberar perfis pela prontidão e carregar rotas localmente quando necessárias.

### Implementation

- [x] T038 [US5] Criar navigation/routeModules.ts e extrair componentes de rota de App.tsx mantendo redutor/callbacks/ordem dos efeitos; eliminar imports estáticos indiretos que puxem telas pesadas. Aquecer módulos locais após prontidão, sem consulta por foco. (FR-021–FR-023, SC-011–SC-012)
- [x] T039 [US5] Adicionar components/RouteBoundary.tsx com loading/erro/SELECT/RETURN e textos pt/en/es via i18n; reutilizar Spinner/ErrorState e tokens, root coberta por .screen, retry de nova promise. (FR-002–FR-003, FR-024, SC-001, SC-011)
- [x] T040 [US5] Trocar timer fixo em features/splash/SplashScreen.tsx por prontidão local de fontes/perfis/idioma/movimento em App.tsx e main.tsx, mantendo splash → perfis/última lista e estados focáveis. (FR-021–FR-022, FR-024, SC-011)
- [x] T041 [US5] Definir chunks locais estáveis em vite.config.ts e listar todo output em CCPlayTv/tizen_web_project.yaml; revisar tizenFiles.mjs/sync-tizen.mjs sem relaxar o guard, CSP ou chrome108. (FR-022–FR-023, SC-012)

### Testes da Fase

- [x] T042 [P] [US5] Cobrir prontidão, vazio/erro, nenhuma espera extra e última lista em SplashScreen.readiness.test.tsx e App.startup.test.tsx; contrato visual/fluxo existente permanece. (FR-021, FR-024, SC-011)
- [x] T043 [P] [US5] Testar rota pendente/falha, retry e RETURN com foco restaurado em RouteBoundary.test.tsx e e2e/performance-navegacao.mjs; sem dupla inscrição de useRemoteNav. (FR-001–FR-003, FR-024, SC-001)
- [x] T044 [US5] Rodar build/guard e testes; medir abertura fria/quente com/sem lista, JS até marco e primeira visita de cada tela; executar pacote local sem rede externa em roteiro browser e registrar limite file:///TV. (FR-021–FR-025, SC-011–SC-012)

**Critério de Conclusão**: Testes verdes e SC-011/012 demonstrados; nenhuma rota/recurso ausente no pacote; SELECT/RETURN ativos em loading/erro, sem pular perfis. TV recomendada, sem instalação implícita.

**Registro da Fase**:

- Status: Concluída — T038–T044 verificadas.
- Feito: `navigation/routeModules.ts` concentra lazy imports locais para Live, VOD, detalhes, pessoa, Configurações e Busca, com aquecimento ocioso idempotente após o splash; Splash/Perfis, Início e telas de recuperação permanecem no caminho inicial. `App` preserva redutor, callbacks e ordem dos efeitos, e não dispara consulta por foco. `RouteBoundary` mantém loading/erro focáveis, sanitiza o erro, encaminha SELECT/RETURN e recria a promise de import ao tentar novamente; textos estão nas três localidades. O splash aguarda fontes locais consultadas em estado terminal, fontes CSS e preferências síncronas de idioma/movimento, com uma oportunidade de quadro da marca e sem atraso fixo. `vite.config.ts` emite dez chunks de rota com nomes estáveis e o YAML Tizen os inventaria sem alterar CSP, guard ou `chrome108`.
- Contrato: sem novo contrato (orçamento 5/5 preservado).
- Testes executados: RouteBoundary → 3/3; App/App.source-access/Splash → 13/13; `npx tsc -b --pretty false`, oxlint focado e architecture PASS com avisos preexistentes; `npm run build`/guard de demux PASS; `npm run test -- scripts/tizenFiles.test.mjs` → 5/5.
- Pendências: A validação em TV física continua recomendada/pendente; a matriz candidata formal de sete repetições fica no Polish T047.

## Evidência T044

- `bench-results/screen-perf-065/diagnostic/t044-startup/report.md`: amostra local candidate/smoke (`screens-local-100-images`), abertura sem lista cold 792,5 ms / warm 332,1 ms; com lista cold 444,5 ms / warm 459,9 ms; JS observado 1.041.270 bytes no cold sem lista e 1.006.583 bytes no cold com lista; primeira visita Home 1.571,7 ms, Filmes 2.152,5 ms, Séries 648,1 ms, categoria 638,0 ms. É diagnóstico de uma amostra, não aceite pareado.
- `node e2e/performance-navegacao.mjs`: sem lista não carregou chunk de rota; primeira visita montou a vitrine e RETURN restaurou a Home. A medição de nome do chunk no Vite dev ficou diagnóstica (0), pois o servidor entrega módulos-fonte; o build de produção/guard confirmou os nomes estáveis.
- `npm run build`, `node scripts/tizenFiles.mjs`, `npm run test -- scripts/tizenFiles.test.mjs` (5/5), e `check-no-demux-in-build.mjs` passaram. O pacote continua local para Tizen/file://; a amostra não comprova RAM, pintura física ou desempenho de TV.

## Phase 7: Polish e aceite completo

**Objetivo**: Confirmar todas as metas e encerrar com evidência e documentação honestas.

### Implementation

- [x] T045 Rodar lint/catraca, tipos, suíte completa (todos os contratos 5/5), integridade e builds normal/Tizen em tv-web/; comparar também locks de features tocadas ao estado inicial, sem regravá-los. (FR-025–FR-026, SC-013)
- [x] T046 Com npm run dev ativo, rodar npm run test:e2e incluindo e2e/performance-navegacao.mjs registrado em e2e/run.mjs, além dos fluxos Home/vitrines/busca/detalhe/RETURN; verificar quickstart no navegador. (FR-001–FR-003, FR-024–FR-026, SC-001, SC-013)
- [x] T047 Executar matriz candidata final em scripts/bench/run-screen-perf.mjs e compare-screen-perf.mjs contra baseline congelada; publicar json/amostras/ganho/dispersão/limitações e cada SC em bench-results/screen-perf-065/candidate/<run-id>/report.md. Meta falha exige revisão explícita, não aceite parcial. (FR-025–FR-026, SC-001–SC-013)
- [ ] T048 Revisar segredos/artefatos, documentar medição/limites no README.md e docs pertinentes e atualizar spec/plan/tasks/backlog pelos scripts após aceite; registrar TV recomendada como realizada/pendente e riscos residuais. (FR-014, FR-025–FR-026, SC-013)

- [x] T049 Descoberta na revisão do FAIL da T047: remover o cache FIFO de títulos de `ratedSelection.ts`, que tornava a seleção 2× mais lenta com 43k títulos distintos (seleção pura −49%/−140% na T047). (FR-006, SC-003)
- [x] T050 Descoberta na revisão do FAIL da T047: ligar as vitrines à passada cooperativa bloco a bloco (`catalogDerivedRows.iterateKindRecordBatches`, acumuladores incrementais de recentes/Bem avaliados) em vez de `loadSearchIndex` + seleção síncrona no `select` — lacuna de T016/T017. Chave sob `catalog-search-index` preserva invalidação por tipo. (FR-003, FR-006, D-005, SC-002–SC-005)
- [x] T051 Descoberta na revisão do FAIL da T047: o aquecimento de todas as rotas tinha sido removido e a primeira visita regrediu; `useRouteWarmup` aquece só o próximo destino provável (Início → vitrine; vitrine → categoria/detalhe) em ocioso, com o tipo da rota fixado por montagem. (FR-022, SC-011)
- [x] T052 Descoberta na revisão do FAIL da T047: o ajuste da T046 escondia o resumo "0/N" de séries, divergindo da baseline (D-001) e quebrando `catalogApi.test.tsx`. Semântica restaurada; o E2E `historico-continuar-assistindo` só passava por corrida (M3U já traz os episódios) e agora verifica a intenção real: nenhum "Em dia" antes de assistir. (FR-019, D-009)
- [x] T053 Descoberta na revisão do FAIL da T047: `f6ed277` gravou comentários com dupla codificação UTF-8 ("Ã§") e BOM em arquivos de App, catálogo, YAML, `vite.config.ts` e `e2e/run.mjs`; restaurados (inclui comentários da 063 já corrompidos antes). Somente comentários. (FR-026)
- [ ] T054 Descoberta na revisão do FAIL da T047: o crescimento de heap dos ciclos (SC-006) é artefato do harness — `waitForSelector` devolve `ElementHandle` nunca descartado, retido pelo grupo de objetos do console do CDP, que segura cada árvore de tela desmontada (confirmado por cadeia de retenção em snapshot). Corrigir exige alterar o harness congelado e recapturar baseline em worktree `e0ec6ef` + candidata. Usuário decidiu em 2026-10-09: corrigir e recapturar. Harness corrigido (`waitFor` descarta o handle; abertura também); sonda de heap: 11,49 → 11,71 MB em 4 ciclos de lista (antes ~1,1 MB/ciclo). Baseline run-003 em captura num worktree `e0ec6ef` com o hash do app idêntico ao da run-002 (fins de linha/BOM reproduzidos por arquivo) e o harness novo. (FR-025, SC-006, SC-013)
- [x] T055 Descoberta na revisão do FAIL da T047: SC-007 exige que a grade de categoria leia por janela durante a rolagem; hoje `useCategoryContent` materializa a categoria inteira (30.000 itens) para busca/ordenação/foco. Refatoração ampla de `VodCategoryScreen` (e do contrato de busca/ordenação/RETURN). Usuário decidiu em 2026-10-09: implementar. Feito: `useCategoryWindow` (catalogApi) lê janelas da projeção para categoria ≥ `READ_WINDOW_MIN_ITEMS` (1.000) na ordem da fonte e sem busca; busca/ordenação/categoria pequena/sem projeção seguem `useCategoryContent`. A grade conta o total, lê a janela visível ao rolar e persegue o foco restaurado pelo índice-dica. Backfill `prepareMissingReadModels` no housekeeping da pré-carga prepara só categorias grandes, a maior primeiro. A pré-busca por foco de categoria grande guarda só a 1ª janela. A grade passou a virtualizar linhas de 6 (antes células com lanes: 30 mil medições por render), com faixa extra de 3 linhas acima e 2 abaixo — o mesmo DOM da grade anterior (equivalência total no smoke). Testes: `catalogApi.category-window.test.tsx` 3/3; `src/features/vod` 183/183; suíte completa 504/3.047. Smoke `diagnostic/t055-cat30k-rows32`: sem leitura ≥ 1.000 itens no passo, cache sem a categoria inteira, heap temporário 13,7 → 1,4 MB, primeiro recorte 213 ms (baseline ~281, uma amostra), equivalência completa. (FR-015–FR-018, SC-007)

- [x] T056 Descoberta na revisão do FAIL da T047: o `manualChunks` do `vite.config.ts` puxava para o chunk de cada rota o código que ela compartilha com o início, e o `index.js` importava 7 rotas de forma estática (≈1 MB na abertura, SC-012 sem ganho). Agora o nome da rota vem só da entrada dela (`chunkFileNames` + `ROUTE_CHUNKS`) e Início, cadastro/importação e acesso à lista também são rotas lazy (`routeModules`), levando player e virtualizador para fora da abertura. Build: JS da abertura ≈641 KB (`index` 295 + compartilhado 343) contra 1.008 KB da baseline; YAML Tizen regenerado com 14 rotas + 37 compartilhados, guard sem pendência. Testes App/rotas/splash/guard 65/65, tipos e catraca PASS. (FR-022–FR-023, SC-012)
- [x] T057 Relato da TV física em 2026-10-09: detalhe de filme sem backdrop/elenco/trailer/semelhantes, "Testar" do TMDB dava "sem conexão" com status "Conectado", e séries não abriam ("não foi possível carregar os episódios"). Fora da TV não reproduzia (pacote idêntico via `file://` com provedor/TMDB reais funcionou). Causa: falta de espaço no IndexedDB da TV — a projeção compacta era gravada para toda categoria e, na lista real, ocupava mais (24,7 MB) que o canônico (19 MB); gravações derivadas sem proteção derrubavam fluxos principais (índice de membros após gravar episódios; metadata do provedor/TMDB no detalhe; integração no "Testar"). Correção: projeção só para categorias ≥ `READ_WINDOW_MIN_ITEMS` e limpeza das existentes no housekeeping; cursor de "Todos" usa a assinatura dos itens como revisão sem projeção; falha ao gravar índice de séries, metadata do provedor ou resultado TMDB não esconde o que chegou; "Testar" em pausa mostra "Limite de uso"; pausa limitada a 1 h (`MAX_PAUSE_MS`/`validPause`). Testes: `titleMetadata.storage.test.ts` 3/3, writers/janela ajustados a categorias grandes, suíte da área 1.138/1.138, metadata 205/205, catraca PASS, contratos 5/5. Reinstalado na TV: usuário confirmou detalhe completo, episódios e TMDB "Conectado". (FR-008–FR-018, D-001, D-007)

### Testes da Fase

Cobertura final em T045–T047; não escrever testes que apenas espelhem refactoring trivial.

### Evidência T045–T047

- T045: `npm run test` passou com 503 arquivos/3.044 testes; `npm run lint`, `npx tsc -b`, `npm run build`, `npm run build:tizen`, `node scripts/tizenFiles.mjs` e a trava de 5 contratos passaram. O build Tizen exigiu inventariar `assets/rolldown-runtime.js`.
- T046: a primeira execução completa (`node e2e/run.mjs --jobs 2`) teve 39/44, com cinco roteiros antigos presos em estados/timeouts. A investigação reproduziu as causas: interceptadores `**/vod/**`, `**/series/**` e `**/live/**` bloqueavam módulos locais do Vite; `usePersonCredits` passava um `signal` incompatível com o loader de créditos; o resumo de séries publicava `0/N` antes de existir progresso; o roteiro M3U tinha uma asserção antes da montagem lazy; e `catalogo-em-blocos` enviava um Enter extra quando o card já estava focado. Os interceptadores agora deixam o host local continuar, créditos usam o contrato existente, resumos sem progresso não são publicados, o fluxo M3U espera `.settings-screen`, e o catálogo aguarda a tela/foco antes de abrir o detalhe. Reexecução serial focada passou 5/5 em 75 s e a suíte completa posterior passou 44/44 em 344 s.
- T047: matriz candidata formal concluída em `bench-results/screen-perf-065/candidate/t047-final/` com 70 amostras (10 configurações × 7). O comparador marcou **FAIL** porque vários gates não fecharam: `movies-after-home` e seleção pioraram em algumas fixtures; `screens-tmdb-100-images` teve regressões de conteúdo/foco, maior tarefa e p95; `local-100-no-images` teve piora de abertura de categoria e seleção; heap retido variou negativamente em cenários; `category-30000` teve primeiro recorte 764,6 ms contra 281,1 ms e falhou leitura limitada/fim/busca/RETURN; `cycles-local` e `cycles-tmdb` falharam `listCycles`; JS de abertura ficou em 1.041.543 bytes contra 1.007.752 em parte da matriz; e os gates externos SC-008/009/011/012/013 não foram aprovados pelo comparador. Portanto, o resultado é diagnóstico e não aceite de desempenho.

**Critério de Conclusão**: Todos os contratos 5/5, gates, E2E, quickstart e SC-001..013 passam; evidências completas, TV corretamente registrada. Nenhuma capacidade física é afirmada sem medição real.

### Evidência de instalação na TV

- `.\.planning\scripts\powershell\deploy-tv.ps1` executado em 2026-10-08: TV encontrada em `192.168.0.2`, preflight `sdb` conectado, `npm run build:tizen`/guard concluídos, pacote assinado com `ccplay_samsung_certificate_4`, instalado e lançado como `8tZqMtwANL.CCPlayTv`. A instalação preserva o IndexedDB. A tela, foco, reprodução, memória e desempenho ainda não foram declarados aprovados: falta observação visual na TV.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

### Checklist de Release

- [x] Fase 1: baseline imutável e instrumentos verificados.
- [ ] Fase 2/US1: consultas, cache e pausa corretos.
- [ ] Fase 3/US2: carga/seleção/eventos equivalentes e aferidos.
- [ ] Fase 4/US3: limites de memória/janelas/RETURN verificados.
- [ ] Fase 5/US4: resumos e leituras incrementais verificados.
- [x] Fase 6/US5: prontidão/primeira visita/recursos locais verificados.
- [ ] Todos os cinco contratos verdes e check-contract-tests.ps1 íntegro.
- [ ] Lint/catraca, tipos, suíte completa e builds normal/Tizen passaram.
- [ ] E2E com dev server passou antes de eventual hardware.
- [ ] SC-001..SC-013 documentados com comparação pareada e amostras.
- [ ] Quickstart/aceite manual no navegador concluído.
- [ ] Segredos revisados e documentação/status sincronizados.
- [ ] TV registrada como validada ou recomendada/pendente, sem comprovação física indevida.

## Dependencies & Execution Order

- Fase 1 bloqueia mudanças de comportamento nas demais fases: medir antes de otimizar.
- US1 é entregável independente; US2 pode ser aferida sem TMDB e não depende da US1, mas executa depois dela por prioridade.
- US3 integra leituras/retensão da US2; a US2 usa leitura compatível por categoria antes das projeções. Não declarar SC-005/007 atendidos antecipadamente.
- US4 usa o schema seguinte ao definido na US3, evitando colisão de versão, e não depende de seus componentes visuais.
- US5 é independente do algoritmo de catálogo, mas vem depois para não misturar ganhos e deve preservar extrações/reexports já feitos.
- Polish depende das cinco stories e revalida todas as metas no conjunto final.
- [P] somente nos testes/fixtures independentes da mesma fase; benchmarks sempre sequenciais. Tarefas que tocam catalogApi/db/App não são paralelas entre fases.

## Implementation Strategy

Entrega incremental: cada fase roda testes adicionais/área e seus contratos e registra checkpoint no plan/tasks. Contratos futuros vermelhos são pendência conhecida, não erro da fase atual nem motivo para editá-los. Na fase final, nenhum vermelho é permitido. Atualizar progresso via update-feature-status.ps1; não marcar meta como alcançada sem amostras.

Seguir decisões D-001..D-013 e riscos R-001..R-008. Se um módulo/caminho proposto conflitar com código alterado desde este plan, registrar ajuste de caminho na mesma task/documentação, sem inventar importação nem reverter trabalho alheio. Não instalar dependência, iniciar backend ou implantar na TV para concluir este planejamento.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
