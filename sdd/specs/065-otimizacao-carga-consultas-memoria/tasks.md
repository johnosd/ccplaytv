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

- [ ] T001 [P] Criar fixtures determinísticas (43k/10k, elegibilidade, categoria 30k, episódios, favoritos/histórico e três listas) em tv-web/scripts/bench/screenFixtures.mjs e imagens locais em tv-web/e2e/fixtures/screen-perf/; fixar relógio e valores sintéticos. (FR-025, SC-001–SC-013)
- [ ] T002 Criar run-screen-perf.mjs, screenInstrumentation.mjs e adapter de controle isolado em tv-web/src/bench/screenControl.ts para build/servidor efêmero, conteúdo/foco, leituras, heap, abertura/bytes e conclusão pelo scheduler real; seguir logic/abertura-benchmark.md, sem chamar invalidação manual nem entrar no pacote normal. (FR-025, SC-002–SC-012)
- [ ] T003 Criar compare-screen-perf.mjs e captura de equivalência em tv-web/scripts/bench/; salvar fingerprint e ≥7 amostras por configuração em tv-web/bench-results/screen-perf-065/baseline/<run-id>/, antes das próximas fases, sem benchmarks concorrentes. (FR-001–FR-003, FR-025, SC-001–SC-013)
- [ ] T004 Registrar baseline, custo de preparação/migração e roteiro de comparação em sdd/specs/065-otimizacao-carga-consultas-memoria/quickstart.md e tv-web/bench-results/screen-perf-065/baseline/<run-id>/report.md; nunca substituir por review-screen-perf de três runs. (FR-025–FR-026, SC-013)

### Testes da Fase

- [ ] T005 [P] Testar fórmulas, falta de amostra, ambiente/fixture incompatível e denominador zero em tv-web/scripts/bench/compare-screen-perf.test.mjs; verificar isolamento de dados e que instrumentação não emite segredo. (FR-014, FR-025, SC-013)

**Critério de Conclusão**: Baseline imutável identificada, fixtures/instrumentação reproduzíveis e testes do comparador verdes. Não há otimização aprovada nesta fase; todos os cinco contratos futuros continuam vermelhos esperados.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

## Phase 2: US1 — consultas externas (P1)

**Objetivo**: Encerrar consultas corretamente, preservar cache válido e compartilhar trabalho sem corridas.

### Contrato da Fase

Origem/nome integral e falha confirmada em plan.md → Testes de Contrato; arquivos travados em contract-tests.lock.

Comando (tv-web/):

~~~powershell
npm run test -- src/lib/metadata/externalQueries.otimizacao-carga-consultas-memoria.contract.test.ts
~~~

### Implementation

- [ ] T006 [US1] Implementar deadline/AbortController abrangendo fetch e corpo em tv-web/src/lib/metadata/tmdbConnector.ts e helper novo requestDeadline.ts, conforme logic/consultas.md; limitar detalhes Xtream em titleMetadata.ts sem alterar importação/EPG/player. (FR-008, FR-014, SC-008) → contrato: prazo inclui rede e corpo
- [ ] T007 [US1] Implementar Retry-After e mutação condicional de pausa/revisão em tv-web/src/lib/metadata/tmdbKeyRepository.ts e db.ts; preservar fallback vigente de 10 minutos e pausa após sucesso concorrente. (FR-010, FR-014, SC-008) → contrato: 429 parcial preserva cache
- [ ] T008 [US1] Corrigir lotes/publicação atômica e fallback de descoberta em tv-web/src/lib/metadata/tmdbDiscovery.ts; nenhuma página necessária pode falhar e renovar o cache. (FR-009–FR-011, FR-013, SC-008–SC-009) → contrato: 429 parcial preserva cache
- [ ] T009 [US1] Criar tv-web/src/lib/metadata/sharedAttempt.ts e integrar leases/contexto em tmdbDiscovery.ts, titleMetadata.ts e types.ts; remover tentativa por identidade e conferir revisão antes de persistir. (FR-007, FR-012–FR-014, SC-009)
- [ ] T010 [US1] Propagar signal/liberação de consumidor nos hooks de tv-web/src/features/catalog/catalogApi.ts e useTitleMetadata.ts, mantendo APIs públicas e sem nova consulta por foco. Extrair discoveryApi.ts se necessário para respeitar a catraca. (FR-002–FR-003, FR-012–FR-014, SC-001, SC-009)
- [ ] T011 [US1] Executar casos controlados de chamadas/pausa/retentativa pelo runner tv-web/scripts/bench/run-screen-perf.mjs e registrar resultados US1 em candidate/<run-id>/report.md. (FR-025, SC-008–SC-009)

### Testes da Fase

- [ ] T012 [P] [US1] Cobrir corpo pendente, JSON inválido, 401/404/5xx, Retry-After numérico/data e sem cache em tmdbConnector.test.ts, tmdbDiscovery.test.ts e tmdbKeyRepository.test.ts; sem editar contratos travados. (FR-008–FR-011, SC-008)
- [ ] T013 [P] [US1] Cobrir dois consumidores, último cancelamento, chave/idioma/lista trocados e chegada antiga em novos sharedAttempt.test.ts e titleMetadata.otimizacao.test.ts e componentes de integração existentes. (FR-001–FR-003, FR-007, FR-012–FR-014, SC-001, SC-009)
- [ ] T014 [US1] Rodar testes da área e o contrato externo 2/2, integridade da trava, lint e tipos; registrar os comandos em plan.md Execution Notes no checkpoint. (FR-025–FR-026, SC-013)

**Critério de Conclusão**: Comando do contrato externo → 2/2 verdes e check-contract-tests.ps1 íntegro; testes da área e tipos/lint passam. SC-008/009 demonstrados, sem bloquear catálogo local. Contratos US2/US3 permanecem pendentes.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

## Phase 3: US2 — carga e atualização das vitrines (P1)

**Objetivo**: Reduzir CPU/bloqueio e invalidar somente o contexto afetado sem alterar seleção.

### Contrato da Fase

Origem/nome integral e falha confirmada em plan.md → Testes de Contrato; arquivos travados em contract-tests.lock.

Comando (tv-web/):

~~~powershell
npm run test -- src/features/catalog/prefetchApi.otimizacao-carga-consultas-memoria.contract.test.ts src/features/vod/ratedSelectionAsync.otimizacao-carga-consultas-memoria.contract.test.ts
~~~

### Implementation

- [ ] T015 [US2] Otimizar selectFeaturedRated em tv-web/src/features/vod/ratedSelection.ts e implementar stub ratedSelectionAsync.ts com deduplicação global, top-K estável, normalização equivalente e pausas; seguir logic/catalogo.md. (FR-001, FR-006, SC-001, SC-003) → contrato: seleção cooperativa mantém desempates
- [ ] T016 [US2] Adicionar tv-web/src/lib/catalog/catalogDerivedRows.ts e leitores iteráveis pela fachada catalogRepository.ts; produzir seleções/correspondências pequenas sem carregar listAllOfKind para vitrines. Antes da US3, ler blocos um por vez. (FR-003, FR-006–FR-007, FR-015, SC-002–SC-003)
- [ ] T017 [US2] Extrair showcaseApi.ts de tv-web/src/features/catalog/catalogApi.ts com reexports compatíveis, resultados pequenos/contexto por geração/dia/idioma e cancelamento de cálculo obsoleto. (FR-001–FR-003, FR-006–FR-007, SC-001–SC-003)
- [ ] T018 [US2] Aplicar kind/revisão e delta por categoria em tv-web/src/features/catalog/prefetchApi.ts, lib/catalog/prefetch/index.ts, prefetchScheduler.ts e loaders; atualizar também entrada direta, conversão e carga por seção. Conservar batch de 1 s e geração no mesmo caminho. (FR-004–FR-007, SC-004) → contrato: conclusão de filmes atualiza filmes
- [ ] T019 [US2] Reconciliar respostas/resultados e foco por id nos consumidores tv-web/src/features/vod/VodShowcaseScreen.tsx e features/home/HomeContent.tsx sem mudar layout/seleção; medir fluxo de três conclusões reais e carga fria/quente. (FR-001–FR-007, SC-001–SC-004)

### Testes da Fase

- [ ] T020 [P] [US2] Adicionar equivalência ampla de seleção/normalização nos testes ratedSelection.test.ts e ratedSelectionAsync.test.ts; cobrir duplicatas, empates, fallback, datas, cancelamento e entrada imutável. (FR-001, FR-006–FR-007, SC-001, SC-003)
- [ ] T021 [P] [US2] Cobrir eventos reais, categorias de tipos distintos, revisão obsoleta e alteração no mesmo caminho em prefetchApi.test.ts, prefetchScheduler.test.ts e catalogApi.vitrine-cache.test.tsx; comparar todos os writers. (FR-004–FR-007, SC-004)
- [ ] T022 [US2] Rodar os dois contratos locais, testes da área, trava e gates; usar runners pareados para SC-002/003/004 e registrar amostras/equivalência no relatório da fase. (FR-025–FR-026, SC-001–SC-004, SC-013)

**Critério de Conclusão**: Comando dos dois contratos locais → 2/2 verdes e trava íntegra; equivalência, carga/CPU/eventos reais e limite de propagação passam para US2. Não reduzir conteúdo para fechar percentuais.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

## Phase 4: US3 — janelas e memória (P2)

**Objetivo**: Limitar leituras/retensão sem limitar conteúdo, histórico ou retorno.

### Contrato da Fase

Origem/nome integral e falha confirmada em plan.md → Testes de Contrato; arquivos travados em contract-tests.lock.

Comando (tv-web/):

~~~powershell
npm run test -- src/lib/catalog/repository/categoryWindow.otimizacao-carga-consultas-memoria.contract.test.ts
~~~

### Implementation

- [ ] T023 [US3] Adicionar schema/tipos de catalogReadManifests/catalogReadChunks em tv-web/src/lib/catalog/db.ts e implementar repository/readProjection.ts e stub categoryWindow.ts; reexportar na fachada. Preparação idempotente/por revisão, campos compactos e janelas conforme data-model.md e logic/catalogo.md. (FR-001, FR-015–FR-016, FR-018, SC-005, SC-007) → contrato: janela preparada mantém ids
- [ ] T024 [US3] Integrar preparação/invalidação/limpeza aos writers tv-web/src/lib/catalog/categoryBlocks.ts, repository/categoryItems.ts, repository/generations.ts, repository/structureRefresh.ts, sourceRepository.ts e conversão/Worker. Preservar canônico em quota/abort e não publicar projeção velha. (FR-007, FR-015, FR-018, SC-006–SC-007)
- [ ] T025 [US3] Implementar cache limitado por itens/chunks e contexto em blockMemo.ts e novo readProjectionMemo.ts; tirar índices completos das vitrines e limitar compactos em catalogSearch.ts e showcaseApi.ts. (FR-006–FR-007, FR-015, SC-005–SC-006)
- [ ] T026 [US3] Adicionar cursor categoria+offset+revisão em repository/kindReads.ts via API nova mantendo readKindPage legado; extrair categoryWindowApi.ts e adaptar grades em VodCategoryScreen.tsx e LiveScreen.tsx somente onde usam acumulação, com id/scroll/índice lógico. (FR-002, FR-015–FR-016, FR-018, SC-001, SC-007)
- [ ] T027 [US3] Garantir busca/ordenação integral antes da janela em catalogSearch.ts, catalogApi.ts e leitores de categoria; consumir projeções sem reidratar todas as obras. Atualizar prévias para janela de 12. (FR-001, FR-006–FR-007, FR-016, FR-018, SC-001, SC-007)
- [ ] T028 [US3] Separar resumo/contagem de histórico dos objetos em novo features/catalog/historyApi.ts e lib/catalog/history.ts, mantendo fachada catalogApi.ts; paginar histórico/favoritos, expirar payload sem consumidor e preservar contadores/estado lógico. (FR-002, FR-015, FR-017–FR-018, SC-005–SC-006)
- [ ] T029 [US3] Aplicar limites de caches derivados por contexto e arte em tv-web/src/features/vod/useCoverColor.ts e features/catalog/showcaseApi.ts; executar ciclos/alternâncias com imagens, quota e conversão e registrar heap/picos/Worker/disco. (FR-014–FR-018, FR-025, SC-005–SC-007)

### Testes da Fase

- [ ] T030 [P] [US3] Adicionar testes de revisão, legado, janela final, fonte removida, conversão interrompida/quota e limpeza em repository/categoryWindow.test.ts, readProjection.test.ts, blockMemo.test.ts e db.test.ts. (FR-007, FR-015–FR-018, SC-006–SC-007)
- [ ] T031 [P] [US3] Cobrir histórico/favoritos/contadores após GC e RETURN por id após recarga em catalogApi.history-cache.test.tsx e VodCategoryScreen.window.test.tsx; buscar e ordenar até último item, não só primeira página. (FR-001–FR-002, FR-016–FR-018, SC-001, SC-007)
- [ ] T032 [US3] Rodar contrato da janela 1/1, contratos/área antigos, trava, gates e benchmarks de heap/categoria/ciclos; medir também custo de importação/categoria/projeção e registrar qualquer regressão. (FR-025–FR-026, SC-005–SC-007, SC-013)

**Critério de Conclusão**: Comando do contrato de janela → 1/1 verde e trava íntegra; SC-005/006/007 e equivalência/RETURN passam, incluindo leitura fria e custo inicial de conversão reportados. Nenhum catálogo/userState apagado por cache limitado.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

## Phase 5: US4 — resumos incrementais de séries (P2)

**Objetivo**: Reaproveitar resumo válido e atualizar somente séries afetadas.

### Implementation

- [ ] T033 [US4] Adicionar membros/resumos e índices do data-model.md em tv-web/src/lib/catalog/db.ts e novo seriesWatchRepository.ts; mover o helper puro de features/series/seriesWatchedSummary.ts para lib/catalog/seriesWatchedSummary.ts com reexport compatível no caminho antigo, sem lib→features. Backfill fora do upgrade e mesma semântica. (FR-019–FR-020, SC-010)
- [ ] T034 [US4] Integrar revisão de episódios e estado em repository/series.ts, userStateRepository.ts e caminhos de publicação/remoção de fonte; localizar todas as séries afetadas por stableId sem varredura global. (FR-001, FR-017–FR-020, SC-001, SC-010)
- [ ] T035 [US4] Extrair features/catalog/seriesSummaryApi.ts com facade catalogApi.ts e carregar somente resumos válidos; não chamar ensureSeriesEpisodes/rede para selos. (FR-003, FR-019–FR-020, SC-010)

### Testes da Fase

- [ ] T036 [P] [US4] Comparar resumos ao helper atual, id duplicado/multiplicidade, geração, quota, catálogo novo e alteração de episódio em seriesWatchRepository.test.ts e catalogApi.series-summary.test.tsx. (FR-019–FR-020, SC-010)
- [ ] T037 [US4] Rodar testes da área, tipos/lint e benchmark de 100k episódios: zero varredura na reentrada e zero varredura de outras séries no delta; publicar leituras/equivalência. (FR-019–FR-020, FR-025, SC-010, SC-013)

**Critério de Conclusão**: Testes complementares verdes, SC-010 demonstrado com contadores/leituras reais, e estado lógico/equivalência intactos; sem novo contrato por orçamento de cinco.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

## Phase 6: US5 — splash e código inicial (P3)

**Objetivo**: Liberar perfis pela prontidão e carregar rotas localmente quando necessárias.

### Implementation

- [ ] T038 [US5] Criar navigation/routeModules.ts e extrair componentes de rota de App.tsx mantendo redutor/callbacks/ordem dos efeitos; eliminar imports estáticos indiretos que puxem telas pesadas. Aquecer módulos locais após prontidão, sem consulta por foco. (FR-021–FR-023, SC-011–SC-012)
- [ ] T039 [US5] Adicionar components/RouteBoundary.tsx com loading/erro/SELECT/RETURN e textos pt/en/es via i18n; reutilizar Spinner/ErrorState e tokens, root coberta por .screen, retry de nova promise. (FR-002–FR-003, FR-024, SC-001, SC-011)
- [ ] T040 [US5] Trocar timer fixo em features/splash/SplashScreen.tsx por prontidão local de fontes/perfis/idioma/movimento em App.tsx e main.tsx, mantendo splash → perfis/última lista e estados focáveis. (FR-021–FR-022, FR-024, SC-011)
- [ ] T041 [US5] Definir chunks locais estáveis em vite.config.ts e listar todo output em CCPlayTv/tizen_web_project.yaml; revisar tizenFiles.mjs/sync-tizen.mjs sem relaxar o guard, CSP ou chrome108. (FR-022–FR-023, SC-012)

### Testes da Fase

- [ ] T042 [P] [US5] Cobrir prontidão, vazio/erro, nenhuma espera extra e última lista em SplashScreen.readiness.test.tsx e App.startup.test.tsx; contrato visual/fluxo existente permanece. (FR-021, FR-024, SC-011)
- [ ] T043 [P] [US5] Testar rota pendente/falha, retry e RETURN com foco restaurado em RouteBoundary.test.tsx e e2e/performance-navegacao.mjs; sem dupla inscrição de useRemoteNav. (FR-001–FR-003, FR-024, SC-001)
- [ ] T044 [US5] Rodar build/guard e testes; medir abertura fria/quente com/sem lista, JS até marco e primeira visita de cada tela; executar pacote local sem rede externa em roteiro browser e registrar limite file:///TV. (FR-021–FR-025, SC-011–SC-012)

**Critério de Conclusão**: Testes verdes e SC-011/012 demonstrados; nenhuma rota/recurso ausente no pacote; SELECT/RETURN ativos em loading/erro, sem pular perfis. TV recomendada, sem instalação implícita.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

## Phase 7: Polish e aceite completo

**Objetivo**: Confirmar todas as metas e encerrar com evidência e documentação honestas.

### Implementation

- [ ] T045 Rodar lint/catraca, tipos, suíte completa (todos os contratos 5/5), integridade e builds normal/Tizen em tv-web/; comparar também locks de features tocadas ao estado inicial, sem regravá-los. (FR-025–FR-026, SC-013)
- [ ] T046 Com npm run dev ativo, rodar npm run test:e2e incluindo e2e/performance-navegacao.mjs registrado em e2e/run.mjs, além dos fluxos Home/vitrines/busca/detalhe/RETURN; verificar quickstart no navegador. (FR-001–FR-003, FR-024–FR-026, SC-001, SC-013)
- [ ] T047 Executar matriz candidata final em scripts/bench/run-screen-perf.mjs e compare-screen-perf.mjs contra baseline congelada; publicar json/amostras/ganho/dispersão/limitações e cada SC em bench-results/screen-perf-065/candidate/<run-id>/report.md. Meta falha exige revisão explícita, não aceite parcial. (FR-025–FR-026, SC-001–SC-013)
- [ ] T048 Revisar segredos/artefatos, documentar medição/limites no README.md e docs pertinentes e atualizar spec/plan/tasks/backlog pelos scripts após aceite; registrar TV recomendada como realizada/pendente e riscos residuais. (FR-014, FR-025–FR-026, SC-013)

### Testes da Fase

Cobertura final em T045–T047; não escrever testes que apenas espelhem refactoring trivial.

**Critério de Conclusão**: Todos os contratos 5/5, gates, E2E, quickstart e SC-001..013 passam; evidências completas, TV corretamente registrada. Nenhuma capacidade física é afirmada sem medição real.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

### Checklist de Release

- [ ] Fase 1: baseline imutável e instrumentos verificados.
- [ ] Fase 2/US1: consultas, cache e pausa corretos.
- [ ] Fase 3/US2: carga/seleção/eventos equivalentes e aferidos.
- [ ] Fase 4/US3: limites de memória/janelas/RETURN verificados.
- [ ] Fase 5/US4: resumos e leituras incrementais verificados.
- [ ] Fase 6/US5: prontidão/primeira visita/recursos locais verificados.
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
