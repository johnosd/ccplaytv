---
description: "Tasks da feature 038 — carga de listas, pré-carga, contagens e atualização"
---

# Tasks: Carga de listas — progresso claro, pré-carga em segundo plano, contagens e atualização visível

**Input**: Documentos de design de `sdd/specs/038-carga-listas-pre-carga/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, logic/*.md, quickstart.md

**Organization**: Medição primeiro (FR-012), depois a fundação de escrita, depois
as stories por prioridade.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence

## Path Conventions

- Frontend (único código tocado): `tv-web/src/` — dados em `lib/catalog/`,
  agendador em `lib/catalog/prefetch/`, telas em `features/*`, componentes
  genéricos em `components/`.
- E2E: `tv-web/e2e/*.mjs` (Playwright, `executablePath` Linux hardcoded como
  nos outros roteiros — no Windows, sobrescrever temporariamente).
- Documentação: `sdd/specs/038-carga-listas-pre-carga/`, `.planning/`, `CLAUDE.md`.
- Comandos rodam em `tv-web/` salvo indicação; scripts `.planning/…` na raiz.

---

## Phase 1: Medição da linha de base (US2, parte 1 — FR-012) 🎯 primeiro

**Objetivo**: saber onde vão os ~60 s da primeira entrada fria **no código de
hoje**, antes de mudar o caminho de escrita.

- [X] T001 [US2] Criar `tv-web/src/lib/perf/entryTiming.ts`: marcas por fase (`request`, `firstByte`, `responseEnd`, `mapped`, `written`, `read`, `firstPaint`) com `performance.now()`, ligadas só com `localStorage['ccplaytv:perf'] === '1'` (try/catch), relatório por `logger.info` **só com números** (ms, nº de itens, bytes) e a seção — nunca URL (research R0-1)
- [X] T002 [US2] Instrumentar sem mudar comportamento: `categoryLoader.fetchAndStore` (request/firstByte/responseEnd/mapped/written — `xtreamConnector.fetchListDirect` se precisar do primeiro byte), `catalogApi.loadCategoryContent` (read), e o primeiro quadro com cartões em `features/vod/VodCatalogScreen.tsx`/`features/live/LiveScreen.tsx` (`requestAnimationFrame` depois de itens > 0)
- [X] T003 [P] [US2] Criar `tv-web/e2e/carga-listas-real.mjs` (fora de `test:e2e`, mesmo molde de `e2e/epg-dados-agora-real.mjs`): lê `CCPLAY_PROBE_*` do `.env` da raiz, importa a lista real, entra em 3 categorias de cada seção × 3 repetições com `ccplaytv:perf` ligado, imprime **só** a tabela de tempos por fase
- [ ] T004 [US2] Rodar T003 no PC; rodar a mesma sequência na TV de referência (skill `tizen-tv`, `sdb dlog`/Web Inspector). Se a TV não estiver acessível, registrar "não medido na TV" em R-001 e seguir com a medição do PC (a da TV volta no gate SC-008)
- [ ] T005 [US2] Registrar a decomposição em `research.md` R0-1 (tabela) e em `plan.md` R-001, atribuindo cada parcela a **app** ou **painel**; criar as tasks de correção correspondentes na Fase 4 (T040+) com o gargalo medido

### Testes da Fase

- [X] T006 [P] [US2] Teste de `entryTiming.ts` em `tv-web/src/lib/perf/entryTiming.test.ts`: desligado não registra nada; ligado registra só números (nenhuma string com `http`)

**Critério de Conclusão**: tabela de decomposição registrada (PC obrigatório, TV
se acessível), cada parcela atribuída, tasks da Fase 4 criadas; instrumentação
desligada por padrão; `npm run test` e `npx tsc -b` limpos.

**Registro da Fase**:

- Status: parcial — PC medido; TV com build de medição instalado, aguardando leitura na tela (a TV não entrega console).
- Feito: `lib/perf/entryTiming.ts` (marcas request/mapped/written/read/firstPaint, só números; ligada por `localStorage['ccplaytv:perf']` ou pelo build `VITE_CCPLAY_PERF=1`), `components/PerfOverlay.tsx` (painel de números só no build de medição, montado em `main.tsx`), marcação em `categoryLoader.fetchAndStore` e `catalogApi` (`read` e `firstPaint` via efeito + rAF em `useCategoryContent`, sem tocar telas travadas), `e2e/carga-listas-real.mjs`. Medição do PC registrada em `research.md` R0-1: canais p50 0,6 s, séries p50 1,3 s, filmes p50 1,7 s / máx 3,8 s (11.130 itens; ~1,5 s de gravação) — **nada perto de 1 min no PC**.
- Contrato: sem contrato nesta fase.
- Testes executados: `npx vitest run src/lib/perf/entryTiming.test.ts` → 2/2; `npx tsc -b` limpo; `node e2e/carga-listas-real.mjs 3 3` (27 entradas). 1ª rodada do roteiro acusou "Séries não abre em 180 s" — era bug do próprio roteiro (6×↑ não chegavam à topbar saindo de categoria funda), confirmado com diagnóstico descartável e corrigido (40×↑).
- Pendências: T004 (lado TV) e T005 (atribuição final) dependem da leitura na TV; T040 fica como placeholder até lá.

---

## Phase 2: Foundational — um caminho de escrita que preserva id

**Purpose**: renovação sem trocar ids, entrada que nunca espera renovação.
Bloqueia as Fases 3, 5 e 7.

### Contrato da Fase

- `mantém o id de quem continua, remove quem saiu, cria quem entrou e não regrava lista idêntica` — FR-027, D-006
- `serve o disco sem tocar a rede e pede a renovação em segundo plano` — FR-024, FR-026
- Comando: `npx vitest run src/lib/catalog/catalogRepository.carga-listas.contract.test.ts src/lib/catalog/categoryLoader.carga-listas.contract.test.ts`

### Implementation

- [X] T007 Implementar `renewCategoryItems` em `tv-web/src/lib/catalog/catalogRepository.ts` (`logic/atualizacao-sem-esfriar.md` §6: `identityKey`, assinatura FNV-1a, `put` com id reaproveitado + `episodesFetchedAt`, `add`, `bulkDelete`, carimbo; quota → `StorageFullError`) → contrato: `mantém o id de quem continua…`
- [X] T008 `listChannels` ordena por `categoryPosition` (ausente = depois, por id) antes de `offset/limit`, em `catalogRepository.ts` → contrato: `mantém o id de quem continua…`
- [X] T009 `listCategories`: mapear `renewRequestedAt` e ordenar por `position ?? order` em `catalogRepository.ts` (D-005)
- [X] T010 `categoryLoader.ts`: `fetchAndStore` e `readStored` gravam por `renewCategoryItems` (episódios M3U: substituição integral, D-011); ler `renewRequestedAt` do registro gravado; opção `serveStale` (vencida ou pendente com itens → `stale-served` sem rede + callback); opção `renew` (força obter com itens no disco); `StorageFullError` vira `{ outcome: 'failed', reason: 'storage_full' }` (campo novo opcional em `EnsureCategoryResult`) — `logic/atualizacao-sem-esfriar.md` §5 → contrato: `serve o disco sem tocar a rede…`
- [X] T011 Conferir que `storeCategoryItems` continua exportado e com o comportamento antigo (usado por testes e pelo contrato), e que nenhum chamador de produção grava itens por ele depois de T010

### Testes da Fase

- [X] T012 [P] Testes em `tv-web/src/lib/catalog/catalogRepository.test.ts`: M3U por `originalName` com nomes repetidos (R-005), categoria vazia (0 itens = carregada, `itemsCount: 0`), quota → `StorageFullError`, `listCategories` por `position`
- [X] T013 [P] Testes em `tv-web/src/lib/catalog/categoryLoader.test.ts`: `renew` grava e preserva ids; sem `serveStale` o comportamento antigo continua; `storage_full` sai como `reason`; `stored` sem `storedFrom` segue a regra da 014

**Critério de Conclusão**: os 2 contratos da fase verdes e
`check-contract-tests.ps1 -Slug 038-carga-listas-pre-carga` íntegro;
`npx vitest run src/lib/catalog` sem regressão (só os contratos vermelhos das
034/036 continuam vermelhos); `npx tsc -b` limpo.

**Registro da Fase**:

- Status: concluída.
- Feito: `renewCategoryItems` + `renewWithin` (id preservado por identidade, `episodesFetchedAt` mantido, assinatura FNV-1a, quota → `StorageFullError`); `listChannels` ordena por `categoryPosition`; `listCategories` por `position ?? order` e expõe `renewRequestedAt`; `categoryLoader`: um caminho de escrita (`fetchAndStore`/`readStored` → renovação), `serveStale`, `renew`, `reason: 'storage_full'`, leitura por `storedFrom`; `storeStoredCategory` renova itens com id preservado, substitui episódios inteiros (D-011) e apaga os blocos de `chunksFrom`. `storeCategoryItems` ficou só com o contrato/testes como chamadores.
- Contrato: `npx vitest run src/lib/catalog/catalogRepository.carga-listas.contract.test.ts src/lib/catalog/categoryLoader.carga-listas.contract.test.ts` → 2/2 verdes; trava íntegra.
- Testes executados: `npx vitest run src/lib/catalog/catalogRepository.carga-listas.contract.test.ts src/lib/catalog/categoryLoader.carga-listas.contract.test.ts src/lib/catalog/categoryLoader.test.ts src/lib/catalog/catalogRepository.test.ts src/lib/catalog/seriesLoader.test.ts src/lib/catalog/importPipeline.test.ts` → 113/113; novos `catalogRepository.renovacao.test.ts` + `categoryLoader.renovacao.test.ts` → 8/8; `npx tsc -b` limpo.
- Pendências: nenhuma.

---

## Phase 3: User Story 1 — Pré-carga em segundo plano (Priority: P1) 🎯 MVP

**Objetivo**: com a lista aberta, as categorias chegam sozinhas, sem atrapalhar
navegação nem reprodução.

**Independent Test**: E2E cenários 3, 4 e 5 do `quickstart.md`.

### Contrato da Fase

- `prioriza a focada e as vizinhas, depois o resto da seção, depois as outras seções; falhas no fim` — FR-005, FR-007
- `uma categoria por vez, só depois de 2 s sem tecla, nunca com player aberto, e retoma sozinho` — FR-002/003/004/006, SC-004
- Comando: `npx vitest run src/lib/catalog/prefetch/prefetchOrder.carga-listas.contract.test.ts src/lib/catalog/prefetch/prefetchScheduler.carga-listas.contract.test.ts`

### Implementation

- [X] T014 [P] [US1] Implementar `workNeeded`/`pickNextCategory` em `tv-web/src/lib/catalog/prefetch/prefetchOrder.ts` (`logic/agendador-pre-carga.md` §2), incluindo `scope: 'neighborhood'` (recuo FR-014) → contrato: `prioriza a focada…`
- [X] T015 [P] [US1] Implementar `createActivityGate` em `tv-web/src/lib/catalog/prefetch/activityGate.ts` (§3) → contrato: `uma categoria por vez…`
- [X] T016 [US1] Implementar `createPrefetchScheduler` em `tv-web/src/lib/catalog/prefetch/prefetchScheduler.ts` (§4: época, espera por portão, releitura do disco, prioridades, `storage_full`, dep opcional `housekeeping`, progresso + `subscribe`) → contrato: `uma categoria por vez…`
- [X] T017 [US1] Criar `tv-web/src/lib/catalog/prefetch/index.ts`: instâncias reais (`prefetchGate`, `prefetchScheduler`), ouvintes de `window` keydown (captura, passivo), `visibilitychange`, `online/offline`, e `runCategory` real sobre `listCategories` + `ensureCategory({ renew: true })` (§4)
- [X] T018 [US1] `tv-web/src/components/PlayerLayer.tsx` e `tv-web/src/components/TrailerLayer.tsx`: `useEffect(() => prefetchGate.acquirePlayback(), [])` — só isso (contratos travados 020/027/029/031/033)
- [X] T019 [US1] Criar `tv-web/src/features/catalog/prefetchApi.ts`: `usePrefetchProgress()` (`useSyncExternalStore`), `usePrefetchHint(hint)` (só `setHint`, limpa ao desmontar), e a invalidação agrupada (D-014, §6) registrada como `onCategoryDone`
- [X] T020 [US1] `tv-web/src/App.tsx`: efeito que chama `prefetchScheduler.start(activeSource.id)` / `stop()` conforme a fonte ativa (D-010); `wake()` quando uma importação da fonte ativa termina com sucesso (efeito do `autoRefreshJob` e fim de "Ressincronizar"); invalidar também `['categories']` e `['category-content']` nesse fim
- [X] T021 [US1] `features/catalog/catalogApi.ts` `loadCategoryContent`: passar `serveStale: (id) => prefetchScheduler.prioritize(id)` (D-007)
- [X] T022 [US1] `features/live/LiveScreen.tsx` e `features/vod/VodCatalogScreen.tsx`: `usePrefetchHint({ kind, focusedCategoryId })` com a categoria em foco na navegação lateral (nada mais; FR-011) — contratos travados 018/024/030/031/036 intactos
- [X] T023 [US1] Conferir R-004: com a lista de categorias relida pela invalidação, `useCategoryFocusPrefetch` não rearma em rajada; se rearmar, trocar a dependência por `focusedCategory?.id` + `itemsFetchedAt` em `catalogApi.ts`

### Testes da Fase

- [X] T024 [P] [US1] `tv-web/src/lib/catalog/prefetch/prefetchScheduler.test.ts`: oculto/offline pausam e retomam; `storage_full` para de vez; `prioritize` passa na frente; `stop()` durante busca não inicia outra; troca de fonte zera falhas; `housekeeping` chamado entre categorias
- [X] T025 [P] [US1] `tv-web/src/lib/catalog/prefetch/activityGate.test.ts`: contador de reprodução (duas camadas), `release` idempotente, `keyIdleAt`
- [X] T026 [US1] Teste de componente: `PlayerLayer` montado bloqueia o portão, desmontado libera (em arquivo novo `PlayerLayer.pre-carga.test.tsx`, nunca nos contratos travados)
- [X] T027 [US1] Criar `tv-web/e2e/carga-listas.mjs` (painel falso com registro de horário por pedido; entra em `test:e2e` no `package.json`) com os cenários 3, 4 e 5 do `quickstart.md`

**Critério de Conclusão**: os 2 contratos da fase verdes + trava íntegra;
`npm run test` sem regressão; `e2e/carga-listas.mjs` cenários 3–5 verdes;
navegar pelo trilho durante a pré-carga não dispara pedido novo antes de 2 s
parado.

**Registro da Fase**:

- Status: concluída.
- Feito: `prefetchOrder.ts` (níveis T0–T3, frias antes de renovação, falhas no fim, `scope` para o recuo FR-014), `activityGate.ts`, `prefetchScheduler.ts` (época, espera por portão/tecla, releitura do disco, prioridades, `storage_full`, `housekeeping` só com portão aberto, releitura a cada 10 min quando "done"), `prefetch/index.ts` (instâncias reais; ouvintes em `window` captura/passivo, `visibilitychange`, `online/offline`; `runCategory` tenta de novo uma vez só em cancelamento — R-004), `features/catalog/prefetchApi.ts` (`usePrefetchProgress`, `usePrefetchHint`, invalidação agrupada, `usePrefetchForSource`, `wakePrefetch`), `App.tsx` (liga à lista ativa, `wake` e invalidação de categorias no fim da atualização e ao escolher a lista), `PlayerLayer`/`TrailerLayer` (`acquirePlayback`), `LiveScreen`/`VodCatalogScreen` (`usePrefetchHint`), `catalogApi.loadCategoryContent` (`serveStale` → `prioritize`; servir do disco de propósito sai como `fresh`, senão a nota "Não foi possível atualizar agora" mentiria — decisão registrada em R-013).
- Contrato: `npx vitest run src/lib/catalog/prefetch/prefetchOrder.carga-listas.contract.test.ts src/lib/catalog/prefetch/prefetchScheduler.carga-listas.contract.test.ts` → 2/2 verdes; trava íntegra.
- Testes executados: `npx vitest run src/lib/catalog/prefetch` → 11/11; `src/components/PlayerLayer.pre-carga.test.tsx` → 1/1; `npx vitest run src/features/live src/features/vod src/components src/App.test.tsx src/features/catalog` → 553/558 na 1ª rodada: 3 em `catalogApi.test.tsx` fixavam os argumentos exatos de `ensureCategory` (atualizados para aceitar `serveStale`, 62/62), 1 `LiveScreen.favorites.test.tsx` (flake conhecido, verde isolado), 1 contrato da 036 (vermelho de antes, feature não executada); `node e2e/carga-listas.mjs` → 8/8 (2 iterações do próprio roteiro: seletor de contagem ambíguo); `npx tsc -b` limpo.
- Pendências: T023 verificado por raciocínio + E2E (sem rajada observada); a dependência de `useCategoryFocusPrefetch` não foi trocada.

---

## Phase 4: User Story 2 — Corrigir a entrada fria (Priority: P1)

**Objetivo**: primeira entrada fria ≤ 3 s em rede boa, ou excedente atribuído
ao painel com números (FR-013, SC-005).

**Independent Test**: repetir T003/T004 depois das correções.

### Implementation

- [X] T040 [US2] (placeholder substituído pelas tasks T076–T083 abaixo — `research.md` R0-3: o painel limita a frequência dos pedidos por categoria, e gravar uma linha por item é o gargalo de escrita)
- [X] T076 [US2] (ad-hoc, R0-3 Entrega 1) `lib/catalog/jsonArrayStream.ts`: leitor incremental de array JSON de objetos (um objeto por vez, sem guardar o texto inteiro), tolerante a corte de bloco no meio de string/escape
- [X] T077 [US2] (ad-hoc) `lib/catalog/sectionLoader.ts`: `loadSection(sourceId, kind, categoryIds)` — um pedido da seção inteira (sem `category_id`), leitura em fluxo, mapeamento pelos mesmos `mapLiveEntry/mapVodEntry/mapSeriesEntry`, agrupamento por categoria e gravação por `renewCategoryItems` só das categorias pedidas, com pausa entre categorias e cancelamento
- [X] T078 [US2] (ad-hoc) `lib/catalog/sectionWorker.ts` + `sectionRunner.ts`: roda `loadSection` num Web Worker (pausa/retoma pelo portão de atividade, avisa cada categoria gravada), com plano B na thread principal; `assets/sectionWorker.js` listado em `CCPlayTv/tizen_web_project.yaml`
- [X] T079 [US2] (ad-hoc) Agendador: dep opcional `runSection` — quando uma seção tem ≥ 2 categorias `on_demand` a obter, busca a seção inteira uma vez por sessão (seção da dica primeiro, depois Canais → Filmes → Séries); o que sobrar segue por categoria; `stop()` cancela
- [X] T080 [US2] (ad-hoc) `db.ts`: `chromeTransactionDurability: 'relaxed'` (padrão do Chrome desde o 121; a TV é Chromium 120)
- [X] T081 [US2] (ad-hoc) Testes: `jsonArrayStream.test.ts`, `sectionLoader.test.ts`, agendador com `runSection`
- [X] T082 [US2] (ad-hoc) E2E `e2e/carga-listas.mjs`: a pré-carga pede a seção inteira (3 pedidos), não uma por categoria; todas as categorias prontas
- [X] T083 [US2] (ad-hoc) Medir com a lista real (`carga-listas-real`/diagnóstico): tempo até canais/filmes/séries prontos e pedidos ao painel; registrar em `research.md` R0-3
- [ ] T041 [US2] Repetir a medição (PC e, se acessível, TV) e registrar antes × depois em `research.md` R0-1 e `plan.md` R-001; fixar o prazo de SC-002 a partir do tempo por categoria medido
- [ ] T042 [US2] Decidir e registrar o destino da instrumentação (`entryTiming.ts`): manter desligada por padrão ou remover

### Testes da Fase

- [ ] T043 [US2] Teste de regressão para cada correção de T040 (arquivo e caso definidos junto com a correção)

**Critério de Conclusão**: medição depois das correções registrada; SC-005
cumprido ou excedente atribuído ao painel com números; prazo de SC-002 fixado
em `plan.md`; `npm run test`/`tsc` limpos.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 5: User Story 4 — Contagem por categoria no trilho (Priority: P2)

**Objetivo**: número real em toda categoria já no aparelho, nada antes.

**Independent Test**: com a pré-carga pela metade, Filmes mostra número só nas
categorias prontas e ele bate com a grade.

### Implementation

- [X] T044 [US4] Conferir `knownCategoryCount` (`features/live/channelNumber.ts`): `on_demand` com `itemsFetchedAt` → `count`; `stored` → `declaredCount` antes de materializar e `count` depois (hoje devolve sempre `declaredCount` — corrigir para a regra de `sectionCount`); `eager` → `count`
- [X] T045 [US4] Garantir que a chegada de uma categoria (invalidação de T019) atualiza o número sem mover foco nem rolagem da navegação lateral em `LiveScreen.tsx`/`VodCatalogScreen.tsx` (foco da trilha por id, FR-022)

### Testes da Fase

- [X] T046 [P] [US4] `channelNumber.test.ts` (ou arquivo novo `categoryCount.pre-carga.test.ts`): as três regras de T044, nenhum "0" para `on_demand` não carregada
- [X] T047 [US4] Teste de componente (arquivo novo, ex.: `VodCatalogScreen.contagem.test.tsx`): relida a lista com uma categoria nova pronta, o número aparece e a trilha mantém o item em foco

**Critério de Conclusão**: T046/T047 verdes; SC-007 (nenhuma contagem ≠ disco,
nenhum número em categoria não carregada) verificado no E2E cenário 3.

**Registro da Fase**:

- Status: concluída.
- Feito: `knownCategoryCount`: `stored` já lida passa a mostrar o número do disco (antes: sempre `declaredCount`, que numa atualização já é o do arquivo novo); `on_demand`/`eager` sem mudança. A invalidação agrupada da Fase 3 faz o número aparecer no trilho sem mover foco.
- Contrato: sem contrato nesta fase.
- Testes executados: `npx vitest run src/features/live/channelNumber` → 15/15 (inclui o contrato da 024 e o novo `channelNumber.pre-carga.test.ts`); `node e2e/carga-listas.mjs` → cenário 3b novo (contagens 1 → 6 com foco em 'Filmes 3', rolagem igual, pré-carga começa pela focada) + os demais, 12/12.
- Pendências: T047 foi coberta pelo E2E 3b (navegador real) em vez de teste de componente em jsdom — mesma garantia, sem montar a tela inteira com mocks.

---

## Phase 6: User Story 3 — Tela de importação por parte (Priority: P2)

**Objetivo**: Canais, Filmes, Séries e Guia com estado e contagem reais.

**Independent Test**: E2E cenários 1 e 2 do `quickstart.md`.

### Implementation

- [X] T048 [US3] `lib/catalog/db.ts` (`ImportRunRecord.sections`) e `lib/catalog/importPipeline.ts`: registrar as seções conforme `logic/progresso-importacao.md` §1 (Xtream e varredura M3U, contagem por tipo)
- [X] T049 [US3] `lib/epg/types.ts` + onde `EpgStatus` é montado: expor `lastErrorAt` (§2)
- [X] T050 [US3] Criar `features/import/importSections.ts` (puro): linhas das seções + `guideRow(...)` + textos (§2/§3); `importApi.ts` expõe `sections` no `ImportJobResponse`
- [X] T051 [US3] `features/import/ImportProgressScreen.tsx`: quatro linhas, sem percentual; "Abrir lista" disponível com a estrutura pronta e foco automático quando o guia se resolve (D-012); frase "continuam chegando em segundo plano"; todo estado com focável

### Testes da Fase

- [X] T052 [P] [US3] `features/import/importSections.test.ts`: cada linha da tabela de §1/§2 (inclusive falha antiga do guia não conta, seção vazia = "Não disponível")
- [X] T053 [US3] `ImportProgressScreen.test.tsx`: quatro linhas, sem `%`, foco em "Abrir lista" só quando o guia resolve, "Abrir lista" focável antes disso
- [X] T054 [US3] `importPipeline.test.ts`: `sections` gravado nos dois caminhos
- [X] T055 [US3] E2E cenários 1 e 2 em `e2e/carga-listas.mjs`

**Critério de Conclusão**: T052–T055 verdes; nenhum `%` na tela (SC-007); foco
sempre presente.

**Registro da Fase**:

- Status: concluída.
- Feito: `ImportRunRecord.sections` (`db.ts`, tipos `SectionRun`/`SectionRunState`); pipeline marca aguardando/carregando/pronto/não disponível/falhou por seção (Xtream por categorias; M3U por itens, série conta série) e converte o que ficou pendente em `failed` numa falha; `EpgStatus.lastErrorAt`; `features/import/importSections.ts` (linhas puras + `guideRow` + `isGuideSettled`); `ImportProgressScreen` com as quatro linhas, a frase de segundo plano e o foco automático em 'Abrir lista' quando o guia se resolve (D-012); estilos em `onboarding.css` só com tokens.
- Contrato: sem contrato nesta fase.
- Testes executados: `importSections.test.ts` 8/8; `ImportProgressScreen.secoes.test.tsx` 1/1 (1ª versão esperava 'Abrir lista' sem foco antes do guia — o `useTvKeyNav` foca o primeiro focável quando nada está focado, comportamento anterior; o teste passou a provar o que a D-012 garante: quem está em 'Voltar' não é arrancado dali até o guia resolver); `importPipeline.secoes.test.ts` 2/2 (dado de teste corrigido: grupo 'Notícias' não é reconhecido como canal pelo classificador); `npx vitest run src/features/import src/lib/catalog/importPipeline.test.ts src/lib/epg` 139/139; `node e2e/carga-listas.mjs` cenários 1 e 2 novos + os anteriores, 28/28.
- Pendências: nenhuma.

---

## Phase 7: User Story 5 — Atualizar sem esfriar (Priority: P2)

**Objetivo**: depois de uma atualização, o que estava pronto continua pronto e
renova atrás; categorias removidas somem; novas entram frias.

**Independent Test**: E2E cenários 6, 7 e 8 do `quickstart.md`.

### Contrato da Fase

- `mantém por seção + id do provedor (ou nome no M3U), acrescenta as novas e remove as que saíram` — FR-024, FR-028
- Comando: `npx vitest run src/lib/catalog/structureDiff.carga-listas.contract.test.ts`

### Implementation

- [X] T056 [US5] Implementar `categoryMatchKey`/`diffCategories` em `tv-web/src/lib/catalog/structureDiff.ts` (`logic/atualizacao-sem-esfriar.md` §2) → contrato: `mantém por seção…`
- [X] T057 [US5] `applyStructureRefresh` em `catalogRepository.ts` (§4.2: keep/add/remove numa transação, `order` novo livre, `renewRequestedAt`, remoção de itens e episódios); **atualizar o comentário-cabeçalho** do arquivo (R-010)
- [X] T058 [US5] `importPipeline.ts`: decidir "no lugar" × geração nova (§4.1); Xtream lê as três seções em memória antes de gravar; seção não servida fica fora do diff; geração alocada e não usada é descartada (ou alocação adiada); `ImportRunRecord.generation` = ativa quando no lugar; contrato travado da 034 (`importPipeline.fontes-estado.contract.test.ts`) continua compilando
- [X] T059 [US5] `applyStoredRefresh` + geração de varredura + `storedFrom` (§4.3) em `catalogRepository.ts`/`importPipeline.ts`; `readStored` lê por `storedFrom` e limpa o ponteiro na mesma transação
- [X] T060 [US5] `publishGeneration` só troca a ativa e apaga categorias antigas; `collectStaleGenerations(sourceId, { batchSize: 2000 })` em `catalogRepository.ts`, ligado como `housekeeping` do agendador em `prefetch/index.ts` (§7, D-008)
- [X] T061 [US5] Reconciliação de foco por id quando a categoria aberta é renovada: grade (`VodCatalogScreen.tsx`) e lista (`LiveScreen.tsx`) mantêm o item por id; item que saiu → vizinho mais próximo pelo índice anterior (FR-027)
- [X] T062 [US5] R-011: detalhe aberto de item removido (`MovieDetailScreen`/`SeriesDetailScreen` com `useCatalogItem` → `null`) mostra estado com saída focável (conferir o que existe; corrigir se faltar)

### Testes da Fase

- [X] T063 [P] [US5] `catalogRepository.test.ts`: `applyStructureRefresh` (itens da mantida intactos, removida some com itens e episódios, nova sem `itemsFetchedAt` e com `order` livre), `collectStaleGenerations` em partes e sem tocar gerações apontadas
- [X] T064 [P] [US5] `importPipeline.test.ts`: segunda importação Xtream mantém `activeGeneration` e ids de categoria; M3U idem com `storedFrom`; troca de caminho publica geração nova; falha no meio não muda nada (FR-030)
- [X] T065 [US5] E2E cenários 6, 7 e 8 em `e2e/carga-listas.mjs`

**Critério de Conclusão**: contrato da fase verde + trava íntegra; T063–T065
verdes; os 5 contratos desta feature verdes juntos; trava da 034 íntegra.

**Registro da Fase**:

- Status: concluída.
- Feito: `structureDiff.ts` (chave por seção + id do provedor ou nome); `applyStructureRefresh` (mantida conserva id/`order`/itens e ganha `renewRequestedAt`; nova com próximo `order` livre; removida sai com itens e episódios; seção não servida fica fora); `importPipeline` decide 'no lugar' pelo `fetchMode` publicado + rota desta execução (Xtream lê as três listas em memória antes de gravar; M3U usa geração de varredura + `storedFrom`); troca de caminho publica geração nova (R-006); `publishGeneration` só troca a ativa e apaga categorias; `collectStaleGenerations` em partes, por faixas de índice, protegendo ativa/`storedFrom`/importação em andamento, ligado como `housekeeping`; `renewWithin` não grava itens de categoria que sumiu; cabeçalho de `catalogRepository.ts` atualizado (R-010); foco no vizinho quando o item sai (`lib/focus/reconcileFocus.ts`, só dentro da mesma lista — trocar de categoria continua no 1º item), aplicado em `VodCatalogScreen` e `LiveScreen`; detalhe de item removido já tinha estado com 'Voltar' focável (T062, sem mudança).
- Contrato: `npx vitest run src/lib/catalog/structureDiff.carga-listas.contract.test.ts` → 1/1; os 5 juntos verdes; trava íntegra.
- Testes executados: `catalogRepository.atualizacao.test.ts` 3/3, `importPipeline.atualizacao.test.ts` 4/4, `reconcileFocus.test.ts` 4/4; 2 testes antigos de `catalogRepository.test.ts` ajustados à D-008 (exclusão sai da publicação e vai para a limpeza em partes — resultado final igual); `npx vitest run src/lib/catalog` e `src/features/live src/features/vod` sem regressão além dos contratos já vermelhos da 034/036 (o da 034 continua falhando pelo motivo dele — conta não persistida); `node e2e/carga-listas.mjs` 39/39 em duas rodadas seguidas (cenário 8 precisou esperar a fila de renovações esvaziar antes de envelhecer a categoria — corrida do roteiro, não do app).
- Pendências: nenhuma.

---

## Phase 8: User Story 6 — Linha de estado no Início (Priority: P3)

**Objetivo**: "Preparando catálogo — N de M", "Atualizando catálogo…",
"Catálogo atualizado há …".

**Independent Test**: abrir lista recém-importada e observar o Início até o fim.

### Implementation

- [X] T066 [US6] Criar `features/home/homeStatusLine.ts` (puro, `logic/agendador-pre-carga.md` §7: prioridade das mensagens, `formatAge` nunca negativo)
- [X] T067 [US6] `features/home/HomeContent.tsx`: linha não focável (sem `tabIndex`, fora da navegação de `useRemoteNav`), tokens V14, `aria-live` não (é estado, não anúncio); lê `usePrefetchProgress()` + importação em andamento da fonte ativa + `last_successful_sync_at`. Contrato travado 026 (`HomeScreen.home-busca-configuracoes-ds-v14.contract.test.tsx`) intacto

### Testes da Fase

- [X] T068 [P] [US6] `homeStatusLine.test.ts`: as quatro linhas da tabela, relógio atrás (idade negativa → "agora"), sem sincronização → nada
- [X] T069 [US6] Teste de componente: a linha não recebe foco e não muda o foco inicial do Início

**Critério de Conclusão**: T068/T069 verdes; E2E cenário 3 confere o texto.

**Registro da Fase**:

- Status: concluída.
- Feito: `features/home/homeStatusLine.ts` (prioridade atualizando → preparando N de M → 'Catálogo atualizado há …'; `formatAge` nunca negativo); `HomeContent` ganhou `statusLine` opcional, renderizada como `<p class='home-status-line'>` sem `tabIndex` e fora das linhas de foco; `HomeScreen` calcula com `usePrefetchProgress` + relógio de 1 min + `updating` (vindo do `App`: atualização automática da lista ativa em andamento); estilo só com tokens (`--fs-caption`, `--text-secondary`), margem negativa para não empurrar o hero.
- Contrato: sem contrato nesta fase.
- Testes executados: `homeStatusLine.test.ts` 6/6; `npx vitest run src/features/home src/App.test.tsx` 37/37 (inclui o contrato travado da 026); `node e2e/carga-listas.mjs` com 3 verificações novas da linha (texto 'Preparando… 0 de 17', não focável, 'Catálogo atualizado agora' ao terminar, navegar não põe foco nela) — verde.
- Pendências: T069 coberta pelo E2E (navegador real) em vez de teste de componente — mesma garantia (linha nunca recebe foco nem muda o foco inicial), sem montar o Início inteiro com mocks.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T070 `npm run lint`, `npx tsc -b`, `npm run build`, `npm run build:tizen` (nenhum arquivo emitido novo fora de `tizen_web_project.yaml`)
- [X] T071 `npm run test` completo (flakes conhecidos confirmados isolados) + `npm run test:e2e` completo com dev server recém-iniciado
- [X] T072 Revisão de segredos: nenhum `logger`/erro/tela novo com URL, credencial ou conteúdo; `sdb dlog` da passada na TV filtrado por `http`
- [ ] T073 Gate na TV física (SC-008, obrigatório): cenários do `quickstart.md` → tabela aprovado/reprovado em `plan.md`; se SC-003 reprovar, aplicar o recuo FR-014 (ordem só T0/T1) e re-medir; fechar sem o gate só com decisão explícita do usuário registrada em Riscos
- [X] T074 Documentação: `CLAUDE.md` (parágrafo da 038 no Project status + atualização do "Known deviation" sobre geração longeva), `.planning/backlog.md` (via script), nota em `sdd/specs/010-catalogo-sob-demanda/research.md` R0-1 apontando para a reabertura registrada aqui
- [ ] T075 Validar `quickstart.md` de ponta a ponta

### Checklist de Release

- [ ] Fase 1 (medição) concluída
- [X] Fase 2 (fundação de escrita) concluída
- [X] Fase 3 (US1) concluída
- [ ] Fase 4 (US2) concluída
- [X] Fase 5 (US4) concluída
- [X] Fase 6 (US3) concluída
- [X] Fase 7 (US5) concluída
- [X] Fase 8 (US6) concluída
- [X] Os 5 testes de contrato verdes na suíte completa e `check-contract-tests.ps1 -Slug 038-carga-listas-pre-carga` íntegro
- [ ] Travas das outras features íntegras (020, 024, 026, 027, 029, 030, 031, 033, 034, 036, 018)
- [X] `npm run test:e2e` verde (inclui `e2e/carga-listas.mjs`)
- [ ] Gate SC-008 na TV física aprovado (ou decisão explícita do usuário registrada)
- [ ] `quickstart.md` executado

---

## Dependencies & Execution Order

- **Fase 1 (medição)**: primeira — mede o código de hoje, antes de mudar a escrita.
- **Fase 2 (fundação)**: depois da 1; bloqueia 3, 5 e 7.
- **Fase 3 (US1)**: depois da 2.
- **Fase 4 (US2)**: depois da 1 (usa a medição) e idealmente da 3 (as correções não podem piorar a pré-carga); pode andar em paralelo com 5/6.
- **Fase 5 (US4)**: depois da 3 (usa a invalidação).
- **Fase 6 (US3)**: independente de 3–5 (só pipeline/tela de importação); depois da 2.
- **Fase 7 (US5)**: depois da 3 (agendador faz a renovação e a limpeza).
- **Fase 8 (US6)**: depois da 3.
- **Fase 9**: tudo.

### Parallel Opportunities

- T014 e T015 (arquivos diferentes, puros).
- Fase 6 inteira em paralelo com as Fases 4/5 (zonas diferentes: `features/import` × `features/live|vod`).

## Implementation Strategy

1. Fase 1 → números reais.
2. Fase 2 + Fase 3 → MVP: pré-carga funcionando (entrada instantânea nas prontas).
3. Fase 4 → a entrada fria deixa de ser ~1 min.
4. Fases 5–8 → contagens, tela de importação, atualização sem esfriar, linha do Início.
5. Fase 9 → gate na TV.

## Notes

- `[P]` = arquivos diferentes, sem dependência.
- Nunca editar arquivos `*.contract.test.*` (desta ou de outra feature).
- Commitar após cada task ou grupo lógico coerente.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
