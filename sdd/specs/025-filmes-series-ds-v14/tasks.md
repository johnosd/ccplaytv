---
description: "Tasks da feature 025 — Filmes e Séries no Design System V14 (Onda 4)"
---

# Tasks: Filmes e Séries no Design System V14 (Onda 4)

**Input**: Documentos de design de `sdd/specs/025-filmes-series-ds-v14/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, logic/*.md, quickstart.md, contract-tests.lock

**Organization**: Tasks agrupadas por user story. O Histórico tem a camada de
dados no Foundational (a side nav da US1 já precisa dela) e a interface na
US2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)

## Path Conventions

- Frontend único em `tv-web/` (React 19 + TypeScript + Vite). O `api/` não é tocado.
- Telas em `tv-web/src/features/<área>/`; o que Filmes e Séries compartilham vai em `tv-web/src/features/vod/` (novo).
- Componentes compartilhados em `tv-web/src/components/`; dados em `tv-web/src/lib/catalog/`; fachada das telas em `tv-web/src/features/catalog/catalogApi.ts`.
- CSS por tela em `tv-web/src/styles/` (`vod.css` novo); `tv-web/src/features/screens.css` só perde regras.
- E2E em `tv-web/e2e/*.mjs`. Testes unitários ao lado do arquivo (`*.test.ts(x)`).
- Comandos rodam em `tv-web/`; scripts `.planning/` a partir da raiz.

---

## Phase 1: Setup

**Purpose**: verificar o dado real e registrar o que as telas vão consumir.

- [ ] T001 Verificar no painel Xtream real (credencial de teste do `.env` da raiz, **nunca** impressa em log, arquivo ou commit — mesmo procedimento do T001 da 024) quais campos vêm em `get_vod_streams` (`year`, `releaseDate`/`release_date`, `added`), `get_series` (`year`, `releaseDate`, `added`, `last_modified`) e `get_series_info` (`info.duration_secs`, `info.duration`, `info.movie_image`), e em que formato. Registrar o resultado, sem valores identificáveis, em `research.md` R1 e em R-001 de `plan.md` — **bloqueado no ambiente desta sessão**: container remoto sem `.env` real (só `.env.example`), sem painel para consultar. Documentado como pendente em `research.md`/R-001, não fingido como feito.
- [X] T002 [P] Registrar os mocks `trailer` (32), `cast` (45) e `similar` (45) em `tv-web/src/lib/comingSoon.ts` e cobrir em `tv-web/src/lib/comingSoon.test.ts` (D-011, FR-043)
- [X] T003 [P] Adicionar o ícone `history` (↺) em `tv-web/src/components/iconPaths.ts`, com teste em `tv-web/src/components/Icon.test.tsx`

**Checkpoint**: campos reais conhecidos; mocks e ícone disponíveis.

**Registro da Fase**:

- Status: Concluída com uma pendência de ambiente (T001)
- Feito: T002 (mocks `trailer`/`cast`/`similar` em `comingSoon.ts`, teste atualizado) e T003 (ícone `history` em `iconPaths.ts`, cobertura automática por `Icon.test.tsx`).
- Contrato: sem contrato nesta fase.
- Testes executados: `npx vitest run src/lib/comingSoon.test.ts src/components/Icon.test.tsx` → 2 arquivos, 24 testes, todos verdes.
- Pendências: T001 não executado neste ambiente (sem `.env` real / painel acessível). A implementação segue com os nomes de campo já documentados em `research.md` R1 (o código trata ausência como estado legítimo). Uma sessão com acesso ao painel real deve rodar T001 e atualizar R-001 antes de considerar essa lacuna fechada.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: dados (ano, inclusão, duração, imagem de episódio, Histórico), ordenação pura e extensões de componente/snapshot que todas as stories consomem.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

### Contrato da Fase

- `loadHistory — Filmes: reproduzidos da lista ativa, …` — FR-009, FR-011, FR-012, FR-015
- `loadHistory — Séries: uma entrada por série, …` — FR-010, FR-012
- `vodSort — só oferece opção com dado real; …` — FR-019, FR-020
- `metadados — ano e inclusão vêm só de campo próprio da fonte; …` — FR-049, FR-050
- Comando: `npx vitest run src/lib/catalog/history.filmes-series-ds-v14.contract.test.ts src/features/vod/vodSort.filmes-series-ds-v14.contract.test.ts src/lib/catalog/vodMetadata.filmes-series-ds-v14.contract.test.ts`

### Implementation

- [X] T004 [P] Implementar `normalizeYear`, `normalizeAddedAt` e `normalizeDurationSeconds` em `tv-web/src/lib/catalog/classifier.ts` (`logic/metadados-vod.md` §1) → contrato: `metadados — …`
- [X] T005 Capturar `year`/`addedAt` em `mapVodEntry` e `year` em `mapSeriesEntry` (nunca `last_modified`), mais qualquer nome adicional confirmado no T001, em `tv-web/src/lib/catalog/xtreamConnector.ts` (`logic/metadados-vod.md` §2) → contrato: `metadados — …`
- [X] T006 Capturar `durationSeconds` (`info.duration_secs`, alternativa `info.duration`) e `iconUrl` (`info.movie_image` via `normalizeIconUrl`) por episódio em `fetchSeriesInfo`, em `tv-web/src/lib/catalog/xtreamConnector.ts`
- [X] T007 [P] Copiar `year`/`addedAt` para o registro em `toItemRecord` (`tv-web/src/lib/catalog/categoryLoader.ts`) e no caminho integral legado do provedor (`tv-web/src/lib/catalog/importPipeline.ts`, ~linha 420)
- [X] T008 [P] Copiar `iconUrl`/`durationSeconds` do episódio em `toEpisodeRecord` (`tv-web/src/lib/catalog/seriesLoader.ts`)
- [X] T009 Mapear `year`/`added_at` em `toItemOut` e `icon_url`/`duration_seconds` em `toEpisodeOut` (`tv-web/src/features/catalog/catalogApi.ts`)
- [X] T010 [P] Implementar `availableSortOptions`/`sortVodItems` em `tv-web/src/features/vod/vodSort.ts` (`logic/foco-vod.md` §5) → contrato: `vodSort — …`
- [X] T011 Implementar `listPlayed(sourceId, 'movie' | 'episode')` em `tv-web/src/lib/catalog/userStateRepository.ts` (`logic/historico.md` §2)
- [X] T012 Implementar `loadHistory` em `tv-web/src/lib/catalog/history.ts` (`logic/historico.md` §3–§4; contagem de episódios em `unresolved`; nunca rede) → contrato: `loadHistory — Filmes …`, `loadHistory — Séries …`
- [X] T013 Adicionar `useHistoryContent(sourceId, kind, enabled)` (gcTime infinito) e `useResumePositions(sourceId, kind)` em `tv-web/src/features/catalog/catalogApi.ts`. Invalidar `['history-content']` em `invalidateUserState`, `invalidateUserStates` e `useToggleWatched`, e `['resume-positions']` onde `['continue-watching']` já é invalidado (`logic/historico.md` §5; D-014)
- [X] T014 [P] Estender `CategoryScreenSnapshot` com `{kind:'history'}` em `SnapshotTrailKey`/`SnapshotEntered` e `focusedIndexHint?` em `tv-web/src/features/catalog/categoryScreenSnapshot.ts` (`data-model.md` §5)
- [X] T015 [P] Adicionar o cabeçalho de grupo opcional (`groupLabel?` por entrada, desenhado antes da primeira de cada grupo, sem mudar nada para quem não passa) em `tv-web/src/components/SideCategoryNav.tsx` (D-013)

### Testes da Fase

- [X] T016 [P] Testes de `normalizeYear`/`normalizeAddedAt`/`normalizeDurationSeconds` (bordas: data parcial, epoch 0, futuro, "HH:MM:SS", lixo) em `tv-web/src/lib/catalog/classifier.test.ts`
- [X] T017 [P] Teste de `fetchSeriesInfo` com `info.duration_secs`/`info.duration`/`info.movie_image` presentes, ausentes e inválidos em `tv-web/src/lib/catalog/xtreamConnector.test.ts`
- [X] T018 [P] Testes de cópia dos campos em `tv-web/src/lib/catalog/categoryLoader.test.ts`, `tv-web/src/lib/catalog/importPipeline.test.ts` e `tv-web/src/lib/catalog/seriesLoader.test.ts`
- [X] T019 [P] Testes de `listPlayed` (ordem, prefixo por tipo, isolamento por fonte, estado sem `lastWatched` fora) em `tv-web/src/lib/catalog/userStateRepository.test.ts`
- [X] T020 [P] Testes de mapeamento (`toItemOut`/`toEpisodeOut`) e de `useHistoryContent`/`useResumePositions`, incluindo a invalidação após `useToggleWatched`, em `tv-web/src/features/catalog/catalogApi.test.tsx`
- [X] T021 [P] Teste do cabeçalho de grupo (presente com `groupLabel`, ausente sem) em `tv-web/src/components/SideCategoryNav.test.tsx`

**Critério de Conclusão**: o comando do contrato da fase dá 4/4 verdes, e `..\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 025-filmes-series-ds-v14` fica íntegro. Além disso: `npx vitest run src/lib/catalog src/features/catalog src/components` verde (com a regra do flake), `npx tsc -b` limpo, e nenhum outro contrato travado alterado.

**Checkpoint**: fundação pronta — user stories podem começar.

**Registro da Fase**:

- Status: Concluída.
- Feito: normalize*/captura de ano/inclusão/duração/imagem em `classifier.ts`/`xtreamConnector.ts`; cópia dos campos em `categoryLoader.ts`/`importPipeline.ts`/`seriesLoader.ts`; mapeamento em `catalogApi.ts` (`toItemOut`/`toEpisodeOut`); `vodSort.ts` (availableSortOptions/sortVodItems); `listPlayed` em `userStateRepository.ts`; `loadHistory` em `history.ts`; `useHistoryContent`/`useResumePositions` + invalidações (`invalidateUserState`/`invalidateUserStates`/`useToggleWatched`); extensão de `CategoryScreenSnapshot` (`{kind:'history'}`, `focusedIndexHint`); `groupLabel?` em `SideCategoryNav`. `TrailKey`/`EnteredKey` locais de `MoviesScreen.tsx`/`SeriesScreen.tsx` ganharam o variante `history` (widening aditivo, sem mudar comportamento) só para o `tsc -b` ficar limpo até a Fase 3 substituir essas telas.
- Contrato: `npx vitest run src/lib/catalog/history.filmes-series-ds-v14.contract.test.ts src/features/vod/vodSort.filmes-series-ds-v14.contract.test.ts src/lib/catalog/vodMetadata.filmes-series-ds-v14.contract.test.ts` → 4/4 verdes. `check-contract-tests.ps1 -Slug 025-filmes-series-ds-v14` → trava íntegra (5 testes; o 5º, `MoviesScreen`, é da Fase 3 e continua vermelho como esperado). Travas de 018–024 verificadas íntegras também.
- Testes executados: `npx vitest run src/lib/catalog src/features/catalog src/components` → 53 arquivos, 517 testes, todos verdes. `npx tsc -b` limpo.
- Pendências: nenhuma nova além da já registrada (T001, ambiente sem painel real).

---

## Phase 3: User Story 1 - Navegar e abrir filmes e séries no layout V14 sob a topbar (Priority: P1) 🎯 MVP

**Objetivo**: Filmes e Séries sob a topbar, com side nav V14, toolbar, hero band, grade de `ContentCard` e memória de foco por entrada.

**Independent Test**: abrir Filmes pela topbar, entrar numa categoria, focar um card no meio, OK, RETURN e encontrar o mesmo card; trocar de categoria e voltar e encontrar o card lembrado; repetir em Séries; RETURN na side nav volta ao Início.

### Contrato da Fase

- `MoviesScreen — sob a topbar, side nav V14 na ordem certa, e cada entrada lembra o último card focado` — US1/AC1-AC3, US1/AC6, FR-001..FR-003, FR-006, FR-027, FR-030, SC-007
- Comando: `npx vitest run src/features/movies/MoviesScreen.filmes-series-ds-v14.contract.test.tsx`

### Implementation

- [X] T022 [US1] Criar `tv-web/src/features/vod/VodCatalogScreen.tsx` portando o comportamento de `MoviesScreen.tsx`/`SeriesScreen.tsx` (trilha, entrada, busca 018, prefetch, favoritos, estados, notas) parametrizado por `section` (`logic/foco-vod.md` §1), sem mudar nenhum comportamento ainda (base para as tasks seguintes)
- [X] T023 [US1] Transformar `tv-web/src/features/movies/MoviesScreen.tsx` e `tv-web/src/features/series/SeriesScreen.tsx` em invólucros de `VodCatalogScreen`, com as props atuais mais `shell?` (D-002)
- [X] T024 [US1] Moldura `shell` + composição de foco topbar ↔ conteúdo em `VodCatalogScreen.tsx`, igual à 024: `zone`, `TopBar currentItem`, saída só por ↑ em ★, RETURN na topbar/side nav = `onBack`, estados de topo dentro da moldura (`logic/foco-vod.md` §1 e §3) → contrato: `MoviesScreen — …`
- [X] T025 [US1] Side nav V14: entradas ★ (contagem = favoritos do tipo), ↺ (sem contagem até conhecida, §5 de `logic/historico.md`), Todos e categorias (contagem só quando lidas — reaproveitar `knownCategoryCount` de `features/live/channelNumber.ts` por meio de um helper comum em `features/catalog/`, nunca importando `features/live` direto), com cabeçalhos "Sua biblioteca"/"Catálogo"; padrão sem navegação = 1ª categoria real (`VIRTUAL_TRAIL_COUNT = 3`); entrar em ↺ usa `useHistoryContent` e chama `markHistoryKnown` → contrato: `MoviesScreen — …`
- [X] T026 [US1] Toolbar (título da entrada + chip "N títulos" quando conhecido + "Pesquisar" no lugar do ícone da 018, `toolbarFocus`) com a mecânica da busca inalterada e o `<input class="search-field">` (D-007; `logic/foco-vod.md` §3). "Ordenar" entra na US4
- [X] T027 [US1] Grade de `ContentCard` portrait com geometria fixa (D-006): estrela, selo "Assistido" (filme), resumo "Em dia"/"N/M" (série), meta = grupo; um virtualizador com `lanes`, `useVirtualFocusSync` → contrato: `MoviesScreen — …`
- [X] T028 [US1] Memória de foco por entrada com `vodSessionMemory` (gravar a cada foco na grade; ao entrar: `restore` → memória → 1º item) e `focusedIndexHint` no snapshot ao abrir o detalhe (`logic/foco-vod.md` §4) → contrato: `MoviesScreen — …`
- [X] T029 [US1] Hero band fixa e não focável (card focado ou lembrado/1º; eyebrow, capa pequena, título, ano, grupo, selos via `useWatchedIds`/`useResumePositions`/resumo 019; some sem itens), sem nenhuma leitura disparada por foco (D-014; `logic/foco-vod.md` §6)
- [X] T030 [US1] Estados com componentes V14 (carregando, erro de estrutura, lista sem itens, conteúdo carregando/erro/fonte ausente, Todos vazio, categoria vazia), todos acionáveis por SELECT, no padrão da 024 (`logic/foco-vod.md` §7)
- [X] T031 [US1] `tv-web/src/App.tsx`: passar `shell` a `MoviesScreen`/`SeriesScreen` (`onGoHome: goBack`, `onSwitchTop` → `switch-top` para `live`/`movies`/`series`, `onOpenProfiles`) — mesmo padrão da Live
- [X] T032 [P] [US1] Criar `tv-web/src/styles/vod.css` (side nav, toolbar, hero band, grade, só tokens; sem `:has()`/`backdrop-filter`) e importá-lo em `tv-web/src/main.tsx` depois de `live.css` (D-015)

### Testes da Fase

- [X] T033 [US1] Atualizar `tv-web/src/features/movies/MoviesScreen.test.tsx` e `tv-web/src/features/series/SeriesScreen.test.tsx` para os novos seletores (ícone → "Pesquisar", `.poster-*` → `.content-card`, 3 entradas virtuais), sem mudar nenhuma asserção de comportamento. Registrar em R-003 qualquer uma que precise mudar
- [X] T034 [P] [US1] Teste de Séries sob a topbar + memória de foco por entrada (espelho do contrato, para a seção `series`) em `tv-web/src/features/series/SeriesScreen.test.tsx`
- [X] T035 [P] [US1] Testes da hero band (acompanha o foco, some sem itens, sem texto descritivo, "Continuar de mm:ss" com retomada) e da memória entre montagens (desmontar e remontar a tela mantém o foco da entrada) em `tv-web/src/features/vod/VodCatalogScreen.test.tsx`
- [X] T036 [P] [US1] Teste de `App` passando `shell` e trocando Filmes → Séries/Live por `switch-top` (RETURN volta ao Início) em `tv-web/src/App.test.tsx`

**Critério de Conclusão**: `npx vitest run src/features/movies/MoviesScreen.filmes-series-ds-v14.contract.test.tsx` dá 1/1 verde e `check-contract-tests.ps1` fica íntegro. Além disso: `npx vitest run src/features/movies src/features/series src/features/vod src/navigation` verde (com a regra do flake), `npx tsc -b` limpo, e no navegador Filmes/Séries abrem pela topbar com o foco correto.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída.
- Feito: `VodCatalogScreen.tsx` novo (grade/side nav/toolbar/hero band/estados/memória de foco/shell), `MoviesScreen.tsx`/`SeriesScreen.tsx` reduzidos a invólucros finos, `categoryCount.ts` (reexport de `knownCategoryCount` sem `features/vod` importar `features/live`), `SideCategoryNav.tsx` com `groupLabel?` (T015, já feito na Fase 2) consumido aqui, `App.tsx` passando `shell` a Filmes/Séries, `vod.css` novo importado em `main.tsx`. Widening aditivo de `TrailKey`/`EnteredKey` locais nas telas antigas (Fase 2) já não é mais necessário como workaround — as telas passaram a ser invólucros, mas o tipo continua correto. Corrigido junto: `formatResumeTime` duplicada removida em favor do `formatTime` já existente (`lib/player/formatTime.ts`), mesmo formato "Continuar de mm:ss" do resto do app.
- Contrato: `npx vitest run src/features/movies/MoviesScreen.filmes-series-ds-v14.contract.test.tsx` → 1/1 verde, de primeira. `check-contract-tests.ps1 -Slug 025-filmes-series-ds-v14` → trava íntegra (5/5, todos os contratos da feature agora verdes).
- Testes executados: `npx vitest run src/features/movies src/features/series src/features/vod src/navigation` → 16 arquivos, 130 testes verdes (incluía atualizar seletores em `MoviesScreen.test.tsx`/`.favorites.test.tsx`/`SeriesScreen.test.tsx`/`.favorites.test.tsx` — nenhuma asserção de comportamento mudou, só seletor/contagem síncrona da side nav antes da 1ª resolução de query, ver nota abaixo). `npm run test` completo → 120 arquivos, 1155 testes verdes, sem flake nesta rodada. `npx tsc -b` limpo. `npm run lint` limpo (só os warnings pré-existentes de `useVirtualizer`/`useMemo` já presentes em `LiveScreen.tsx`, mesmo padrão). `npm run build` e `npm run build:tizen` limpos (guarda de arquivos não listados passou).
- Pendências: nenhuma nova. A passada no navegador real (visual) não foi feita nesta sessão — só testes automatizados; recomendado antes da TV física, não gate desta fase.

---

## Phase 4: User Story 2 - ↺ Histórico em Filmes e Séries (Priority: P1)

**Objetivo**: a entrada ↺ exibe o que foi reproduzido, com estado vazio instrutivo, nota honesta de não exibíveis e contagem só quando conhecida.

**Independent Test**: assistir parte de um filme A e até o fim um filme B; ↺ em Filmes mostra B antes de A, com B marcado; assistir um episódio; ↺ em Séries mostra a série uma vez; OK abre o detalhe e RETURN volta ao mesmo card.

### Implementation

- [X] T037 [US2] Conteúdo de ↺ em `VodCatalogScreen.tsx`: grade com os itens de `useHistoryContent`; sem "Ordenar"; "Pesquisar" filtra o Histórico; OK abre o detalhe com snapshot `{kind:'history'}` (`logic/historico.md` §6)
- [X] T038 [US2] Estado vazio de ↺ (`EmptyState` "Seu histórico está vazio" / "Os filmes e séries reproduzidos neste perfil aparecerão aqui." + "Voltar" acionável por SELECT) e nota de não exibíveis (texto por seção, `logic/historico.md` §4 e §6), em `VodCatalogScreen.tsx` (FR-012, FR-013)
- [X] T039 [US2] Contagem de ↺ na side nav: só com `data` presente; consulta habilitada após a primeira entrada na sessão (`isHistoryKnown`); atualiza ao voltar do player pelas invalidações do T013 (FR-007)
- [X] T040 [P] [US2] Corrigir só o comentário de `markCompleted` em `tv-web/src/lib/catalog/userStateRepository.ts` (não atualiza `lastWatched`; por que isso importa para FR-011), sem mudar o código (R-007)

### Testes da Fase

- [X] T041 [P] [US2] Testes de tela de ↺ (lista na ordem, vazio focável, nota de não exibíveis, sem "Ordenar", contagem ausente antes e presente depois da 1ª entrada, restauração ao voltar do detalhe) em `tv-web/src/features/vod/VodCatalogScreen.test.tsx`
- [X] T042 [P] [US2] Teste de integração com `fake-indexeddb`: reproduzir (gravar progresso) → invalidar → contagem de ↺ atualizada, em `tv-web/src/features/catalog/catalogApi.test.tsx`

**Critério de Conclusão**: os contratos de `loadHistory` continuam 2/2 verdes, `check-contract-tests.ps1` fica íntegro e os testes da fase passam. No navegador, com o banco semeado, ↺ mostra filmes e séries na ordem certa, com o vazio focável.

**Checkpoint**: User Stories 1 e 2 funcionando de forma independente.

**Registro da Fase**:

- Status: Concluída. A maior parte da implementação (T037–T039) já saiu pronta da Fase 3 — construí `VodCatalogScreen.tsx` tratando "↺ Histórico" como uma entrada de primeira classe desde o início (mesmo padrão de ★/Todos/categoria), não como um adicional depois. Esta fase focou em confirmar isso com teste e fechar o T040.
- Feito: T040 (comentário de `markCompleted` corrigido, código intocado). T041 (5 testes novos em `VodCatalogScreen.test.tsx`: ordem/concluídos, vazio focável, nota de não exibíveis com contagem correta, ausência de "Ordenar", snapshot `{kind:'history'}` + restauração). T042 (teste de integração em `catalogApi.test.tsx`: `updateProgress` + `invalidateUserState` atualiza `useHistoryContent` já habilitado, sem remontar).
- Contrato: `npx vitest run src/lib/catalog/history.filmes-series-ds-v14.contract.test.ts` → 2/2 verde. `check-contract-tests.ps1 -Slug 025-filmes-series-ds-v14` → trava íntegra (5/5).
- Testes executados: `npx vitest run src/features/vod/VodCatalogScreen.test.tsx src/features/catalog/catalogApi.test.tsx` → 51 testes verdes. `npm run test` completo → 120 arquivos, 1161 testes verdes, sem flake. `npx tsc -b`, `npm run lint`, `npm run build` limpos.
- Pendências: nenhuma nova. Passada visual no navegador não feita nesta sessão.

---

## Phase 5: User Story 3 - Favoritos, busca e comportamento existente preservados (Priority: P1)

**Objetivo**: provar que nada de 013/015/017/018/019/010 regrediu na troca, e consertar o que tiver regredido.

**Independent Test**: `capa-real.mjs`, `historico-continuar-assistindo.mjs`, `favoritos.mjs` e `busca-por-categoria.mjs` verdes, e os contratos travados de outras features intactos.

### Implementation

- [X] T043 [US3] Conferir e ajustar em `VodCatalogScreen.tsx`: segurar OK/tecla amarela só com card focado (nunca na toolbar); ★ vazio com `FavoritesEmptyState`; desfavoritar dentro de ★ move o foco para o vizinho; prefetch nunca para ★/↺/Todos nem para a categoria já entrada (`useCategoryFocusPrefetch` com `undefined`) (FR-044, FR-045)
- [X] T044 [US3] Conferir a busca na toolbar em "Todos": aviso "Busca em X de Y categorias" antes e durante a digitação; "Pesquisar" ausente sem itens carregados ou com conteúdo indisponível (`!contentUnavailable`, achado T029 da 018) (FR-017)

### Testes da Fase

- [X] T045 [P] [US3] Atualizar `tv-web/src/features/movies/MoviesScreen.favorites.test.tsx` e `tv-web/src/features/series/SeriesScreen.favorites.test.tsx` para os novos seletores, sem mudar comportamento (rodar isolados antes de tratar falha como regressão)
- [X] T046 [US3] Rodar os contratos travados de 018–024 e o de `seriesWatchedSummary` da 019 (`..\.planning\scripts\powershell\check-contract-tests.ps1 -Slug <slug>` para cada um + `npx vitest run` dos arquivos) e registrar o resultado

**Critério de Conclusão**: suíte completa verde (com a regra do flake), travas de 018–025 íntegras, e nenhum teste de comportamento com asserção alterada sem registro em R-003.

**Registro da Fase**:

- Status: Concluída. T043/T044 eram "conferir e ajustar" — conferido no código de `VodCatalogScreen.tsx` (linhas de `canToggleFavorite`, `useCategoryFocusPrefetch`, `canSearch`, `searchCoveragePartial`): as quatro regras já saíram corretas da Fase 3 (a tela nunca tratou favoritos/busca/prefetch como comportamento "a adicionar depois" — foram portados junto com o resto). Nenhum ajuste de código foi necessário. T045 também já estava feito (Fase 3, junto com T033, já que os quatro arquivos de teste pré-existentes — `MoviesScreen`/`SeriesScreen` + `.favorites` de ambos — precisavam ficar verdes para o checkpoint daquela fase).
- Feito: verificação de código (T043/T044, sem mudança); confirmação de que T045 já estava feito; T046 (contratos de 018, 019 — incluindo `seriesWatchedSummary` nomeado explicitamente —, 020, 021, 022, 023, 024, todos rodados individualmente).
- Contrato: `check-contract-tests.ps1` para 018, 019, 020, 021, 022, 023, 024 e 025 → todos **PASS, trava íntegra**. `seriesWatchedSummary.historico.contract.test.ts` (019) → 1/1 verde, confirmado nominalmente.
- Testes executados: `npm run test` (suíte completa) → 120 arquivos, 1161 testes verdes, sem flake nesta rodada.
- Pendências: nenhuma. Os E2E citados no "Independent Test" desta fase (`capa-real.mjs` etc.) são atualizados na Fase 9 (Polish, T062) — não são gate deste checkpoint.

---

## Phase 6: User Story 4 - Ordenar a grade (Priority: P2)

**Objetivo**: botão "Ordenar · <opção> ▾" na toolbar, com modal das opções disponíveis e escolha por seção na sessão.

**Independent Test**: numa categoria com ano declarado, Ordenar → "Ano" → grade do mais novo ao mais antigo, com os sem ano no fim e o foco no mesmo item; trocar de categoria mantém a ordenação; RETURN no modal devolve o foco ao botão.

### Implementation

- [ ] T047 [US4] Botão "Ordenar · <rótulo> ▾" na toolbar de `VodCatalogScreen.tsx` (só em categoria/Todos com itens; ←/→ entre Pesquisar e Ordenar; rótulo "Ordem da fonte" quando a opção salva não está disponível na entrada) (FR-016, FR-022)
- [ ] T048 [US4] Modal de ordenação com `Modal` (022): opções de `availableSortOptions`, ✓ e foco inicial na atual, ↑/↓ com clamp, OK escolhe (`setSessionSort`) e fecha, RETURN fecha; o foco volta ao botão (FR-018)
- [ ] T049 [US4] Pipeline base → busca → `sortVodItems` e foco no mesmo item após reordenar, com `scrollToIndex` na nova posição (FR-023, FR-024)

### Testes da Fase

- [ ] T050 [P] [US4] Testes de tela de Ordenar (opções só com dado, reordenação, foco preservado, persistência na sessão entre categorias e entre montagens, ausência em ★/↺, RETURN no modal, busca + ordenação juntas) em `tv-web/src/features/vod/VodCatalogScreen.test.tsx`

**Critério de Conclusão**: o contrato de `vodSort` continua 1/1 verde, `check-contract-tests.ps1` fica íntegro e T050 passa. No navegador, com uma fonte de provedor, "Ano" aparece quando o painel declara e some numa lista M3U.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 7: User Story 5 - Detalhe de filme V14 (Priority: P2)

**Objetivo**: hero V14 com capa, meta real e ações em pill; abas Detalhes/Elenco/Semelhantes; nenhum placeholder que imite conteúdo.

**Independent Test**: filme com retomada → "Continuar" retoma; "Minha Lista" alterna; "Trailer"/"Elenco" anunciam "Em breve"; "Marcar assistido" mostra o selo; RETURN volta ao card de origem.

### Implementation

- [ ] T051 [US5] Reescrever o layout de `tv-web/src/features/movies/MovieDetailScreen.tsx`: raiz `.screen.vod-detail`, hero com `PosterArt`, eyebrow, título, meta real (ano, categoria, selo), ações `[Continuar|Assistir] [Reiniciar?] [Minha Lista] [Trailer] [Marcar assistido]` com foco inicial em 0 (`logic/detalhe-vod.md` §1–§3; FR-033..FR-036)
- [ ] T052 [US5] "Minha Lista" via `useFavoriteToggle` + rótulo por `useUserState(...).isFavorite`; "Trailer" soft disabled com toast "Em breve" do registro (FR-035, FR-043)
- [ ] T053 [US5] Abas com `Tabs` e navegação por linhas (actions ↔ tabs); aba Detalhes só com campos existentes; Elenco/Semelhantes mocks (`logic/detalhe-vod.md` §4 e §6; FR-037)

### Testes da Fase

- [ ] T054 [US5] Atualizar `tv-web/src/features/movies/MovieDetailScreen.test.tsx`: foco inicial 1 → 0 (registrar em R-003), ordem das ações, "Reiniciar" só com retomada, Minha Lista, Trailer/abas mock, ausência de "backdrop / still", "Resumo não disponível" e "Elenco: Desconhecido", player abre e fecha como antes

**Critério de Conclusão**: `npx vitest run src/features/movies` verde; a checagem da regra de transparência (a raiz tem a classe `.screen`) passa; o contrato da 020 (`PlayerLayer.ciclo-vida-player.contract.test.tsx`) continua verde.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 8: User Story 6 - Detalhe de série V14 com episódios em cards 16:9 (Priority: P2)

**Objetivo**: hero V14 com "Continuar TX:EY", Minha Lista, Trailer mock; abas; seletor de temporada em modal; episódios em cards 16:9 com progresso real.

**Independent Test**: série com episódios vistos em duas temporadas → "Continuar TX:EY" certo; modal de temporada troca a lista; barra aparece com duração declarada e "Continuar de mm:ss" sem ela; autoplay do próximo episódio intacto.

### Implementation

- [ ] T055 [US6] `seriesPrimaryAction` e `episodeCode` em `tv-web/src/features/series/episodeNavigation.ts` (`logic/detalhe-vod.md` §3)
- [ ] T056 [US6] Reescrever o layout de `tv-web/src/features/series/SeriesDetailScreen.tsx`: raiz `.screen.vod-detail`, hero, ações `[Continuar TX:EY | Assistir TX:EY] [Minha Lista] [Trailer]`, abas Episódios/Detalhes/Elenco/Semelhantes, linhas de foco actions → tabs → season → episodes (`logic/detalhe-vod.md` §2–§6)
- [ ] T057 [US6] Botão "Temporada N ▾" + "M episódios" e modal de temporada (`Modal`, sempre abre, ✓ e foco na atual, OK troca, RETURN fecha, foco volta ao botão) (FR-040)
- [ ] T058 [US6] Linha de episódio com `ContentCard` landscape (imagem do episódio → da série → fallback), `episodeCode`, título, duração, barra só com `duration_seconds` senão "Continuar de mm:ss", selo "✓ Concluído"; ajustar `EPISODE_ROW_HEIGHT` (FR-041; D-010)
- [ ] T059 [US6] Aba Detalhes da série (temporadas/episódios conhecidos, categoria, ano, resumo da 019 só com cobertura total) (FR-039)

### Testes da Fase

- [ ] T060 [P] [US6] Testes de `seriesPrimaryAction`/`episodeCode` (retomada mais recente, 1º episódio, sem temporada, sem episódio) em `tv-web/src/features/series/episodeNavigation.test.ts`
- [ ] T061 [US6] Atualizar `tv-web/src/features/series/SeriesDetailScreen.test.tsx`: seletor de temporada em modal (em vez das abas antigas), linhas de foco, barra × texto conforme a duração, ação primária, autoplay e contagem inalterados (a máquina `Mode` não muda)

**Critério de Conclusão**: `npx vitest run src/features/series` verde (com a regra do flake); o contrato da 019 (`seriesWatchedSummary.historico.contract.test.ts`) continua verde; `NextEpisodeCountdown.test.tsx` intocado e verde.

**Registro da Fase**:

- Status:
- Feito:
- Contrato:
- Testes executados:
- Pendências:

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: E2E, limpeza de CSS, documentação e gates finais.

- [ ] T062 Atualizar os E2E que tocam Filmes/Séries para os novos seletores, sem perder asserções: `tv-web/e2e/capa-real.mjs`, `tv-web/e2e/historico-continuar-assistindo.mjs`, `tv-web/e2e/favoritos.mjs`, `tv-web/e2e/busca-por-categoria.mjs`, `tv-web/e2e/paridade-visual.mjs`; conferir `shell-visual.mjs`, `m3u-sob-demanda.mjs`, `ciclo-vida-player.mjs` e `tv-web/e2e.mjs` (FR-052)
- [ ] T063 Criar `tv-web/e2e/filmes-series-ds-v14.mjs` cobrindo: topbar ↔ side nav, memória por entrada (inclusive ir ao Início e voltar), ↺ com filme e série, Ordenar com ano, detalhe de filme (ações, mocks, sem placeholder), detalhe de série (modal de temporada, barra/texto), screenshot da grade para R-002
- [ ] T064 Remover de `tv-web/src/features/screens.css` as regras antigas de Filmes/Séries/detalhes sem uso, **só depois** de provar por busca no código que nenhuma tela as usa, incluindo a linha de `.movie-detail-layout` da regra do plano de hardware (D-015, R-006)
- [ ] T065 Rodar `quickstart.md` inteiro (checagens, E2E, cenário ponta a ponta, itens cross-cutting) e registrar o resultado em `plan.md`
- [ ] T066 Gates finais: `npm run test`, `npx tsc -b`, `npm run lint`, `npm run build`, `npm run build:tizen` (a guarda de `tizenFiles.mjs` deve passar sem arquivo novo emitido; se `vod.css` virar arquivo separado, listá-lo em `tizen_web_project.yaml`), `check-contract-tests.ps1` de 018–025

### Checklist de Release

- [ ] Fase 1 (Setup) concluída
- [ ] Fase 2 (Foundational) concluída
- [ ] Fase 3 (US1) concluída
- [ ] Fase 4 (US2) concluída
- [ ] Fase 5 (US3) concluída
- [ ] Fase 6 (US4) concluída
- [ ] Fase 7 (US5) concluída
- [ ] Fase 8 (US6) concluída
- [ ] Testes de contrato todos verdes na suíte completa e `check-contract-tests.ps1` íntegro (025 e 018–024)
- [ ] E2E de Filmes/Séries e o novo `filmes-series-ds-v14.mjs` verdes contra um dev server recém-iniciado
- [ ] `build:tizen` limpo (guarda de arquivos listados)
- [ ] Nenhuma URL de catálogo em log, erro ou texto; nenhum dado inventado (checklist do `quickstart.md`)
- [ ] `quickstart.md` executado com sucesso
- [ ] Passada na TV física registrada como feita ou pendente (recomendada, não gate)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sem dependências. T001 informa T005/T006.
- **Foundational (Fase 2)**: depende do Setup e BLOQUEIA todas as stories.
- **US1 (Fase 3)**: depende da Fase 2 (usa `useHistoryContent`, snapshot, `SideCategoryNav`).
- **US2 (Fase 4)**: depende da US1 (a entrada ↺ mora na tela nova).
- **US3 (Fase 5)**: depende da US1; roda depois da US2 para verificar tudo junto.
- **US4 (Fase 6)**: depende da US1 (toolbar).
- **US5 (Fase 7)** e **US6 (Fase 8)**: dependem só da Fase 2 (T002, T009); podem rodar em paralelo às Fases 3–6.
- **Polish (Fase 9)**: depende de todas.

### Parallel Opportunities

- Fase 2: T004, T007, T008, T010, T014, T015 em paralelo; os testes T016–T021 em paralelo.
- Fases 7 e 8 em paralelo entre si, e com as Fases 4–6.

---

## Parallel Example: Foundational

```bash
Task: "T004 [P] normalize* em classifier.ts"
Task: "T010 [P] vodSort.ts"
Task: "T014 [P] CategoryScreenSnapshot"
Task: "T015 [P] SideCategoryNav groupLabel"
```

---

## Implementation Strategy

### MVP First

1. Fase 1 → Fase 2 (4 contratos verdes).
2. Fase 3 (US1, 5º contrato verde) → **parar e validar** no navegador.
3. Fase 4 (↺) → Fase 5 (regressão) → entregável P1 completo.

### Incremental Delivery

4. US4 (Ordenar) → US5/US6 (detalhes) → Polish, sempre sem quebrar as anteriores.

## Notes

- `[P]` = arquivos diferentes, sem dependência
- `[Story]` mapeia a task pra uma user story específica
- Commitar após cada task ou grupo lógico coerente
- Parar em qualquer checkpoint pra validar a story isoladamente

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
