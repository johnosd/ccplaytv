# Tasks: Gestão de categorias e controle parental

**Input**: Documentos de design de `sdd/specs/066-categorias-controle-parental/`

**Prerequisites**: plan.md, spec.md, data-model.md, logic/acesso-categorias.md, logic/pin.md, quickstart.md, contract-tests.lock

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode ser feita em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: US1–US4 da spec

## Path Conventions

- Frontend em `tv-web/src/` (`lib/` lógica e dados, `components/` UI compartilhada, `features/<área>/` telas; import feature→feature proibido pela catraca).
- Testes ao lado do arquivo (`*.test.ts` no projeto `node`, `*.test.tsx` no `dom`); E2E em `tv-web/e2e/*.mjs` registrado em `tv-web/e2e/run.mjs`.
- Textos em `tv-web/src/lib/i18n/messages/<área>.ts` (pt/en/es).
- **Teto de linhas** (`tv-web/scripts/architecture-baseline.json`): `catalogApi.ts` 2190, `App.tsx` 625, `AddSourceScreen.tsx` 421, `ProfilesScreen.tsx` 421, `LiveScreen.tsx` 349, `liveColumns.tsx` 511, `VodCategoryScreen.tsx` 950 — rode `npm run lint` a cada task que tocar um deles (plan R-001).

---

## Phase 1: Setup

**Purpose**: Linha de base antes de mexer.

- [x] T001 Registrar a linha de base: `npx tsc -b`, `npm run lint` (anotar os tetos do R-001), os 5 contratos vermelhos por `not implemented` (comando do plan), e `check-contract-tests.ps1 -Slug 066-categorias-controle-parental` íntegro; conferir que a v20 do Dexie continua livre em `tv-web/src/lib/catalog/dbSchema.ts`.

**Critério de Conclusão**: linha de base registrada no Registro da Fase; nenhum arquivo de produção alterado.

**Registro da Fase**:

- Status: Concluída (2026-10-09).
- Feito: linha de base; v20 livre em `dbSchema.ts` (última v19). Teto não previsto no plano: `lib/catalog/db.ts` 859/860 (R-009).
- Contrato: `npx vitest run <3 arquivos do plan>` → 5/5 vermelhos, todos `Error: not implemented` (6 ocorrências, inclui o `afterEach` com `relockSession`); `check-contract-tests.ps1` → PASS, trava íntegra.
- Testes executados: `npx tsc -b` 0; `npm run lint` → `architecture: ok` (365 arquivos, 4 avisos de teto que pode baixar/exceção obsoleta, pré-existentes).
- Pendências: nenhuma.

---

## Phase 2: Foundational — dados, acesso e PIN

**Purpose**: Tabelas, módulo de acesso e PIN que todas as stories usam.

**⚠️ CRITICAL**: Nenhuma user story começa antes desta fase.

### Contrato da Fase

- `066 — PIN parental (contrato)` → `npx vitest run src/lib/parental/pin.categorias-controle-parental.contract.test.ts`

### Implementation

- [x] T002 Dexie v20 em `tv-web/src/lib/catalog/dbSchema.ts` (`categoryPreferences: '[sourceId+kind+matchKey], sourceId'`, `parentalPin: 'id'`) e tipos/`EntityTable` em `tv-web/src/lib/catalog/db.ts` (`CategoryPreferenceRecord`, `ParentalPinRecord`), conforme `data-model.md`.
- [x] T003 [P] SHA-256 em JS puro em `tv-web/src/lib/parental/sha256.ts` (fallback do `crypto.subtle`, `logic/pin.md` §1).
- [x] T004 `tv-web/src/lib/parental/pin.ts`: `hasPin`, `verifyPin`, `enableParentalControl` (transação única PIN + decisões, D-007), `changePin`, `disableParentalControl` (apaga PIN, zera `locked`, mantém `hidden`/`declinedSuggestion`, chama `relockSession`), `recoverPinWithSource` (só IndexedDB, D-009) → contrato: `PIN só como hash…`
- [x] T005 Núcleo de `tv-web/src/lib/catalog/categoryAccess.ts`: `setCategoryPreference`, `getCategoryAccess` (estado efetivo do `logic/acesso-categorias.md` §1, mapa `kind`+`groupOrder` para linhas antigas), `listVisibleCategories`, `listManagedCategories`, sessão (`unlockWithPin`, `relockSession`, `isSessionUnlocked`), `subscribeCategoryAccess`; `isAdultCategoryName` pode ficar devolvendo `false` até a Fase 5.
- [x] T006 [P] `deleteSource` em `tv-web/src/lib/catalog/sourceRepository.ts` apaga `categoryPreferences` da lista (FR-005).
- [x] T007 [P] Textos novos em `tv-web/src/lib/i18n/messages/parental.ts` (pt/en/es; registrar a área como as demais) e rótulo da aba em `tv-web/src/lib/i18n/messages/settings.ts` → "Categorias & parental" / "Categories & parental" / "Categorías y control parental".
- [x] T008 [P] Ícone `lock` em `tv-web/src/components/iconPaths.ts` (SVG de traço, padrão dos demais).

### Testes da Fase

- [x] T009 [P] `tv-web/src/lib/parental/sha256.test.ts`: vetores FIPS 180-2 ("", "abc", 448 bits) e paridade com `crypto.subtle` do Node; `tv-web/src/lib/catalog/categoryAccess.test.ts`: `matchKey` por id do provedor e por nome (M3U), preferência sobrevive a uma geração nova com ids locais diferentes, `deleteSource` apaga só as preferências da lista.

**Critério de Conclusão**: `npx vitest run src/lib/parental/pin.categorias-controle-parental.contract.test.ts` → 1/1 verde e `check-contract-tests.ps1` íntegro; T009 verde; `npx tsc -b` e `npm run lint` sem erro.

**Registro da Fase**:

- Status: Concluída (2026-10-09).
- Feito: v20 em `dbSchema.ts` (`categoryPreferences`, `parentalPin`) com acesso tipado em `lib/catalog/parentalTables.ts` (R-009: nada em `db.ts`); `lib/parental/sha256.ts`; `lib/parental/pin.ts` (hash com sal, `subtle` com reserva JS, ligar atômico, trocar, desligar mantendo escondidas/recusas, recuperação só local); `lib/catalog/categoryAccess.ts` (estado efetivo na leitura, `hiddenBefore`, sessão, `notifyCategoryAccessChanged`/`preferenceKey` exportados para o `pin.ts`; `isAdultCategoryName` ainda `false` até T029); `deleteSource` apaga as preferências (comentários compactados para ficar em 409/409); área i18n `parental.ts` (pt/en/es) registrada em `pt/en/es.ts` e em `areas.test.ts`; aba renomeada; ícone `lock`.
- Contrato: `npx vitest run src/lib/parental/pin.categorias-controle-parental.contract.test.ts` → 1/1 verde; trava íntegra (os outros 4 seguem vermelhos, esperado).
- Testes executados: `npx vitest run src/lib/parental src/lib/catalog/categoryAccess.test.ts src/lib/i18n src/components/Icon.test.tsx src/lib/catalog/sourceRepository.test.ts` → 10 arquivos / 74 testes; `npx tsc -b` 0 (1 iteração: tipo do `subtle.digest` no teste); `npm run lint` → `architecture: ok`.
- Pendências: nenhuma desta fase. Observação: outra sessão trabalha na mesma árvore (commit `10762da`, arquivos da Home) — não misturar no commit desta feature.

---

## Phase 3: User Story 1 - Esconder categorias (Priority: P1) 🎯 MVP

**Objetivo**: Esconder/mostrar categorias na gestão; escondidas somem de todas as superfícies.

**Independent Test**: esconder uma categoria de canais e uma de filmes e não achar item delas em nenhuma superfície do FR-007; mostrar e achar de novo.

### Contrato da Fase

- `escondida some das trilhas, de "Todos"/busca, das fileiras e dos favoritos; mostrar devolve tudo` → `npx vitest run src/lib/catalog/categoryAccess.categorias-controle-parental.contract.test.ts -t "US1"`

### Implementation

- [x] T010 [US1] Filtrar os leitores de `tv-web/src/lib/catalog/repository/kindReads.ts` (`listAllOfKind`, `readKindCursorPage`, `readKindPage`, `kindSortFields`) com `getCategoryAccess` (`logic/acesso-categorias.md` §3) → contrato US1
- [x] T011 [US1] Filtrar `iterateKindChunks` em `tv-web/src/lib/catalog/catalogDerivedRows.ts` → contrato US1
- [x] T012 [US1] Filtrar `resolveStableIdsIn` em `tv-web/src/lib/catalog/repository/stableIds.ts` e `findSeriesRecord`/`findSeriesManyIn` em `repository/series.ts`; episódio de série excluída não resolve em `repository/continueWatching.ts` → contrato US1
- [x] T013 [US1] Guardas por categoria/id em `tv-web/src/lib/catalog/repository/categoryReads.ts` (`listChannels`, `getActiveCategoryBlock`, `getChannel`) e `repository/categoryWindow.ts`: categoria/registro excluído → vazio/`undefined` (FR-014, FR-020).
- [x] T014 [US1] Trocar `listCategories` por `listVisibleCategories` nos leitores de tela: `tv-web/src/features/catalog/catalogApi.ts` (linhas ~338, ~681, ~1589, ~1653 — **mesmo número de linhas**), `tv-web/src/lib/catalog/catalogSearch.ts:121`, `tv-web/src/lib/metadata/localTitleMatch.ts:116`; pré-carga pula escondidas em `tv-web/src/lib/catalog/prefetch/index.ts`. `listVisibleCategories` expõe `hiddenBefore` e `channelNumberOf` em `tv-web/src/features/live/channelNumber.ts` soma essas categorias (D-012).
- [x] T015 [US1] Hook `useCategoryAccessLifecycle(activeSourceId)` em `tv-web/src/features/catalog/categoryAccessApi.ts`: assina `subscribeCategoryAccess` e faz `resetQueries` das chaves de catálogo (D-005; listar as chaves reais de `catalogApi.ts`); montar em `tv-web/src/App.tsx` (import + 1 chamada) e compensar para ficar ≤ 625 linhas.
- [x] T016 [US1] Aba "Categorias & parental": `tv-web/src/features/settings/tabs/ParentalTab.tsx` + `tv-web/src/features/settings/parental/CategoryManager.tsx` (seções Canais/Filmes/Séries, linhas com nome da lista e alternância Visível/Escondida, foco por id da categoria, estados carregando/vazio/erro com foco) usando `listManagedCategories`/`setCategoryPreference`; registrar em `tv-web/src/features/settings/tabs/settingsTabs.ts` no lugar de `ParentalSoonTab`; tirar o mock de `tv-web/src/features/settings/tabs/SimpleTabs.tsx`, `ComingSoonPanel.tsx`, `tv-web/src/lib/comingSoon.ts` e `messages/comingSoon.ts` (FR-001, FR-002).
- [x] T017 [US1] Estado vazio "categorias escondidas" com ação "Gerenciar categorias" (abre Configurações › Categorias & parental) quando todas as categorias de uma seção estão escondidas — Live, Filmes e Séries (FR-009). Componente em `tv-web/src/components/` se compartilhado; respeitar tetos (R-001).

### Testes da Fase

- [x] T018 [P] [US1] Testes de leitor: "Todos" (`readKindCursorPage`) e janela de categoria sem itens escondidos; item em duas categorias continua visível pela livre; episódio de série escondida não aparece em continuar assistindo — em `tv-web/src/lib/catalog/categoryAccess.leitores.test.ts`. Em `tv-web/src/features/live/channelNumber.test.ts`: o número de um canal não muda ao esconder uma categoria anterior (D-012, R-008).
- [x] T019 [P] [US1] Teste da aba (`tv-web/src/features/settings/ParentalTab.test.tsx`): lista por seção, alternar esconder, foco preservado por id, estados com foco; atualizar `SettingsPanels.test.tsx`, `SettingsScreen.test.tsx` e `lib/comingSoon.test.ts` para a aba real.

**Critério de Conclusão**: contrato US1 verde (`-t "US1"`), trava íntegra; T018/T019 verdes; `npm run lint` dentro dos tetos; esconder no navegador some de todas as superfícies do quickstart passo 1–2.

**Registro da Fase**:

- Status: Concluída (2026-10-09), com a passada no navegador (quickstart 1–2) adiada para o E2E da T034.
- Feito: filtro na leitura em `repository/kindReads.ts`, `catalogDerivedRows.ts`, `repository/stableIds.ts`, `repository/series.ts` e guardas em `repository/categoryReads.ts` (`listChannels`, `getActiveCategoryBlock`, `getChannel`) e `categoryWindow.ts` (`readCategoryWindow`). **Achado fora da tabela do `logic`**: `lib/catalog/kindCursor.ts` tem o `readKindCursorPage` que o `catalogApi` usa de fato (a cópia de `repository/kindReads.ts` não é chamada) — os dois filtrados (R-010). `listVisibleCategories` em `catalogApi.ts` (trilhas, "Todos", vitrines; `sectionCount`/Fontes fica cru, premissa), `catalogSearch.ts`, `localTitleMatch.ts`; pré-carga pula escondidas; `channelNumberOf` soma `hiddenBefore`. Hook `useCategoryAccessLifecycle` (`features/catalog/categoryAccessApi.ts`) com `resetQueries` de 21 chaves reais, montado em `App.tsx` (já com rebloqueio por `visibilitychange`/troca de lista — a T026 é marcada na Fase 4, com o teste T028). Aba real `tabs/ParentalTab.tsx` + `parental/CategoryManager.tsx` (seções Canais/Filmes/Séries, Visível/Escondida, foco por `matchKey`); mock "Em breve" removido (`ComingSoonPanel.tsx` apagado, `settings-parental` fora do registro e dos textos). Vazio "todas escondidas" (FR-009) em Live e Filmes/Séries com `components/SectionEmptyState.tsx` + `lib/catalog/useSectionAllHidden.ts`; `onOpenSettings(tab?: 'parental')` abre Configurações direto no painel (R-011). Desvio da Fase 2 corrigido: `categoryAccess.ts` importava `repository/` direto (quebrava `fachada.test.ts`) — agora passa pela fachada.
- Contrato: `npx vitest run src/lib/catalog/categoryAccess.categorias-controle-parental.contract.test.ts -t "US1"` → 1/1 verde (US2 também já verde; US3 e `PinPrompt` vermelhos, esperado); `check-contract-tests.ps1` → PASS, trava íntegra.
- Testes executados: `npx vitest run src/lib/catalog/categoryAccess.leitores.test.ts src/features/live/channelNumber.test.ts` → 15/15; `npx vitest run src/features/settings/ParentalTab.test.tsx` → 5/5; `npx vitest run src/lib src/features/live src/features/vod src/features/settings src/features/catalog src/components src/App` → 2332 verdes, 9 vermelhos: US3 + `PinPrompt` (esperado) e 7 que passam isolados (`npx vitest run src/lib/epg/epgStatus.test.ts src/App.source-access.test.tsx` → 22/22). `npx tsc -b` 0; `npm run lint` → `architecture: ok`, com `App.tsx` 618/625, `LiveScreen.tsx` 349/349, `useLiveCatalog.ts` 444/444, `useLiveKeyboard.ts` 391/392 (linhas novas compensadas reescrevendo comentários longos, sem subir teto).
- Pendências: **instáveis sob carga** (passam isolados, falham na leva grande): `src/App.source-access.test.tsx` (3 testes de ~1 s) e `src/lib/epg/epgStatus.test.ts` (4) — fora dos arquivos desta feature, mas não contam como "ok". Quickstart 1–2 no navegador: coberto pela T034.

---

## Phase 4: User Story 2 - Bloquear com PIN (Priority: P1)

**Objetivo**: Bloquear categorias com PIN, cadeado na trilha, desbloqueio por sessão, PIN protegendo gestão e listas.

**Independent Test**: bloquear, criar PIN, cadeado, PIN errado/certo, segundo plano rebloqueia; adicionar/editar/remover lista pedem PIN.

### Contrato da Fase

- `bloqueada fica na trilha com cadeado e sem itens fora dela; PIN certo libera só esta lista até rebloquear` → `npx vitest run src/lib/catalog/categoryAccess.categorias-controle-parental.contract.test.ts -t "US2"`
- `066 — PinPrompt (contrato)` → `npx vitest run src/components/PinPrompt.categorias-controle-parental.contract.test.tsx`

### Implementation

- [x] T020 [US2] `tv-web/src/components/PinPrompt.tsx` (`logic/pin.md` §3) + estilos com tokens V14 → contrato: `PinPrompt`
- [x] T021 [US2] `registerDigitKeys()` em `tv-web/src/lib/tizenMediaKeys.ts`, chamada de dentro de `registerMediaKeys()` (R-003; sem linha em `App.tsx`).
- [x] T022 [US2] Cadeado na trilha: `locked?: boolean` em `SideCategoryNavEntry` (`tv-web/src/components/SideCategoryNav.tsx`) com ícone `lock` e nome acessível "bloqueada"; repassar `locked` de `listVisibleCategories` nas trilhas de Live e Filmes/Séries.
- [x] T023 [US2] `tv-web/src/components/LockedCategoryState.tsx`: estado de conteúdo da categoria bloqueada, com botão focável "Desbloquear" e `PinPrompt` aberto ao montar por SELECT; certo → `unlockWithPin`. Usar no conteúdo da Live (`features/live/liveColumns.tsx`) e da categoria de Filmes/Séries (`features/vod/VodCategoryScreen.tsx`, entrada pela vitrine em `VodShowcaseScreen.tsx`); focar a categoria não carrega nada (FR-013). Respeitar tetos (R-001). → contrato US2
- [x] T024 [US2] Gestão com bloqueio: alternância Livre/Bloqueada no `CategoryManager`; sem PIN, bloquear abre "Criar PIN" (2×) e liga o controle por `enableParentalControl` com as decisões (D-007; a etapa de sugestão entra na Fase 5); com PIN, a aba pede o PIN ao entrar (vale até sair da aba); "Trocar PIN" e "Desligar controle parental" pedem o PIN atual (FR-017, FR-019).
- [x] T025 [US2] `withParentalGate` em `tv-web/src/components/ParentalGate.tsx` e aplicado ao `AddSourceScreen` em `tv-web/src/navigation/routeModules.ts` (adicionar e editar lista; cancelar = `onBack`); `tv-web/src/features/sources/DeleteSourceModal.tsx` pede o PIN antes de `onConfirm` (FR-017; D-008).
- [x] T026 [US2] Rebloqueio no `useCategoryAccessLifecycle`: `visibilitychange` → oculto chama `relockSession()`; mudança de `activeSourceId` também (FR-015); voltar não retoma conteúdo bloqueado (FR-020, guardas do T013).

### Testes da Fase

- [x] T027 [P] [US2] `tv-web/src/components/LockedCategoryState.test.tsx` (foco, RETURN, sucesso) e `ParentalGate.test.tsx` (sem PIN passa direto; com PIN pede; cancelar volta); `DeleteSourceModal` com PIN.
- [x] T028 [P] [US2] `tv-web/src/features/catalog/categoryAccessApi.test.tsx`: rebloqueio por `visibilitychange` e por troca de lista; `resetQueries` só quando havia sessão desbloqueada.

**Critério de Conclusão**: contratos US2 e `PinPrompt` verdes, trava íntegra; T027/T028 verdes; `npm run lint` dentro dos tetos; quickstart passos 3–4 no navegador.

**Registro da Fase**:

- Status: Concluída (2026-10-09), com o quickstart 3–4 no navegador adiado para o E2E da T034.
- Feito: `components/PinPrompt.tsx` (casas sem dígito, progresso só no nome acessível, teclado 3×4 com foco no 5, teclas 0–9 por ouvinte em `document`, PIN errado limpa e volta o foco); `registerDigitKeys()` dentro de `registerMediaKeys()`; cadeado (`locked`) no `SideCategoryNav` com nome "…, bloqueada", repassado nas trilhas de Live e Filmes/Séries; `components/LockedCategoryState.tsx` na categoria de Filmes/Séries (`VodCategoryScreen`: categoria bloqueada vai como ausente para as consultas, PIN abre junto) e na Live (`liveColumns`: PIN aberto com a coluna de conteúdo ativa, RETURN volta à trilha — sem tocar no teclado da Live, no teto); foco numa bloqueada não dispara pré-busca (vitrine e Live). Gestão: linha de controle (Ligar / Trocar PIN / Desligar), coluna Livre/Bloqueada, aba pede o PIN ao entrar e fica liberada até sair, bloquear sem PIN cria o PIN (`components/PinCreateFlow.tsx`, 2×) e liga com a categoria nas decisões; fluxos em `parental/ParentalFlow.tsx`, setas em `parental/parentalNav.ts`, tipos em `parental/parentalModel.ts`. Adicionar/editar lista atrás de `withParentalGate` (`navigation/routeModules.ts` + `components/ParentalGate.tsx`, com o retry da rota preservado por `aliasRouteReset`); remover lista pede o PIN no `DeleteSourceModal` (espelho síncrono de "existe PIN", R-013). Rebloqueio por `visibilitychange`/troca de lista no `useCategoryAccessLifecycle`. **Pedido novo do usuário no meio da fase**: bloqueadas no fim da trilha (D-013, emenda ao FR-033, R-012).
- Contrato: `npx vitest run src/components/PinPrompt.categorias-controle-parental.contract.test.tsx` → 1/1; `npx vitest run src/lib/catalog/categoryAccess.categorias-controle-parental.contract.test.ts -t "US2"` → 1/1; `check-contract-tests.ps1` → PASS, trava íntegra.
- Testes executados: `npx vitest run src/components/ParentalGate.test.tsx src/features/sources/DeleteSourceModal.parental.test.tsx` → 4/4; `npx vitest run src/features/catalog/categoryAccessApi.test.tsx` → 2/2; `npx vitest run src/features/settings/ParentalTab.test.tsx` → 7/7 (inclui criar PIN com PINs diferentes, entrar com PIN errado/certo e desligar); `npx vitest run src/lib/tizenMediaKeys.test.ts` → 12/12; `npx vitest run src/lib src/features src/components src/navigation src/App` → 2942 verdes, 1 vermelho (US3, esperado). `npx tsc -b` 0; `npm run lint` → `architecture: ok`, sem aviso novo nos arquivos da feature (1 iteração: constantes saíram do arquivo de componente e o ref passou direto no JSX); `liveColumns.tsx` 511/511 e `LiveScreen.tsx` 349/349 compensando com comentários.
- Pendências: a primeira tentativa do `DeleteSourceModal` esperava o IndexedDB e quebrou 8 testes, entre eles contratos travados da 023/026 que exigem remoção imediata sem PIN — resolvido com o espelho síncrono (R-013), não com edição dos contratos. Quickstart 3–4 no navegador: T034.

---

## Phase 5: User Story 3 - Sugestão de categorias adultas (Priority: P2)

**Objetivo**: Sugerir adultas ao ligar; adulta nova chega bloqueada; recusa lembrada.

**Independent Test**: lista fictícia com 3 adultas e 10 comuns → 3 pré-marcadas; atualização com 1 adulta nova → bloqueada.

### Contrato da Fase

- `nome adulto sem decisão chega bloqueado; recusada fica livre; sem PIN nada bloqueia` → `npx vitest run src/lib/catalog/categoryAccess.categorias-controle-parental.contract.test.ts -t "US3"`

### Implementation

- [x] T029 [US3] `isAdultCategoryName` em `tv-web/src/lib/catalog/categoryAccess.ts` (`logic/acesso-categorias.md` §4) e a regra de nome adulto em `getCategoryAccess`/`listVisibleCategories`/`listManagedCategories` (`suggested`) → contrato US3
- [x] T030 [US3] Etapa "Sugestão" no fluxo de ligar o controle (`tv-web/src/features/settings/parental/SuggestionStep.tsx`): lista as adultas de todas as seções pré-marcadas, a pessoa desmarca/confirma; grava `locked`/`declinedSuggestion` via `enableParentalControl`; sem nenhuma adulta, mostra "Nenhuma categoria adulta encontrada" com foco (FR-022, FR-024, FR-026).

### Testes da Fase

- [x] T031 [P] [US3] `tv-web/src/lib/catalog/categoryAccess.adulto.test.ts`: termos e não-termos (ex.: "Adultos", "XXX", "+18", "18+", "Pornô", "Erótico", "Adult Swim" sim; "Adulteração", "Infantil", "Esportes", "2018" não), sem diferenciar maiúsculas e acentos; `SuggestionStep.test.tsx` (pré-marcadas, desmarcar, confirmar, vazio).

**Critério de Conclusão**: contrato US3 verde, trava íntegra; T031 verde; quickstart passo 5.

**Registro da Fase**:

- Status: Concluída (2026-10-09), com o quickstart 5 no navegador adiado para o E2E da T034.
- Feito: `isAdultCategoryName` com a regex do `logic` §4 sobre `normalizeForSearch` (a regra já entrava em `getCategoryAccess`/`listVisibleCategories`/`listManagedCategories` desde a Fase 2); `parental/SuggestionStep.tsx` — adultas de todas as seções da lista ativa, pré-marcadas, desmarcar/confirmar, "Nenhuma categoria adulta encontrada" com "Confirmar" focado, carregando com "Cancelar" focado; o fluxo de ligar virou sugestão → PIN 2× → `enableParentalControl` com as decisões das sugestões e a categoria pendente (nada gravado antes, D-007).
- Contrato: `npx vitest run src/lib/catalog/categoryAccess.categorias-controle-parental.contract.test.ts` → 3/3 (US1, US2, US3); os 5 contratos verdes; `check-contract-tests.ps1` → PASS, trava íntegra.
- Testes executados: `npx vitest run src/lib/catalog/categoryAccess.adulto.test.ts` → 23/23 (1 iteração: tirei um item cortado por `.slice` que mascarava um caso); `npx vitest run src/features/settings/SuggestionStep.test.tsx src/features/settings/ParentalTab.test.tsx` → 9/9; `npx vitest run src/lib src/features src/components src/navigation src/App` → 2965 verdes, 3 vermelhos em `src/App.source-access.test.tsx`, que passa isolado 3 de 3 vezes (`npx vitest run src/App.source-access.test.tsx` → 5/5). `npx tsc -b` 0; `npm run lint` → `architecture: ok`.
- Pendências: `src/App.source-access.test.tsx` segue instável sob carga (já falhava na Fase 3, antes do `ParentalGate`) — não conta como ok; fica para o gate final (T037).

---

## Phase 6: User Story 4 - Recuperar o PIN (Priority: P3)

**Objetivo**: "Esqueci o PIN" com os dados de uma lista cadastrada.

**Independent Test**: senha errada nega sem eco; certa cria PIN novo; bloqueios ficam; zero rede.

### Implementation

- [x] T032 [US4] `tv-web/src/components/RecoverPinFlow.tsx` (fica em `components/` porque só usa `lib/parental` e é aberto pelo `PinPrompt` em todos os pontos, inclusive `ParentalGate` e `LockedCategoryState`, que não podem importar `features/`): escolher Xtream (usuário + senha mascarada) ou M3U (endereço), IME do V14 §37 (mesmo padrão dos campos de `features/import`), `recoverPinWithSource` → "Criar novo PIN" (2×) → `changePin`; erro genérico sem dizer o campo nem repetir o digitado (FR-027..FR-030). Todo `PinPrompt` desta feature recebe `onForgot` abrindo esse fluxo.

### Testes da Fase

- [x] T033 [P] [US4] `tv-web/src/components/RecoverPinFlow.test.tsx`: erro genérico sem eco, sucesso leva a criar PIN, `fetch` nunca chamado, nada dos dados em `aria-label`/texto.

**Critério de Conclusão**: T033 verde; contrato do PIN segue verde; quickstart passo 6.

**Registro da Fase**:

- Status: Concluída (2026-10-09), com o quickstart 6 no navegador adiado para o E2E da T034.
- Feito: `components/RecoverPinFlow.tsx` — escolher Xtream (usuário + senha mascarada com "Mostrar") ou M3U (endereço), campos com o `TextField` do V14 (foco DOM só no OK sobre o campo, que abre o teclado da TV), `recoverPinWithSource` só no aparelho, erro genérico que limpa os campos, certo → `PinCreateFlow` → `changePin`. `components/ParentalPinPrompt.tsx` embute o "Esqueci o PIN" (a recuperação substitui o pedido, porque só um `Modal` fica ativo, e devolve a ele) e passou a ser o pedido de PIN de todos os pontos: aba (entrar, trocar, desligar), `LockedCategoryState`, `ParentalGate`, `DeleteSourceModal`. Os fluxos de criar PIN não oferecem "Esqueci" (não há PIN a esquecer). O encadeamento Next/Done do IME (`useImeChain`) não foi ligado: o foco do formulário é por estado dentro do `Modal`, e as teclas do IME seguem sem medição na TV (R-001 da 045).
- Contrato: `npx vitest run src/lib/parental/pin.categorias-controle-parental.contract.test.ts` segue 1/1 (dentro da leva abaixo); `check-contract-tests.ps1` → PASS, trava íntegra.
- Testes executados: `npx vitest run src/components/RecoverPinFlow.test.tsx` → 2/2 (`fetch` nunca chamado; nada do digitado no texto nem no HTML do diálogo; endereço com espaços nas pontas aceito); `npx vitest run src/components src/features/settings src/features/sources src/lib/parental src/lib/catalog/categoryAccess` → 597/597. `npx tsc -b` 0; `npm run lint` → `architecture: ok`, sem aviso nos arquivos da feature (1 iteração: `checkRow` calculado pelo passo, não por um array de refs).
- Pendências: quickstart 6 no navegador (T034).

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: E2E, revisão de segredos, docs e gates.

- [x] T034 E2E `tv-web/e2e/categorias-controle-parental.mjs` (registrar em `tv-web/e2e/run.mjs`), lista fictícia servida pelo próprio script: esconder e percorrer as superfícies, inclusive zapping e guia (SC-001, FR-021), bloquear/PIN/rebloqueio por `visibilitychange` (SC-002/SC-003), adicionar/editar/remover com PIN, sugestão adulta (SC-005), recuperação sem rede (SC-006), pt/en/es, e esconder uma categoria a partir do Início em ≤ 10 teclas (SC-004); atualizar `e2e/paridade-limpeza.mjs` se ele esperar o mock parental.
- [x] T035 Revisão de segredos (constitution "Revisão de segredos"): PIN e credenciais fora de log, erro, `aria-label`, `title`, atributos e mensagens; `grep` por `console.` nos arquivos novos.
- [x] T036 Medição do quickstart passo 9 (lista real, navegador) e registro em `plan.md` → Riscos e Decisões.
- [x] T037 Gates finais: `npx tsc -b`, `npm run lint`, `npm run test`, `npm run build`, `npm run test:e2e` completo; `check-contract-tests.ps1` íntegro (e travas de 026/028/032/050/052/053/057/060/062 intactas).
- [x] T038 Documentação: `CLAUDE.md` só se surgir regra permanente (ex.: "leitores de catálogo filtram por `getCategoryAccess`"); `.planning/migracao-design-system-v14.md` se cita o mock `settings-parental`; quickstart executado no navegador.

### Checklist de Release

- [x] Fase 2 (Foundational) concluída
- [x] Fase 3 (US1) concluída
- [x] Fase 4 (US2) concluída
- [x] Fase 5 (US3) concluída
- [x] Fase 6 (US4) concluída
- [x] Testes de contrato todos verdes na suíte completa e `check-contract-tests.ps1` íntegro
- [x] Lint (tetos), tipos, unitários, build e E2E completos verdes (com as ressalvas do Registro da Fase 7)
- [x] `quickstart.md` executado no navegador (pelo E2E `categorias-controle-parental.mjs`; ver lacunas no Registro)
- [x] Revisão de segredos feita
- [x] TV física (recomendada, não gate): teclas numéricas, hash na origem `file://`, rebloqueio pelo botão Home — confirmado pelo usuário na TV em 2026-10-10 (teclas numéricas, ligar com PIN 2×, cadeado no fim da trilha, PIN para entrar, rebloqueio pelo Home); 2 falhas `AbortError` transitórias antes de religar a TV (R-017)

**Registro da Fase**:

- Status: Concluída (2026-10-10), inclusive a passada na TV física (veredito do usuário).
- Feito: T034 `e2e/categorias-controle-parental.mjs` (registrado no `SUITE`): esconder "Terror" do Início em 16 teclas (SC-004 emendado, R-014) e não achá-la na trilha nem em "Todos"; ligar o controle com a sugestão adulta pré-marcada e PIN 2×; bloqueada com cadeado e no fim da trilha (D-013); PIN errado/certo; `visibilitychange` rebloqueia; "Esqueci o PIN" com usuário/senha da lista sem requisição de conta ao painel; "Adicionar lista" pede o PIN; PIN/senha fora do console. **Não cobertos no E2E** (cobertos em unitário): zapping e guia (FR-021), remover lista com PIN, pt/en/es, atualização com adulta nova (contrato US3). T035 revisão de segredos (nenhum `console`, `title`/`aria-label` só com texto traduzido e nome de categoria, PIN só em ref/estado/hash, espelho `localStorage` só `'1'`). T036 medição com a lista real (R-015). T037 gates. T038 regra permanente no `CLAUDE.md` (leitores filtram por `getCategoryAccess`). **Regressão achada no gate e corrigida**: `carrosseis-filmes-series` estourava "Maximum update depth" na vitrine com 302 categorias — cada leitor relia PIN e preferências do IndexedDB; agora a regra salva fica em memória por banco/lista e é esquecida a cada `notifyCategoryAccessChanged` (R-016); testes que limpam as tabelas direto passaram a avisar.
- Contrato: os 5 contratos da 066 verdes na suíte completa; `check-contract-tests.ps1` → PASS, trava íntegra.
- Testes executados: `npx tsc -b` → só o erro em `src/lib/parental/listPin.configuracoes-lista-global.contract.test.ts` (feature 067 de outra sessão, fora desta); `npm run lint` → `architecture: ok`; `npm run build` ok; `npm run test` (2ª rodada completa) → 3119 verdes, 8 vermelhos = 5 contratos da 067 (vermelhos de propósito) + 3 de `App.source-access` na 1ª rodada (instáveis; passaram na 2ª e isolados). `npm run test:e2e` → 40/44; dos 4: `bem-avaliados` passou na repetição (instável); `teste-conexao-tv` falha só no servidor 5173 antigo e passa num servidor novo com o mesmo código; `epg-guia-completo` falha também no `HEAD` (anterior a esta feature); `carrosseis-filmes-series` era regressão desta feature, corrigida (passa num servidor novo). `categorias-controle-parental` verde.
- Pendências: TV física (teclas numéricas, hash na origem `file://`, rebloqueio pelo botão Home) sem veredito; `epg-guia-completo` quebrado antes desta feature; incidente operacional: ao remover um worktree de diagnóstico, parte do `tv-web/node_modules` foi apagada pela junção — reinstalado com `npm ci` (lockfile intacto) e o servidor 5173 reaberto, com autorização do usuário.

---

## Dependencies & Execution Order

### Phase Dependencies

- Fase 1 → Fase 2 (bloqueante) → Fase 3 (US1) → Fase 4 (US2) → Fase 5 (US3) → Fase 6 (US4) → Fase 7.
- US2 depende do filtro da US1 (T010–T015) para "itens fora dela"; US3 depende do fluxo de ligar da US2 (T024); US4 depende do `PinPrompt` (T020).

### Parallel Opportunities

- Fase 2: T003, T006, T007, T008 em paralelo depois de T002.
- Fase 3: T010–T013 em arquivos diferentes; T018/T019 em paralelo.

## Implementation Strategy

### MVP First

Fases 1–3 entregam "esconder" sozinho, sem PIN — já resolve a primeira ideia do usuário.

### Incremental Delivery

Fase 4 traz o controle parental real; Fase 5 a ajuda com adultas; Fase 6 a recuperação.

## Notes

- Nunca editar os 3 arquivos de contrato travados; se um parecer errado, parar (sdd-execute passo 5b).
- Filtrar sempre depois dos memos de `lib` (D-003).

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->

## Phase 8: Convergence

**Purpose**: Lacunas achadas pelo `sdd-converge` em 2026-10-10 (CRITICAL/HIGH primeiro).

- [x] T039 [HIGH] [US2] Ao rebloquear (segundo plano, troca de lista), uma sessão de filme/episódio **pausada** cujo item pertence a categoria agora bloqueada não pode ser retomada sem o PIN: fechar a sessão (ou exigir o PIN antes de "Retomar") — hoje `components/player/usePlayerSession.ts` só pausa VOD no `visibilitychange` e `verifyResume` libera a retomada. Origem: FR-020, SC-003.
- [x] T040 [MEDIUM] [US2] Guia de programação (`features/live/guide/EpgGuide.tsx`): categoria bloqueada com cadeado no seletor, sem `useCategoryContent` (nenhuma leitura/rede dela) e pedindo o PIN (`LockedCategoryState`/`ParentalPinPrompt`) ao ser escolhida. Origem: FR-013, FR-014.
- [x] T041 [MEDIUM] Testes de foco nos estados novos: `CategoryManager` carregando/erro/"Tentar de novo"; `SectionEmptyState` (vazio comum e "todas escondidas" com "Gerenciar categorias"); `SuggestionStep` carregando com "Cancelar". Origem: SC-007, FR-031.
- [x] T042 [MEDIUM] Estender `tv-web/e2e/categorias-controle-parental.mjs` às superfícies do FR-007 que hoje só têm teste unitário: busca global, fileiras do Início, ★ Favoritos/↺ Histórico/Continuar assistindo, e uma categoria de **canais** escondida no guia e no zapping (sem renumerar). Origem: SC-001, FR-007, FR-021.
- [x] T043 [LOW] Diagnóstico de erro do `PinPrompt` (cadeia de nomes, ex.: `AbortError ← QuotaExceededError`, R-017): decidir com o usuário entre virar um código do catálogo de erros (`lib/errors/errorCatalog`) ou sair. Origem: R-017, Constitution (mensagens de erro).

**Registro da Fase**:

- Status: Concluída (2026-10-10).
- Feito: T039 — o caminho de retomada depois do segundo plano já passava por `getChannel` (filme de categoria bloqueada não resolve → a sessão cai em erro, não retoma); o furo real eram os **episódios** (linhas sem categoria): `getChannel` de episódio agora exige que a série-pai resolva, só quando há categoria excluída (`repository/categoryReads.ts`). T040 — o guia não oferece categoria bloqueada sem desbloqueio (`withoutLockedCategories` em `features/live/channelNumber.ts`, usado em `useLiveGuide.tsx`), com as bloqueadas somadas ao `hiddenBefore` das seguintes (número do canal não muda); **desvio**: a task pedia cadeado + PIN dentro do guia — `EpgGuide.tsx` está no teto (624/624), e a bloqueada entra só pela trilha, com o PIN, o que já cumpre FR-013/FR-014. T041 — `parental/estadosFoco.test.tsx` (carregando/erro/"Tentar de novo"/pedido de PIN do `CategoryManager`, as duas variantes do `SectionEmptyState`, carregando do `SuggestionStep`). T042 — E2E estendido: favorito de Terror some de ★ Favoritos ao esconder e volta ao mostrar (FR-008), busca global (pelo mesmo índice da tela, dentro da página — a lupa saiu da topbar), categoria de canais escondida fora da trilha e de "Todos" da Live (a sequência do zapping), número do canal igual (003 → 003). T043 — decisão do usuário: a falha do PIN mostra código do catálogo de erros — `STO-01` (sem espaço, inclusive embrulhado pelo Dexie) ou `PAR-01` (novo, qualquer outra falha) — nunca o nome cru.
- Contrato: os 5 contratos da 066 verdes; `check-contract-tests.ps1` → PASS, trava íntegra.
- Testes executados: `npx vitest run src/lib/catalog/categoryAccess.leitores.test.ts src/lib/catalog src/components/PlayerLayer` → 729/729; `npx vitest run src/features/live` → 222/222; `npx vitest run src/features/settings/parental/estadosFoco.test.tsx` → 6/6; `npx vitest run src/components/PinPrompt src/lib/errors src/lib/i18n` → 28/28; `npx vitest run src/lib src/features src/components src/navigation src/App` → 2977 verdes, 8 vermelhos = 5 contratos da 067 (outra sessão, vermelhos de propósito) + 3 de `App.source-access` (instáveis, já conhecidos). `node e2e/categorias-controle-parental.mjs` → Tudo certo (1 iteração: com PIN, entrar na aba antes de o PIN ser lido mostra o botão "Digite o PIN" — o roteiro dá OK nele). `node e2e/carrosseis-filmes-series.mjs` → 1 falha em 3 (a que rodou junto da suíte unitária), 2 de 2 sozinho. `npx tsc -b` limpo fora da 067; `npm run lint` → `architecture: ok`.
- Pendências: **resíduo da T042** — fileiras do Início, ↺ Histórico/Continuar assistindo e o guia ficam sem roteiro de tela; cobertos pelos testes unitários dos mesmos leitores (`catalogDerivedRows`, `stableIds`/`continueWatching`, `withoutLockedCategories`). **Instável sob carga**: `carrosseis-filmes-series` (1/3, com a máquina dividida com a suíte unitária) e `App.source-access` — não contam como ok. Não verificado na TV: episódio que não retoma depois do Home e o guia sem bloqueadas.

## Phase 9: Emenda — adulto fora do histórico (FR-035)

**Purpose**: Pedido do usuário em 2026-10-10 depois da convergência: nenhum conteúdo adulto no ↺ Histórico nem no Continuar assistindo, por padrão (D-014).

- [x] T044 Ler `is_adult` do painel Xtream (canais, filmes, séries) e guardar `adult: true` no registro (`lib/catalog/xtreamConnector.ts`, `categoryLoader.ts`, `importPipeline.ts` — tetos: mesma contagem de linhas; campo por augmentation do `CatalogRecord`). Origem: FR-035.
- [x] T045 `getAdultScope(sourceId)` em `lib/catalog/categoryAccess.ts` (nome adulto ∪ bloqueio salvo ∪ `adult: true`) e o filtro em `lib/catalog/history.ts` (filmes e séries, lista e páginas) e `repository/continueWatching.ts`, sem contar como não resolvido; episódio pela série. Origem: FR-035, D-014.
- [ ] T046 Testes: histórico e Continuar sem adulto nos 4 cenários (controle desligado, ligado e bloqueado, sessão desbloqueada, rebloqueado) e com `is_adult` sem nome adulto; reprodução continua gravada; mapeamento do `is_adult` no conector. Origem: FR-035.

**Registro da Fase**:

- Status:
- Feito:
- Contrato: sem contrato nesta fase
- Testes executados:
- Pendências:

