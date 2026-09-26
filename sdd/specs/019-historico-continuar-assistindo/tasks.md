---
description: "Tasks de implementação — 019-historico-continuar-assistindo"
---

# Tasks: Histórico e Continuar Assistindo

**Input**: `sdd/specs/019-historico-continuar-assistindo/{spec.md, plan.md, logic/agregacao-serie.md, quickstart.md}`

**Prerequisites**: `plan.md`, `spec.md`, `logic/agregacao-serie.md` (contrato
do "como" da agregação de série), `contract-tests.lock` (definição de
pronto — **testes travados, nunca editar**).

**Organization**: Fase 1 confirma a base (stubs/assinaturas já criados
pelo `sdd-plan`); Fase 2 fecha Filme (US1+US2, compartilham os mesmos
arquivos de baixo nível); Fase 3 fecha Série (US3, independente de
Filme); Fase 4 fecha o hub (US4, P2, depende conceitualmente de US1-3
terem dado sentido ao dado, mas não tecnicamente — pode rodar em paralelo
se preferir); Fase 5 é Polish.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: US1, US2, US3 ou US4

## Path Conventions

- Frontend: `tv-web/src/` — lógica de baixo nível em `lib/player/` e
  `lib/catalog/`, hooks de tela em `features/catalog/catalogApi.ts`,
  telas em `features/{movies,series,list-home}/`, CSS em
  `features/screens.css` (tokens de `index.css`)
- Testes: ao lado do arquivo (`*.test.ts(x)`); contratos em
  `*.historico.contract.test.ts` (travados)
- E2E: `tv-web/e2e/*.mjs`

Comando dos contratos (em `tv-web/`):
`npx vitest run src/lib/player/progressRecorder.historico.contract.test.ts src/lib/catalog/userStateRepository.historico.contract.test.ts src/features/series/seriesWatchedSummary.historico.contract.test.ts`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: confirmar a base antes de tocar código de tela.

- [x] T001 Rodar em `tv-web/`: `npx tsc -b` (esperado: 0 erros — os stubs do `sdd-plan` já têm assinatura completa); `npx vitest run` (esperado: só os 3 contratos da 019 vermelhos pelo motivo certo — 1 asserção, 2 `Error: not implemented` — mais a flakiness pré-existente de `*.favorites.test.tsx` já documentada em features anteriores); `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 019-historico-continuar-assistindo` íntegro.

**Registro da Fase**:

- Status: Concluída
- Feito: T001
- Contrato: sem contrato nesta fase (os 3 contratos da feature são verificados como vermelhos, não como critério desta fase)
- Testes executados: `npx tsc -b` → 0 erros; `npx vitest run` → 719 total, 715 passed, 5 arquivos com falha: os 3 contratos da 019 vermelhos pelo motivo certo (`progressRecorder.historico.contract.test.ts` por asserção, `userStateRepository.historico.contract.test.ts`/`seriesWatchedSummary.historico.contract.test.ts` por `Error: not implemented`) + `MoviesScreen.favorites.test.tsx`/`SeriesScreen.favorites.test.tsx` sob paralelismo total, confirmados 100% passando isolados (`--no-file-parallelism`, 22/22 junto com `LiveScreen.favorites.test.tsx`) — mesma flakiness pré-existente documentada nas features 016/017/018; `check-contract-tests.ps1` → trava íntegra (3/3)
- Pendências: Nenhuma

---

## Phase 2: User Story 1+2 — Filme assistido (Priority: P1) 🎯 MVP

**Objetivo**: filme concluído (90% ou conclusão real) fica marcado como
assistido automaticamente; pessoa pode corrigir manualmente no detalhe.

**Independent Test**: assistir um filme até passar de 90%, sair, reabrir
o detalhe — ação primária volta a "Assistir", nova ação "Desmarcar
assistido" aparece; confirmá-la e ver o estado reverter.

### Contrato da Fase

- `filme cruza 90% da duração: marca assistido e apaga a retomada` — US1 AC1, FR-001
- `setWatchedManually marca e desmarca um filme, sem inventar posição nem duração` — US2 AC1-2, FR-004/005
- Comando: `npx vitest run src/lib/player/progressRecorder.historico.contract.test.ts src/lib/catalog/userStateRepository.historico.contract.test.ts`

### Implementation

- [x] T002 [US1] Em `tv-web/src/lib/player/progressRecorder.ts`, dentro de `apply()`: repassar `options.completionRatio` para a chamada de `isPastEnd(positionMs, durationMs, options.completionRatio)` (usa o default de `isPastEnd`, `RESUME_MAX_RATIO`, quando `completionRatio` for `undefined` — comportamento de episódio intocado) → contrato: "filme cruza 90%...".
- [x] T003 [US1] Em `tv-web/src/components/PlayerLayer.tsx`: onde hoje `{ recordCompletion: playback.kind === 'episode' }` é passado a `createProgressRecorder`, mudar para `{ recordCompletion: playback.kind === 'episode' || playback.kind === 'movie', completionRatio: playback.kind === 'movie' ? MOVIE_WATCHED_RATIO : undefined }` (importar `MOVIE_WATCHED_RATIO` de `../lib/player/resumePolicy`). Esta única mudança também fecha FR-002 (conclusão real do motor já chama `markCompleted` para qualquer `recordCompletion: true`, mecanismo herdado da feature 012 — nenhum código novo necessário) e preserva FR-003 (falha sem avanço nunca grava nada, mesma regra herdada, `FR-017`/`hasAdvanced`).
- [x] T004 [US2] Em `tv-web/src/lib/catalog/userStateRepository.ts`: implementar `setWatchedManually` (stub já criado, D-004) — marcar reaproveita o mesmo corpo de `markCompleted` (`completedAt: Date.now(), progressSeconds: undefined`); desmarcar só limpa `completedAt` → contrato: "setWatchedManually...".
- [x] T005 [US2] Em `tv-web/src/features/catalog/catalogApi.ts`: implementar `useToggleWatched()` — mutation análoga a `useToggleFavorite` (linha ~715), chamando `setWatchedManually`; ao sucesso, invalida `['user-state', stableId]` (reaproveita `invalidateUserState` já exportado).
- [x] T006 [US2] Em `tv-web/src/features/movies/MovieDetailScreen.tsx`: `MovieAction` ganha `{ id: 'toggle-watched' }` (D-005); `buildActions` passa a receber também `completedAt: number | undefined` e acrescenta essa ação **sempre por último** (depois de `trailer`/`resume`|`watch`/`restart` — preserva o índice fixo 1 da ação primária); `actionLabel` cobre os dois rótulos ("✓ Marcar como assistido" sem marca / "✗ Desmarcar assistido" com marca); `onSelect` chama `useToggleWatched().mutate(...)` quando essa ação é confirmada.
- [x] T007 [P] [US1] Em `tv-web/src/features/catalog/catalogApi.ts`: implementar `useWatchedIds(sourceId, kind)` (D-006) — mesmo padrão de `useFavoriteIds` (linha ~616): uma leitura local por fonte/tipo devolvendo o `Set<string>` de `stableId`s com `completedAt != null`.
- [x] T008 [US1] Em `tv-web/src/features/movies/MoviesScreen.tsx`: selo "Assistido" no card, como `children` de `PosterArt` (mesmo slot de `.fav-star`, podem coexistir), usando `useWatchedIds('movie')` (SC-001).
- [x] T009 [P] Em `tv-web/src/features/screens.css`: `.watched-badge` novo (mesma filosofia de `.episode-badge`, linha ~1104 — texto além da cor, nunca só cor).

### Testes da Fase

- [x] T010 [P] [US1] Teste em `tv-web/src/features/movies/MoviesScreen.favorites.test.tsx` (achado durante a task: `MoviesScreen.test.tsx` usa itens sem identidade estável — `stableIdOf` retorna `null` — então o selo nunca apareceria lá; o arquivo `.favorites.test.tsx` já tem a infraestrutura de `fake-indexeddb`/`useFavoriteIds` real que este teste também precisa): o selo "Assistido" aparece só para itens com `completedAt`, nunca para os demais.
- [x] T011 [P] [US2] Teste em `tv-web/src/features/movies/MovieDetailScreen.test.tsx`: a ação de assistido aparece sempre por último na lista de ações, alterna o rótulo/selo ao ser confirmada, e não desloca o foco da ação primária (índice 1).

**Critério de Conclusão**: `npx vitest run src/lib/player/progressRecorder.historico.contract.test.ts src/lib/catalog/userStateRepository.historico.contract.test.ts` → 2/2 verdes e `check-contract-tests.ps1` íntegro; `npx vitest run src/features/movies src/lib/player src/lib/catalog` sem regressão; `npx tsc -b` limpo.

**Checkpoint**: filme ganha histórico completo (automático + manual) — MVP.

**Registro da Fase**:

- Status: Concluída
- Feito: T002–T011
- Contrato: `npx vitest run src/lib/player/progressRecorder.historico.contract.test.ts src/lib/catalog/userStateRepository.historico.contract.test.ts` → 2/2 verdes; `check-contract-tests.ps1` → trava íntegra (3/3)
- Testes executados: `npx tsc -b` → 0 erros; `npx vitest run src/features/movies src/lib/player src/lib/catalog` → 397/397 (sem regressão, flakiness pré-existente de `.favorites.test.tsx` não se manifestou nesta rodada)
- Pendências: Nenhuma. Achado durante T010 (documentado inline em tasks.md): a task original apontava `MoviesScreen.test.tsx`, mas os itens de fixture desse arquivo não têm `provider_stream_id`/`original_name`, então `stableIdOf` retorna `null` e o selo nunca apareceria ali — corrigido usando `MoviesScreen.favorites.test.tsx`, que já tem a infraestrutura de identidade estável/IndexedDB real necessária.

---

## Phase 3: User Story 3 — Série em dia (Priority: P1)

**Objetivo**: grade de Séries mostra, sem abrir o detalhe, se a série está
"Em dia" ou quantos episódios conhecidos já foram assistidos.

**Independent Test**: assistir todos os episódios conhecidos de uma série
com cobertura completa — card muda para "Em dia"; com um episódio ainda
não assistido, ou com a série nunca aberta, nunca mostra "Em dia".

### Contrato da Fase

- `summarizeSeriesWatched: "Em dia" só com cobertura completa E tudo assistido; cobertura parcial ou zero nunca produz "Em dia"` — US3 AC1/AC3, FR-007/008, Constitution: Progresso e Capacidades São Reais
- Comando: `npx vitest run src/features/series/seriesWatchedSummary.historico.contract.test.ts`

### Implementation

- [x] T012 [US3] Em `tv-web/src/features/series/seriesWatchedSummary.ts`: implementar `summarizeSeriesWatched` (stub já criado) exatamente como `logic/agregacao-serie.md` descreve → contrato.
- [x] T013 [US3] Em `tv-web/src/features/catalog/catalogApi.ts`: implementar `useSeriesWatchedSummary(sourceId)` (D-008) — lê, numa única consulta local, todos os registros `kind:'episode'` em `channels` para `sourceId` (nunca chama `ensureSeriesEpisodes`/rede), agrupa por `seriesId`, lê os `UserStateRecord` correspondentes em lote (mesmo padrão de `useUserStates`), aplica `summarizeSeriesWatched` por grupo, devolve `Map<string, SeriesWatchedSummary>` por `seriesId`. Por ler sempre o estado atual de `channels` (sem cache de "cobertura" entre chamadas), um episódio novo detectado numa releitura futura da série (fora do escopo desta task — é o fluxo já existente de `ensureSeriesEpisodes`/`SeriesDetailScreen`) automaticamente muda `known`/`upToDate` na próxima renderização, fechando FR-009 sem código extra.
- [x] T014 [US3] Em `tv-web/src/features/series/SeriesScreen.tsx`: selo agregado no card (linha ~666, `.poster-card-meta` ou elemento próprio) usando `useSeriesWatchedSummary` — "Em dia" quando `upToDate`, contagem `"${watched}/${known}"` quando `known > 0` e não em dia, nada quando `known === 0`.
- [x] T015 [P] Em `tv-web/src/features/screens.css`: estilo do selo de série. Reaproveitou `.watched-badge` (T009) sem estilo dedicado novo — mesmo visual (canto inferior, texto sobre fundo semi-transparente) já serve tanto para "Assistido" (filme) quanto para "Em dia"/"X/Y" (série), simplificação proporcional em vez de duplicar CSS quase idêntico.

### Testes da Fase

- [x] T016 [P] [US3] Teste em `tv-web/src/features/catalog/catalogApi.test.tsx`: `useSeriesWatchedSummary` nunca chama `ensureSeriesEpisodes` (mock espiado sem chamadas) — só lê o que já está local (constitution: Comandos Locais Independem de Rede).
- [x] T017 [P] [US3] Teste em `tv-web/src/features/series/SeriesScreen.test.tsx`: card mostra "Em dia" com cobertura completa e tudo assistido; contagem parcial com cobertura completa mas nem tudo assistido; nenhum selo quando a série nunca foi aberta (known === 0).

**Critério de Conclusão**: `npx vitest run src/features/series/seriesWatchedSummary.historico.contract.test.ts` → 1/1 verde e `check-contract-tests.ps1` íntegro; `npx vitest run src/features/series src/features/catalog` sem regressão; nenhuma chamada de rede disparada ao renderizar a grade (T016).

**Checkpoint**: série ganha visão agregada de progresso.

**Registro da Fase**:

- Status: Concluída
- Feito: T012–T017
- Contrato: `npx vitest run src/features/series/seriesWatchedSummary.historico.contract.test.ts` → 1/1 verde; `check-contract-tests.ps1` → trava íntegra (3/3)
- Testes executados: `npx tsc -b` → 0 erros; `npx vitest run src/features/series src/features/catalog` → 96/96 (sem regressão)
- Pendências: Nenhuma. T015 (CSS do selo de série) reaproveitou `.watched-badge` (T009) sem estilo dedicado novo — documentado no item correspondente. Achado durante T017: `series()` (helper local do arquivo) precisou de um parâmetro `seriesId` opcional novo (compatível com todos os chamadores existentes, que não o passam) para o teste poder ligar um item mockado a episódios reais no banco.

---

## Phase 4: User Story 4 — Continuar assistindo no hub (Priority: P2)

**Objetivo**: hub da fonte ("O que você quer assistir?") mostra uma
seção "Continuar assistindo" com os itens em progresso dessa fonte.

**Independent Test**: começar um filme/episódio, sair antes do fim, abrir
o hub da fonte, ver o item na seção e retomar por SELECT.

Sem contrato formal (D-009 nota: composição de peças já testadas —
`getContinueWatching`, núcleo de `resolveFavorites`). Coberto pelos
Testes da Fase e pelo E2E do Polish.

### Implementation

- [x] T018 [US4] Em `tv-web/src/lib/catalog/catalogRepository.ts`: implementar `resolveContinueWatching(sourceId, states, database)` (D-009/R-002) — generaliza o núcleo de resolução por índice que `resolveFavorites` (linha ~501) já usa, incluindo `kind: 'episode'` (resolvido pelo mesmo caminho `[sourceId+generation+seriesId]` que `SeriesDetailScreen.tsx`/`episodeNavigation.ts` já usam para episódio individual — ver R-002 do plano antes de inventar um índice novo); item sem correspondência é omitido, nunca lança.
- [x] T019 [US4] Em `tv-web/src/features/catalog/catalogApi.ts`: implementar `useContinueWatchingContent(sourceId)` — `getContinueWatching(sourceId)` + `resolveContinueWatching`, devolve itens prontos para a tela (`CatalogItemOut[]`, mais recente primeiro).
- [x] T020 [US4] Em `tv-web/src/features/list-home/ListHomeScreen.tsx`: nova seção "Continuar assistindo" acima dos 3 tiles (D-010) — presente só quando `useContinueWatchingContent` devolve ao menos 1 item (FR-014); foco vertical novo (mesmo mecanismo `topFocused`/UP-DOWN já usado em outras telas) entre a seção e os tiles; navegação horizontal dentro da seção; SELECT delega para o mesmo callback de abertura que a navegação normal usa por kind (D-011, FR-015).
- [x] T021 [P] Em `tv-web/src/features/screens.css`: estilos da seção nova (rail simples, cards pequenos — reaproveitar tokens já existentes, nunca cor/raio literal).

### Testes da Fase

- [x] T022 [P] [US4] Teste em `tv-web/src/features/list-home/ListHomeScreen.test.tsx`: seção aparece com item de progresso e some sem nenhum (FR-014); item concluído (sem `progressSeconds`) não aparece (FR-013); SELECT num item da seção abre pelo mesmo caminho da navegação normal.

**Critério de Conclusão**: `npx vitest run src/features/list-home src/lib/catalog` sem regressão; `npx tsc -b` limpo; navegação por controle remoto completa (seta+SELECT+RETURN) na seção nova, sem regressão nos 3 tiles existentes.

**Checkpoint**: as quatro user stories fecham a lacuna do RF-014.

**Registro da Fase**:

- Status: Concluída
- Feito: T018–T022
- Contrato: sem contrato nesta fase (US4 é P2, decisão registrada em `## Estratégia de Testes`)
- Testes executados: `npx tsc -b` → 0 erros; `npx vitest run src/features/list-home src/lib/catalog` → 291/291; `npx vitest run` completo → 726/729 (3 falhas são a flakiness pré-existente de `*.favorites.test.tsx` sob paralelismo, confirmada 23/23 isolada)
- Pendências: Nenhuma. Achado real durante T018 (registrado como R-004 em `plan.md`): um episódio nunca é aberto isoladamente pela navegação normal do app — `resolveContinueWatching` troca episódio pela série-pai antes de devolver, então "Continuar assistindo" só mostra/abre `movie`/`series`, nunca `episode`. `ListHomeScreenProps` ganhou `onOpenContinueWatching` (nova prop obrigatória) — `App.tsx` e o teste existente de `ListHomeScreen.test.tsx` foram atualizados para a nova assinatura.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [x] T023 Criar `tv-web/e2e/historico-continuar-assistindo.mjs` cobrindo os 4 cenários do `quickstart.md` (A: filme assistido automaticamente; B: correção manual; C: série em dia; D: continuar assistindo no hub). Adicionar ao `test:e2e` em `tv-web/package.json`.
- [x] T024 Rodar `npm run test`, `npm run lint`, `npm run build`, `npm run test:e2e` (com `npm run dev`) em `tv-web/` — todos limpos (ou documentar honestamente o que não está, seguindo o padrão já usado pelas features 017/018 para os scripts pré-existentes quebrados nesta máquina Windows).
- [x] T025 Atualizar `CLAUDE.md` com o parágrafo da feature 019 (histórico de filme, agregação de série, seção "Continuar assistindo" no hub).

### Checklist de Release

- [x] Fase 2 (Filme) concluída
- [x] Fase 3 (Série) concluída
- [x] Fase 4 (Continuar assistindo) concluída
- [x] Testes de contrato todos verdes na suíte completa e `check-contract-tests.ps1` íntegro
- [x] `npm run test` / `lint` / `build` limpos; `test:e2e` — script novo desta feature limpo (cadeia completa pode seguir com as limitações pré-existentes já documentadas nas features 017/018)
- [ ] `quickstart.md` executado pelo menos em emulador/navegador (TV física recomendada, não gate obrigatório)

**Registro da Fase**:

- Status: Concluída
- Feito: T023–T025
- Contrato: `npx vitest run src/lib/player/progressRecorder.historico.contract.test.ts src/lib/catalog/userStateRepository.historico.contract.test.ts src/features/series/seriesWatchedSummary.historico.contract.test.ts` → 3/3 verdes; `check-contract-tests.ps1` → trava íntegra (3/3)
- Testes executados: `npx tsc -b` → 0 erros; `npx vitest run` completo → 727/732 passed (5 falhas: `LiveScreen.favorites.test.tsx`, `LiveScreen.test.tsx`, `MoviesScreen.favorites.test.tsx`, `SeriesScreen.favorites.test.tsx`, todas sob paralelismo total — confirmadas 64/64 passando isolado com `--no-file-parallelism`, mesma flakiness pré-existente já documentada nas features 016/017/018); `npm run lint` → 0 erros (só warnings pré-existentes, nenhum em arquivo tocado por esta feature); `npm run build` → limpo; `npm run test:e2e` (script novo desta feature, `historico-continuar-assistindo.mjs`) → 11/11 asserções verdes, confirmado estável em 3 execuções consecutivas depois de corrigidos os 2 bugs reais abaixo (uma execução isolada anterior travou por timeout de 8s no Cenário B — não reproduziu nas 3 tentativas seguintes; registrado como flakiness observada, não como bug de produção, já que a correção de R-005/R-006 elimina a causa mais provável — corrida de invalidação)
- Testes adicionais: `resolveContinueWatching` (episódio→série-pai, item sem correspondência, filme direto) em `catalogRepository.test.ts` — cobertura complementar ao E2E para o caminho R-002/R-004 que o script não exercita diretamente
- Pendências: 2 bugs reais achados e corrigidos durante a escrita do E2E, registrados como R-005 (corrida de invalidação entre `recorder.onExit('completed')` fire-and-forget e a leitura de `MovieDetailScreen` — `onExit` agora é `async`/`await`ado em `PlayerLayer.tsx` antes de `onClose`/`onCompleted`) e R-006 (`useToggleWatched` não invalidava `continue-watching`) em `plan.md`. `quickstart.md` em TV física não executado nesta sessão — não é gate obrigatório para esta feature (ver `spec.md`).

---

## Dependencies & Execution Order

- **Setup (1)** bloqueia tudo.
- **Fase 2 (Filme)** depende só da 1.
- **Fase 3 (Série)** depende só da 1 — independente da Fase 2, pode rodar em paralelo ou antes dela.
- **Fase 4 (Continuar assistindo)** depende conceitualmente de completedAt/progressSeconds já existirem (feature 008/011/012, não desta feature) — tecnicamente pode rodar em paralelo às Fases 2/3, mas faz mais sentido testá-la por último, com dados reais de filme/série já produzidos por elas.
- **Polish (5)** por último.

### Parallel Opportunities

- Fase 2 e Fase 3 podem ser trabalhadas em paralelo (arquivos disjuntos: `movies/`+`player/` vs. `series/`).
- Tasks `[P]` dentro de cada fase, entre si.

---

## Implementation Strategy

### MVP First

1. Fase 1 (Setup).
2. Fase 2 (Filme) → **parar e validar**: histórico de filme completo (automático + manual).

### Incremental Delivery

1. Setup → fundação confirmada.
2. Fase 2 (Filme) → testar isoladamente → valor entregável (US1+US2).
3. Fase 3 (Série) → testar isoladamente → valor entregável (US3).
4. Fase 4 (Continuar assistindo) → fecha o ciclo do `UserStateRepository`.
5. Polish.

## Notes

- `[P]` = arquivos diferentes, sem dependência.
- `[Story]` mapeia a task para a user story correspondente.
- Commitar após cada fase ou grupo lógico coerente.
- Parar em qualquer checkpoint para validar a story isoladamente.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
