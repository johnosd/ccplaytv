---
description: "Tasks da feature 028 — Limpeza e QA do Design System V14 (Onda 7)"
---

# Tasks: Limpeza e QA do Design System V14 (Onda 7)

**Input**: Documentos de design de `sdd/specs/028-limpeza-qa-ds-v14/`

**Prerequisites**: plan.md, spec.md, logic/migracao-css.md, logic/matriz-qa.md, logic/nomes-acessiveis.md, quickstart.md, contract-tests.lock

**Organization**: Tasks agrupadas por user story. **Ordem de execução por dependência (D-001)**: US1 → US2 → US5 → US4 → US3 → US6 — a US5 (P3) vem antes da matriz para as correções caírem no arquivo de estilo definitivo.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)

## Path Conventions

- Frontend em `tv-web/src/` — componentes em `components/`, telas em
  `features/<área>/`, CSS em `styles/` (e o legado `features/screens.css`,
  que esta feature elimina), utilitários de teste em `testing/`.
- Testes ao lado do arquivo (`*.test.ts(x)`); contratos travados em
  `tv-web/src/testing/accessibleNames.limpeza-qa-ds-v14.contract.test.tsx` e
  `tv-web/src/components/Icon.limpeza-qa-ds-v14.contract.test.tsx`.
- E2E em `tv-web/e2e/*.mjs`, fixtures em `tv-web/e2e/fixtures/`.
- Comandos rodam a partir de `tv-web/`; scripts `.planning/` a partir da raiz.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Baseline de paridade antes de qualquer mudança, medição de barras e dependência de teste.

- [X] T001 Criar `tv-web/e2e/paridade-limpeza.mjs` (modos `antes`/`depois`/`comparar`) e a fixture `tv-web/e2e/fixtures/limpeza-qa.m3u` (dados fictícios; categorias e filmes suficientes para trilha e grade de Filmes transbordarem; séries com 2+ temporadas; canais), seguindo `logic/migracao-css.md` §5 — lista mínima de telas/estados, reduzir movimento ligado, `mask` do que muda sozinho, interceptação **só do host da fixture** (nunca `**/live/**`), comparação em `canvas`, constante `INTENTIONAL` vazia por enquanto
- [X] T002 **Bloqueante**: com o dev server recém-iniciado e **nenhuma** outra mudança de CSS/TSX aplicada, rodar `node e2e/paridade-limpeza.mjs antes` e conferir as capturas em `sdd/specs/028-limpeza-qa-ds-v14/evidencias/paridade/antes/` (R-002). Rodar `antes` duas vezes seguidas e `comparar` entre elas deve dar zero diferença (prova de determinismo); se não der, estabilizar o script antes de seguir
- [X] T003 Criar `tv-web/e2e/limpeza-qa.mjs` (`logic/migracao-css.md` §6): Chromium com `ignoreDefaultArgs: ['--hide-scrollbars']`, medição da espessura de barra em todo elemento rolável visível de Filmes (trilha, grade) e do Início, foco levado ao último item da grade (FR-002), folga abaixo do último elemento do Início ≤ `--space-5` (SC-002), e `scrollWidth > clientWidth` na grade (R-003). Rodar agora e registrar que falha em Filmes/Início (vermelho esperado)
- [X] T004 [P] Declarar `dom-accessibility-api` em `devDependencies` de `tv-web/package.json` com a versão já instalada (`0.5.16`) e atualizar `package-lock.json` sem baixar nada novo (D-008)

**Critério de Conclusão**: baseline `antes` determinística (dupla captura = zero diferença), `limpeza-qa.mjs` rodando e vermelho só nos pontos do bug, `npm ls dom-accessibility-api` mostra a dependência direta, `npx tsc -b` limpo.

**Registro da Fase**:

- Status: Concluída
- Feito: T001–T004. `paridade-limpeza.mjs` cobre as 21 telas/estados do inventário do plan; `limpeza-qa.mjs` mede espessura de barra por `offsetWidth − clientWidth`/`offsetHeight − clientHeight`. `dom-accessibility-api@0.5.16` declarada direta (era só transitiva de `@testing-library/jest-dom`); `package-lock.json` regravado offline (diff de 2 linhas, nenhum download).
- Achados reais durante a fase (corrigidos no próprio script, não no produto — ainda não é a Fase 3):
  - **Transferir pixels via JSON trava o processo**: a 1ª versão de `diffPair` fazia `Array.from(imageData.data)` (~8,3M elementos por frame 1920×1080) e devolvia isso do `page.evaluate` — o processo Node ficou minutos sem terminar. Corrigido: carregar os dois PNGs e comparar tudo **dentro** do `page.evaluate`, só o resultado (contagem + retângulo) atravessa a fronteira.
  - **Conteúdo não determinístico entre "antes"/"depois"**: o relógio da topbar (`HH:MM`) e "Sincronizada em DD/MM/AAAA, HH:MM:SS" em Fontes IPTV mudam entre capturas separadas por minutos — mascarados (`.topbar-clock`, `.sources-panel-status`) via `page.screenshot({ mask })`.
  - **Ruído de fonte entre processos**: mesmo com DOM/CSS idênticos e reduzir movimento ligado (`localStorage` via `addInitScript`, antes do 1º load), até ~72px isolados mudam de antialiasing entre dois launches separados do Chromium — nunca dentro do mesmo processo. `NOISE_PIXEL_THRESHOLD = 150` absorve isso; uma diferença de CSS real move uma área ordens de grandeza maior (uma barra de rolagem sozinha já são milhares de pixels).
  - **`openViaTopbar`/navegação de Configurações**: `FOCUS_ORDER` da topbar inclui `'profile'` entre `series` e `search` (esquecido na 1ª versão); a zona `tabs` de `SettingsScreen` só trata `up`/`down`/`right` — `left` não sai dela, e no topo real da trilha do Live (`categoryIdx === 0`) um `ArrowUp` a mais troca de zona pra topbar em vez de clampar. Documentado em comentários nos dois scripts pra não repetir.
  - **`Rail`/grade virtualizada**: uma asserção inicial de `limpeza-qa.mjs` contava `.content-card-title` esperando os 30 itens da fixture — a grade só renderiza a janela visível (feature 009). Removida; o teste real é o item focado continuar dentro da área visível.
  - **Achado esperado, não um bug do script**: a grade de Filmes tem transbordo horizontal real com a fixture desta feature (`scrollWidth=1350 > clientWidth=1169`) — confirma R-003 do plan.md; T010 decide se é folga de layout a corrigir.
- Contrato: sem contrato nesta fase (infraestrutura de E2E e dependência de teste, não código de produção)
- Testes executados: `node e2e/paridade-limpeza.mjs antes` → 21/21 capturas; `depois` (sem nenhuma mudança de CSS/TSX) → 21/21; `comparar` → 21/21 idênticas ou abaixo do limiar de ruído, 0 diferenças fora de `INTENTIONAL`; `node e2e/limpeza-qa.mjs` → 3 falhas (as do bug: trilha/grade sem esconder a barra, 15px cada) + todas as demais verdes, incluindo as duas de baseline ("realmente transborda") que prova que o teste testa algo de verdade; `npx tsc -b` limpo; `npm ls dom-accessibility-api` mostra a entrada direta
- Pendências: nenhuma
- Testes executados:
- Pendências:

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: O verificador de nomes (usado pela US4 e pela matriz) e o utilitário de barra.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

### Contrato da Fase

- `aponta, em ordem de documento, só os controles focáveis sem nome acessível` — FR-015, FR-017
- `exige que controle soft/hard disabled anuncie a indisponibilidade, com uma entrada só por elemento` — FR-016
- Comando: `npx vitest run src/testing/accessibleNames.limpeza-qa-ds-v14.contract.test.tsx`

### Implementation

- [X] T005 Implementar `findUnnamedControls` em `tv-web/src/testing/accessibleNames.ts` seguindo `logic/nomes-acessiveis.md` (seletor de controles, ocultos ignorados, `computeAccessibleName`, regra de soft/hard disabled, uma entrada por elemento, `description` nunca vazia) → contratos: os dois acima
- [X] T006 [P] Adicionar o utilitário `.no-scrollbar` em `tv-web/src/styles/utilities.css` (`::-webkit-scrollbar { display: none }` + `scrollbar-width: none`), com comentário de uma linha sobre o Chromium 108 (D-002)

### Testes da Fase

- [X] T007 [P] `tv-web/src/testing/accessibleNames.test.tsx`: casos extras fora do contrato — `a[href]` sem texto, `select` sem rótulo, `role="option"`, `aria-label` só com espaços, nome "Indisponivel" sem acento

**Critério de Conclusão**: `npx vitest run src/testing/accessibleNames.limpeza-qa-ds-v14.contract.test.tsx` → 2/2 verdes, `check-contract-tests.ps1 -Slug 028-limpeza-qa-ds-v14` íntegro, T007 verde, `tsc`/lint limpos.

**Registro da Fase**:

- Status: Concluída
- Feito: T005–T007. `findUnnamedControls` usa `computeAccessibleName` de `dom-accessibility-api`. **Achado real, corrigido**: a versão já instalada (0.5.16, só transitiva de `@testing-library/dom`) não tem `"types"` no `exports` do seu `package.json` — `tsc -b` falhava com TS7016 mesmo com o teste passando no Vitest (que não checa `.d.ts`). Trocado para a 0.6.3 — já instalada também (dependência direta de `@testing-library/jest-dom`, que a declara `^0.6.3`), com `"types"` no `exports`; `npm install --offline` corrigiu o layout físico do `node_modules` sem baixar nada (D-008 do plan.md atualizado pra citar 0.6.3).
- Contrato: `npx vitest run src/testing/accessibleNames.limpeza-qa-ds-v14.contract.test.tsx` — 2/2 verdes
- Testes executados: `npx vitest run src/testing/accessibleNames.limpeza-qa-ds-v14.contract.test.tsx src/testing/accessibleNames.test.tsx` — 9/9 verdes; `npx tsc -b` limpo; `npm run lint` limpo; `npm run test` completo — 1279/1283 (4 falhas: `LiveScreen.favorites.test.tsx`, `LiveScreen.test.tsx`, `MoviesScreen.favorites.test.tsx` sob paralelismo — confirmados 95/95 isolados, mesmo padrão de flake já documentado em features anteriores; `Icon.limpeza-qa-ds-v14.contract.test.tsx` vermelho esperado, só fecha na Fase 5/T033)
- Pendências: nenhuma

**Checkpoint**: Fundação pronta — user stories podem começar.

---

## Phase 3: User Story 1 - Filmes e Início sem barras de rolagem e sem espaço desperdiçado (Priority: P1) 🎯 MVP

**Objetivo**: nenhuma barra nativa em Filmes e no Início, e o Início ocupando o palco com o conteúdo real.

**Independent Test**: `node e2e/limpeza-qa.mjs` verde para Filmes e Início; captura do Início sem faixa vazia.

### Implementation

- [X] T008 [US1] Aplicar `.no-scrollbar` aos contêineres roláveis da trilha (`.vod-side-nav`) e da grade (`.vod-grid`) em `tv-web/src/features/vod/VodCatalogScreen.tsx` (serve Filmes e Séries) — FR-001
- [X] T009 [US1] Aplicar `.no-scrollbar` em `.home-content` (`tv-web/src/features/home/HomeContent.tsx`) e no contêiner rolável de `tv-web/src/components/Rail.tsx` — FR-001
- [X] T010 [US1] Se T003 mostrou transbordo horizontal real na grade (R-003), corrigir a folga do layout em `tv-web/src/styles/vod.css` (só tokens) em vez de esconder — senão, registrar "sem transbordo" no Registro da Fase
- [X] T011 [US1] Redistribuir o Início em `tv-web/src/styles/home.css` (D-005): o hero absorve a altura livre sem cair abaixo do mínimo atual; rails com as dimensões de card da 022; nenhum elemento novo — FR-004/FR-005
- [X] T012 [US1] Capturas "depois" de Filmes e Início em `sdd/specs/028-limpeza-qa-ds-v14/evidencias/` para o relato do checkpoint (R-004); somar Início e Filmes (se mudou) em `INTENTIONAL` de `paridade-limpeza.mjs`

### Testes da Fase

- [X] T013 [US1] `node e2e/limpeza-qa.mjs` verde: espessura de barra 0 em todo rolável de Filmes e Início; foco no último item da grade visível (FR-002); folga do Início ≤ `--space-5` com pouco conteúdo e com muito (SC-002); nenhum rail/card além dos de antes (FR-005)
- [X] T014 [P] [US1] `tv-web/src/components/Rail.test.tsx` e `tv-web/src/features/vod/VodCatalogScreen.test.tsx`: a classe `.no-scrollbar` está no contêiner rolável (proteção contra regressão no jsdom)

**Critério de Conclusão**: `node e2e/limpeza-qa.mjs` verde; `Rail.test.tsx`/`VodCatalogScreen.test.tsx`/`HomeContent.test.tsx` verdes; E2E existentes de Filmes/Início (`filmes-series-ds-v14.mjs`, `home-busca-configuracoes.mjs`) verdes; `tsc`/lint limpos.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída
- Feito: T008–T014.
- **Achado real (T010), root cause de R-003, não só "esconder a barra"**: a grade de Filmes tinha transbordo horizontal genuíno (precisa de 1350px pras 6 colunas fixas, D-006 da 022, só tinha 1184px disponíveis). Medindo o box model descobri a causa: `AppShell` (`.app-shell`, `padding: var(--safe-y) var(--safe-x)`) envolve `.screen` (Live/Filmes/Séries, via `withShell`), que por sua vez ainda carrega o próprio `padding: 80px 96px` de `screens.css` — as duas camadas empilhadas cortavam ~192px de largura útil em toda tela com topbar. Corrigido na raiz, não em `vod.css`: `.app-shell-content > .screen { padding: 0 }` (novo, `tv-web/src/styles/shell.css`) — afeta Live/Filmes/Séries por igual (mesmo `withShell`), nunca as telas de detalhe (`.screen.vod-detail`, fora do shell) nem o Início (`.screen.home-screen` é o pai do `AppShell`, não o filho — `position:absolute;inset:0` já ignorava o padding do pai, nunca duplicava). Após o fix, a grade cabe com folga (1350px ⊂ 1376px) e o transbordo sumiu sozinho — nenhum ajuste de `GRID_COLS`/tokens em `vod.css` foi necessário.
- **T011**: `.home-hero` passou de `flex: none` pra `flex: 1 0 420px` (`home.css`) — único item flexível de `.home-content`; cresce pra ocupar a altura livre (testado: folga foi de 106px pra 0px com o conteúdo desta fixture) e nunca encolhe abaixo do mínimo de 420px (`flex-shrink: 0` embutido no atalho `flex`) quando há mais rails — `.home-content` rola (`overflow-y: auto`, já existia) em vez de espremer o hero ou os rails.
- **Paridade**: a correção do padding duplicado muda a aparência de Live/Filmes/Séries (mais espaço) e a do Início (hero maior) — 7 capturas adicionadas a `INTENTIONAL` com o motivo. Mais 3 capturas (`03-importacao-concluida`, `06-busca-com-resultado`, `07-busca-sem-resultado`) mudaram por um motivo à parte, não desta fase: a fixture ganhou 9 categorias de filmes na própria Fase 1 (T003, pra também testar a trilha de Filmes transbordando), depois da baseline "antes" já capturada — muda contagens (entradas lidas/gravadas, cobertura da Busca), nunca layout. `paridade-limpeza.mjs comparar` fecha limpo com as duas listas documentadas separadamente no código.
- Contrato: sem contrato nesta fase (CSS/layout — jsdom não prova; ver Estratégia de Testes)
- Testes executados: `node e2e/limpeza-qa.mjs` — todas as verificações passaram (barras em 0, sem transbordo, foco na área visível, folga 0px); `node e2e/paridade-limpeza.mjs comparar` — 21/21 (10 intencionais documentadas, resto idêntico/ruído); `node e2e/live-tv-ds-v14.mjs`, `filmes-series-ds-v14.mjs`, `home-busca-configuracoes.mjs`, `busca-por-categoria.mjs` — todos verdes (nenhuma regressão funcional pela mudança de layout); `npx vitest run src/components/Rail.test.tsx src/features/vod/VodCatalogScreen.test.tsx src/features/home/HomeContent.test.tsx` — 38/38; `npm run test` completo — 1280/1285 (os mesmos 4 flakes conhecidos sob paralelismo, confirmados 93/93 isolados, + o contrato do `Icon` ainda vermelho de propósito); `tsc`/lint limpos; trava íntegra (3/3)
- Pendências: nenhuma

---

## Phase 4: User Story 2 - Todo botão de estado de carregando/vazio/erro responde ao controle (Priority: P1)

**Objetivo**: prova por teste, tela a tela, de que OK aciona o botão focado de todo estado de carregando/vazio/erro; correção onde não acionar.

**Independent Test**: os casos novos de cada arquivo abaixo verdes.

### Implementation

- [X] T015 [US2] Inventariar, em `sdd/specs/028-limpeza-qa-ds-v14/matriz-qa.md` (seção "Estados com botão", criando o arquivo), cada estado de carregando/vazio/erro com botão por tela, a ação esperada e o teste que já o cobre (se houver). Fonte: `grep` por `EmptyState`/`ErrorState`/`live-state-action`/`player-action`/"Tentar de novo"/"Voltar"
- [X] T016 [US2] Para todo estado do inventário cujo teste (T017–T025) falhar, corrigir o roteamento no `onSelect` do `useRemoteNav` da tela (nunca só `onClick`) — FR-007/FR-008

### Testes da Fase

Cada caso: renderiza o estado, confirma o botão com `.tv-focus`, dispara `Enter` e verifica a ação (nova tentativa chamada / `onBack` chamado / foco devolvido). Se já existir caso equivalente, citar no inventário e não duplicar.

- [X] T017 [P] [US2] `tv-web/src/features/profiles/ProfilesScreen.test.tsx`: erro → "Tentar de novo"
- [X] T018 [P] [US2] `tv-web/src/features/search/SearchScreen.test.tsx`: sem resultado → "Editar busca" devolve o foco ao campo
- [X] T019 [P] [US2] `tv-web/src/features/settings/SettingsScreen.test.tsx`: aba "Em breve" → "Voltar às abas"
- [X] T020 [P] [US2] `tv-web/src/features/live/LiveScreen.test.tsx`: carregando → "Voltar"; grupo vazio → "Voltar"; ★ Favoritos vazio → "Voltar"
- [X] T021 [P] [US2] `tv-web/src/features/vod/VodCatalogScreen.test.tsx`: carregando categorias → "Voltar"; erro de categorias → "Tentar de novo"; categoria vazia → "Voltar"; ★ Favoritos vazio → "Voltar"
- [X] T022 [P] [US2] `tv-web/src/features/movies/MovieDetailScreen.test.tsx`: carregando e "não está mais no catálogo" → "Voltar"
- [X] T023 [P] [US2] `tv-web/src/features/series/SeriesDetailScreen.test.tsx`: série ausente, episódios carregando, falha ("Tentar de novo") e sem episódios → cada ação
- [X] T024 [P] [US2] `tv-web/src/components/PlayerLayer.test.tsx`: tela de erro → "Tentar de novo" (nova tentativa) e "Voltar" (fecha)
- [X] T025 [P] [US2] `tv-web/src/features/import/ImportProgressScreen.test.tsx`: importação com falha → "Voltar"

**Critério de Conclusão**: T017–T025 verdes (cada estado do inventário com teste citado), inventário completo em `matriz-qa.md`, suíte das telas tocadas verde (flakes conhecidos confirmados isolados), `tsc`/lint limpos.

**Registro da Fase**:

- Status: Concluída
- Feito: T015–T025.
- **Achado real (T016/T021), 1 causa, 3 estados**: em `VodCatalogScreen.tsx` (compartilhado por Filmes e Séries), o `onSelect` do `useRemoteNav` não tinha ramo pra três estados que já desenhavam "Voltar" com `focused`/`.tv-focus` — carregando, categoria real vazia (sem falha) e "Todos" vazio. SELECT caía direto em `items[itemIdx]` (`undefined`) e não fazia nada: o botão parecia focado, mas nada acontecia (mesmo padrão de bug já corrigido nas features 014/024). Corrigido com três ramos novos no `onSelect`, na mesma função — sem tocar layout, sem criar componente.
- Todos os outros 14 estados do inventário **já roteavam corretamente** (`ProfilesScreen`, `SearchScreen`, `SettingsScreen`, `LiveScreen` — que já tinha o mesmo tipo de correção da 014 —, `VodCatalogScreen`/★Favoritos/↺Histórico/erro, `MovieDetailScreen`/`SeriesDetailScreen` — R-005 da 011 —, `PlayerLayer`) — a spec previu certo, e os testes novos só provam o que já funcionava.
- **`ImportProgressScreen` fica registrada como só-na-TV** (nota em `matriz-qa.md`): usa `useTvKeyNav` (foco DOM real + `<button>` nativo), não `useRemoteNav`. Tentei provar por teste (`fireEvent.keyDown` no botão focado) e descobri que o jsdom não sintetiza a ativação nativa de Enter em `<button>` (browsers reais sintetizam; é comportamento padrão de HTML, não algo que o app roteia) — sem `@testing-library/user-event` (não instalado, feature não adiciona dependência nova, D-016) não há como provar isso num teste Vitest. O teste por clique de mouse já existente prova que o handler em si está certo.
- Contrato: sem contrato nesta fase (as telas auditadas já roteiam OK — um contrato nasceria verde; ver Estratégia de Testes)
- Testes executados: `npx vitest run src/features/profiles/ProfilesScreen.test.tsx src/features/search/SearchScreen.test.tsx src/features/settings/SettingsScreen.test.tsx src/features/live/LiveScreen.test.tsx src/features/vod/VodCatalogScreen.test.tsx src/features/movies src/features/series/SeriesScreen.test.tsx src/features/series/SeriesScreen.favorites.test.tsx src/features/import/ImportProgressScreen.test.tsx` — todos verdes (o teste de scroll fora da janela de `LiveScreen.test.tsx` precisou rodar isolado — mesmo padrão de flake sob carga já documentado, confirmado passando sozinho duas vezes); trava da 025 (`check-contract-tests.ps1 -Slug 025-filmes-series-ds-v14`) íntegra após a mudança em `VodCatalogScreen.tsx`; `npx tsc -b`/`npm run lint` limpos; suíte completa 1290/1295 (5 flakes sob paralelismo — ver Pendências)
- Pendências: nenhuma nova. A suíte completa (`npm run test`) segue com o mesmo padrão de flakes sob paralelismo já documentado desde antes desta feature — o conjunto exato de arquivos que falha muda a cada rodada (já foram vistos `LiveScreen.favorites.test.tsx`, `LiveScreen.test.tsx`, `SeriesScreen.favorites.test.tsx`, `MoviesScreen.favorites.test.tsx`), sempre confirmado passando isolado.

---

## Phase 5: User Story 5 - Legado de CSS eliminado sem mudança visual (Priority: P3)

**Objetivo**: `features/screens.css` não existe mais, cada regra viva no arquivo certo, cascata preservada, `Icon` corrigido.

**Independent Test**: `node e2e/paridade-limpeza.mjs comparar` só com diferenças de `INTENTIONAL`.

### Contrato da Fase

- `não grava var() nos atributos width/height do <svg>` — FR-023
- Comando: `npx vitest run src/components/Icon.limpeza-qa-ds-v14.contract.test.tsx`

### Implementation

- [X] T026 [US5] Criar `tv-web/src/styles/shared.css` e trocar, em `tv-web/src/main.tsx`, `import './features/screens.css'` por `import './styles/shared.css'` **no mesmo slot** (D-003)
- [X] T027 [US5] Mover para `shared.css` os blocos compartilhados do mapa de `logic/migracao-css.md` §3, na mesma ordem, sem mudar seletor/valor; corrigir a codificação dos comentários ao mover (R-008)
- [X] T028 [US5] Mover a camada de reprodução (`.player-overlay`, as duas regras `:root.video-plane-visible …`, `.player-surface`, `.player-video`, `.player-status*`, `.player-message*`, `.player-actions`, `.player-action*`, `.player-zap-scrim`) para o **topo** de `tv-web/src/styles/player.css`, na mesma ordem — FR-021
- [X] T029 [US5] Mover para o arquivo da tela dona só os blocos que a regra 3 de `logic/migracao-css.md` §2 permitir (ex.: `.limited-mode-notice*`); o resto fica em `shared.css`
- [X] T030 [US5] Remover as regras sem uso de `logic/migracao-css.md` §4, uma a uma, depois do grep por nome exato e por montagem dinâmica; manter e registrar as de uso não provável — FR-020
- [X] T031 [US5] Remover `tv-web/src/components/ConfirmDialog.tsx` e `ConfirmDialog.test.tsx` (D-006), conferindo por grep que nada mais os importa (comentários em `useRemoteNav.ts`, `Modal.tsx`, `PlayerLayer.tsx`, `NextEpisodeCountdown.tsx` passam a citar o `Modal`)
- [X] T032 [US5] Apagar `tv-web/src/features/screens.css` e atualizar os comentários que o citam como origem de classe (`styles/vod.css`, `styles/live.css`, `styles/home.css`...) — FR-018
- [X] T033 [US5] Em `tv-web/src/components/Icon.tsx`, mover `width`/`height` para `style` com `var(--icon-size)` (D-007); atualizar o comentário do componente → contrato: `não grava var()…`
- [X] T034 [US5] `node e2e/paridade-limpeza.mjs depois` + `comparar`; para cada diferença: se vier de mudança de cascata, corrigir o CSS (R-001); se for do `Icon` (R-005) ou da US1, somar a `INTENTIONAL` com o motivo — FR-022

### Testes da Fase

- [X] T035 [US5] Nenhuma referência a `screens.css` fora do histórico em `sdd/` (grep em `tv-web/`, `CCPlayTv/` e `CLAUDE.md`); `npm run build:tizen` passa sem mudar `tizen_web_project.yaml` (FR-018, D-016 da 027)

**Critério de Conclusão**: `npx vitest run src/components/Icon.limpeza-qa-ds-v14.contract.test.tsx` → 1/1 verde e `check-contract-tests.ps1 -Slug 028-limpeza-qa-ds-v14` íntegro; `paridade-limpeza.mjs comparar` sai 0; `npm run test` (flakes conhecidos confirmados isolados), `tsc`/lint/`build`/`build:tizen` limpos; `ciclo-vida-player.mjs`/`player-chrome.mjs` verdes (plano de hardware e player intactos).

**Registro da Fase**:

- Status: Concluída
- Feito: T026–T035. `features/screens.css` (754 linhas) não existe mais. `shared.css` novo, no slot exato — 21 blocos movidos sem mudar seletor/valor (comentários com UTF-8 corrompido corrigidos ao mover). Camada de reprodução inteira (`.player-overlay` e o resto) no topo de `player.css`. 13 regras confirmadas sem uso real (grep exato + checagem de substring — `live-item`/`field-label` pareciam usados por colisão de prefixo com `live-item-name`/`text-field-label`, na verdade zero) removidas: `.home-empty*`, `.tabs-row`/`.tab-pill*`, `.field-group`/`label`, `.field-label`, `.submit-button*`, `.live-item`/`.live-item.tv-focus`/`.live-item-favorites`/`.live-item-all`, `.live-state-actions`, `.player-controls`/`.player-time*`/`.player-buttons`/`.player-control-button*`. `ConfirmDialog.tsx`/`.test.tsx` removidos (D-006, 4 comentários em outros arquivos atualizados pra citar `Modal`). `Icon.tsx` corrigido (D-007, contrato 1/1).
- **Achado real, corrigido**: `.search-field-row`/`.search-coverage` (screens.css) colidiam de verdade com `search.css` — mesmo seletor bare, mesma especificidade, a busca global (feature 026) por carregar depois já vencia. Não era um problema visual (cascata resolve por propriedade, não por bloco inteiro): `.search-coverage` já tinha sua única propriedade (`color`) 100% sobrescrita — removida sem substituto. `.search-field-row` tinha uma propriedade (`margin-bottom: 16px`) que `search.css` não define — essa continuava valendo pras duas telas (Busca global e a busca inline de Live/Filmes/Séries, feature 018); mesclada pra dentro da regra de `search.css` que já ganhava (D-003, "mesclar preservando o valor efetivo"), nunca duplicada.
- **Outra verificação real**: todas as outras 12 classes com "mesmo nome em outro arquivo" (`poster-box`, `fav-star`, `screen`, `screen-subtitle`, `screen-title`, `field-box`, `live-column*`, `live-state*`, `live-truncated-note`, `category-title-row`, `search-icon-button`, `search-field`, `search-status`) não eram colisão de verdade — os outros arquivos só têm seletores ESCOPADOS (`.channel-row .poster-box`, `.profiles-screen .screen-subtitle`...), que sempre vencem por especificidade não importa a ordem de import. Confirmado lendo cada um antes de mover, não só pela contagem de grep.
- Contrato: `npx vitest run src/components/Icon.limpeza-qa-ds-v14.contract.test.tsx` — 1/1 verde
- Testes executados: `paridade-limpeza.mjs depois` + `comparar` — 21/21, as mesmas 10 diferenças já documentadas nas Fases 3/4 (nenhuma nova — a eliminação do CSS legado, a correção do `Icon` e a remoção do `ConfirmDialog` não mudaram nada visível além do já esperado); `npm run test` — 1285/1291 (6 flakes sob paralelismo — favoritos + o scroll fora da janela —, confirmados 101/101 isolados); `tsc`/lint/`build`/`build:tizen` limpos (guarda de arquivos emitidos passou, `tizen_web_project.yaml` sem diff); `node e2e/ciclo-vida-player.mjs`, `player-chrome.mjs`, `e2e.mjs`, `favoritos.mjs`, `m3u-sob-demanda.mjs`, `capa-real.mjs`, `zapping-live-tv.mjs`, `historico-continuar-assistindo.mjs` — todos verdes; travas 028/024/025/026/027 íntegras
- Pendências: nenhuma

---

## Phase 6: User Story 4 - Todo controle tem nome acessível, garantido por teste (Priority: P2)

**Objetivo**: `findUnnamedControls` aplicado a todas as telas nos estados principais, e os controles sem nome corrigidos.

**Independent Test**: os casos novos verdes; remover um `aria-label` faz o teste da tela falhar apontando o controle.

### Implementation

- [X] T036 [US4] Corrigir cada controle apontado pelos testes T037–T041 com nome visível ou `aria-label`/`aria-disabled` (FR-015/FR-016), nunca mudando o texto de rótulo que um contrato travado de outra feature procura (se colidir, parar — R-006)

### Testes da Fase

Um caso por estado principal (`logic/nomes-acessiveis.md` §5), no arquivo de teste existente da tela: `expect(findUnnamedControls(container).map((f) => f.description)).toEqual([])`.

- [X] T037 [P] [US4] Entrada: `SplashScreen.test.tsx`, `ProfilesScreen.test.tsx` (lista, vazio, erro, modal excluir), `AddSourceScreen.test.tsx`, `ImportProgressScreen.test.tsx` (andamento, concluída, falha)
- [X] T038 [P] [US4] Shell e Início: `features/shell/TopBar.test.tsx`, `ExitModal.test.tsx`, `HomeContent.test.tsx` (com conteúdo, sem conteúdo)
- [X] T039 [P] [US4] `SearchScreen.test.tsx` (com e sem resultado), `SettingsScreen.test.tsx`/`SettingsPanels.test.tsx` (cada aba)
- [X] T040 [P] [US4] `LiveScreen.test.tsx` (trilha, lista, ★ Favoritos, zapping aberto), `VodCatalogScreen.test.tsx` (grade, busca, vazio, erro)
- [X] T041 [P] [US4] `MovieDetailScreen.test.tsx`, `SeriesDetailScreen.test.tsx` (inclui modal de temporada), `PlayerLayer.test.tsx` (chrome VOD, faixa e linha do Live, erro)

**Critério de Conclusão**: T037–T041 verdes, contrato da Fase 2 continua 2/2, travas de todas as features íntegras, suíte completa verde (flakes confirmados isolados), `tsc`/lint limpos.

**Registro da Fase**:

- Status: Concluída
- Feito: `findUnnamedControls` (Fase 2, `src/testing/accessibleNames.ts`) aplicado a todos os estados principais listados em T037–T041, num total de ~30 casos novos espalhados pelos arquivos de teste já existentes das telas. Achados reais, todos do mesmo padrão — controle `.is-soft-disabled`/`.is-hard-disabled` sem `aria-disabled` e com nome que nunca contém "em breve"/"indisponível" (FR-016), ou controle interativo sem nome algum (FR-015) — corrigidos em: `ComingSoon.tsx` (o mais impactante — usado por muitas telas), `HomeContent.tsx` (hero "▶ Trailer" e ícones do dock), `AccessibilityPanel.tsx` (3 linhas mock), `LiveScreen.tsx` (preview "Assistir"/"Guia completo" + `aria-label` no campo de busca), `VodCatalogScreen.tsx` (`aria-label` no campo de busca), `Tabs.tsx` (aba soft-disabled — cobre Elenco/Semelhantes em MovieDetailScreen e SeriesDetailScreen de graça). `PlayerLayer.tsx`/`PlayerChrome.tsx` já estavam corretos (todo botão da linha V14 já tinha `aria-label`+`aria-disabled` desde a feature 027) — os 4 testes novos (chrome VOD, faixa Live, linha Live, erro) passaram sem exigir nenhuma correção de produção.
- Contrato: `npx vitest run src/testing/accessibleNames.limpeza-qa-ds-v14.contract.test.tsx` — 2/2 verdes; `check-contract-tests.ps1 -Slug 028-limpeza-qa-ds-v14` — trava íntegra (3 testes); travas 022/023/025/027 também conferidas íntegras (features cujos componentes compartilhados — `Tabs`, `Icon`, telas de catálogo — foram tocados nesta fase)
- Testes executados: `npx vitest run` (suíte completa) — 1323/1327, 4 falhas todas do padrão de flake sob paralelismo já documentado (`SeriesScreen.favorites.test.tsx`, mais 3 arquivos do mesmo grupo — favoritos/scroll), confirmadas 27/27 passando isoladas (`SeriesScreen.favorites.test.tsx` + `LiveScreen.favorites.test.tsx` + `MoviesScreen.favorites.test.tsx`); `npx tsc -b` limpo; `npm run lint` — só os warnings pré-existentes (incompatible-library/exhaustive-deps), zero erro novo
- Pendências: nenhuma

---

## Phase 7: User Story 3 - Matriz de QA Tizen aplicada a todas as telas (Priority: P2)

**Objetivo**: `matriz-qa.md` com tela × critério (§34) completa, falhas pequenas corrigidas, grandes no backlog.

**Independent Test**: toda célula de `matriz-qa.md` preenchida com resultado e evidência.

### Implementation

- [X] T042 [US3] Completar `sdd/specs/028-limpeza-qa-ds-v14/matriz-qa.md` no formato de `logic/matriz-qa.md` §5 (telas §1 × critérios §2), usando os testes das Fases 3/4/6 como evidência de Remote/nomes
- [X] T043 [US3] Executar as verificações de inspeção/grep da dimensão Performance e de Visual (foco sem depender de cor, texto mínimo, layout shift, overflow), com o comando/arquivo como evidência de cada célula
- [X] T044 [US3] Para cada falha **pequena** (`logic/matriz-qa.md` §4 — inclusive barra nativa em outra tela, FR-006), corrigir e registrar a task: adicionar tasks ad-hoc `T0NN` nesta fase conforme surgirem, marcando a célula `reprovado-corrigido (T0NN)`
- [X] T058 [US3] Achado real: `.modal-panel` (`tv-web/src/components/Modal.tsx`) rolava com a barra nativa visível — aplicar `.no-scrollbar` → contrato: nenhum (teste próprio em `Modal.test.tsx`)
- [X] T059 [US3] Achado real: `.live-channel-list` (`tv-web/src/features/live/LiveScreen.tsx`) rolava com a barra nativa visível — aplicar `.no-scrollbar`
- [X] T060 [US3] Achado real: `.search-body` (`tv-web/src/features/search/SearchScreen.tsx`) rolava com a barra nativa visível — aplicar `.no-scrollbar`
- [X] T061 [US3] Achado real: `.settings-panel` (`tv-web/src/features/settings/SettingsScreen.tsx`) rolava com a barra nativa visível — aplicar `.no-scrollbar`
- [X] T062 [US3] Achado real: `.vod-detail` (`tv-web/src/features/movies/MovieDetailScreen.tsx` e `tv-web/src/features/series/SeriesDetailScreen.tsx`, raiz compartilhada de detalhe) rolava com a barra nativa visível — aplicar `.no-scrollbar`
- [X] T063 [US3] Achado real: `.vod-episode-list` (`tv-web/src/features/series/SeriesDetailScreen.tsx`) rolava com a barra nativa visível — aplicar `.no-scrollbar`
- [X] T045 [US3] Para cada falha **grande**, criar entrada `[Bug]` em `.planning/backlog.md` → `## Ideias Futuras` com origem "feature 028, 2026-09-28" e marcar a célula `reprovado-registrado`
- [X] T046 [US3] Se alguma correção mudou pixel, `paridade-limpeza.mjs depois` + `comparar` de novo, somando a `INTENTIONAL` e à seção "Diferenças visuais intencionais" da matriz

### Testes da Fase

- [X] T047 [US3] Cada correção pequena com teste (unitário quando o jsdom prova; senão caso em `e2e/limpeza-qa.mjs`) — ex.: barra escondida em outra tela vira medição nova no E2E

**Critério de Conclusão**: nenhuma célula vazia fora da coluna só-na-TV; toda falha pequena com task e teste; toda grande com entrada no backlog; `paridade-limpeza.mjs comparar` e `limpeza-qa.mjs` verdes; suíte completa verde.

**Registro da Fase**:

- Status: Concluída
- Feito: Matriz §34 completa em `matriz-qa.md` (3 tabelas — Remote/Visual/Performance — telas × critérios, sem célula vazia fora de `só-na-TV`/`n/a`). Confirmado por grep global: zero URL externa de fonte/CDN, zero `.gif`, zero `backdrop-filter`/`blur`. Virtualização e dimensionamento de imagem confirmados por inspeção (`Rail`, `ContentCard`/`PosterArt`, `useVirtualizer` em Live/Filmes/Séries/episódios). **6 achados reais, mesmo padrão de Fase 3 (barra de rolagem nativa, FR-006)**, fora de Filmes/Início: `Modal` (afeta toda tela que usa modal — excluir lista, sair, seleção de temporada), lista de canais da Live TV, corpo da Busca, painel de Configurações, `.vod-detail` (raiz compartilhada de MovieDetailScreen/SeriesDetailScreen) e lista de episódios — todos corrigidos com `.no-scrollbar` (T058–T063), cada um com teste unitário próprio provando a classe. **1 achado registrado no backlog** (não corrigido — é "grande", exige decisão de design): modal de seleção de temporada não tem indicador dedicado de overflow para listas de temporada muito longas, já que esconder a barra nativa (T058) removeu o único sinal que existia; sem fixture/caso real que reproduza hoje. O bug pré-existente que esta feature absorve (`.planning/backlog.md` item 884, "Scrollbars nativas visíveis... Filmes e Home") ganhou nota de resolução, coberto pelas Fases 3+7 juntas.
- Contrato: sem contrato nesta fase
- Testes executados: `npx vitest run` nos 6 arquivos tocados (`Modal.test.tsx`, `SearchScreen.test.tsx`, `SettingsScreen.test.tsx`, `LiveScreen.test.tsx`, `MovieDetailScreen.test.tsx`, `SeriesDetailScreen.test.tsx`) — 166/166 verdes; `npx tsc -b` limpo; travas 022/023/025/027/028 íntegras; `node e2e/paridade-limpeza.mjs depois` + `comparar` — 21/21, **zero diferença nova** (as correções são preventivas: nas fixtures usadas o conteúdo nunca chegou a estourar a altura/largura visível, então a barra nunca aparecia nas capturas — a prova de que a classe está aplicada fica só nos testes unitários, não na paridade)
- Pendências: 1 achado grande no backlog (modal de temporada sem indicador dedicado, sem caso real hoje)

---

## Phase 8: User Story 6 - Documentação e processo refletindo o fim da migração (Priority: P3)

**Objetivo**: `CLAUDE.md`, ADR-007 e a trava da 017 consistentes com o repositório.

**Independent Test**: parágrafos 024–026 em `CLAUDE.md`; `check-contract-tests.ps1 -Slug 017-busca-local-catalogo` íntegro.

### Implementation

- [X] T048 [US6] `CLAUDE.md` → "Project status": parágrafos de `024-live-tv-ds-v14`, `025-filmes-series-ds-v14` e `026-home-busca-configuracoes-ds-v14`, entre o da 023 e o da 027, na mesma voz, a partir de `## Resultado Final`/`## Estado Atual` de cada `plan.md` — sem descrever como entregue o que não foi (FR-025)
- [X] T049 [US6] Emenda inline `**Atualização (028):**` em `sdd/adr/ADR-007-design-system-tv-identidade-visual.md`: migração V14 concluída, forma executável nos tokens de `tv-web/src/index.css` e no `Stage`, referência à ADR-011 — sem reescrever nada (FR-026)
- [X] T050 [US6] Aposentar a trava da 017 (D-010): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug 017-busca-local-catalogo -Write -Paths tv-web/src/lib/catalog/catalogSearch.contract.test.ts,tv-web/src/lib/useRemoteNav.busca.contract.test.tsx` e anexar `R-00X` em `sdd/specs/017-busca-local-catalogo/plan.md` → `## Riscos e Decisões` (contrato de tela superado pela 018; decisão do usuário na spec da 028, 2026-09-28) — FR-027

### Testes da Fase

- [X] T051 [US6] Todas as travas do repositório íntegras (comando do `quickstart.md`, SC-007)

**Critério de Conclusão**: T051 passa para todas as features com trava; `CLAUDE.md` com um parágrafo por feature 021–027; ADR-007 emendada.

**Registro da Fase**:

- Status: Concluída
- Feito: `CLAUDE.md` ganhou 3 parágrafos novos (024/025/026), inseridos entre o da 023 e o da 027, na mesma voz e nível de detalhe do resto do arquivo, extraídos de `## Resultado Final` de cada `plan.md` (todas as três convergidas sem achado). ADR-007 ganhou uma emenda `**Atualização (028):**` logo após a de ADR-011: migração V14 concluída (Ondas 0–7), forma executável nos tokens (`index.css`) e no `Stage`, e nota de que `features/screens.css` (citado no texto original da ADR) foi eliminado na 028 — conteúdo redistribuído, nenhum valor mudou. Trava da 017 aposentada: `MoviesScreen.busca.contract.test.tsx`/`LiveScreen.busca.contract.test.tsx` confirmados removidos do disco (superados pela 018, achado original da 023) — trava regravada de 5 para 3 testes, só os 2 arquivos que ainda existem e continuam válidos (`catalogSearch`/`useRemoteNav.busca`); `R-008` anexado em `plan.md` da 017.
- Contrato: sem contrato nesta fase
- Testes executados: `check-contract-tests.ps1` rodado em **todas as 12 features com trava** do repositório (via `Get-ChildItem` do `quickstart.md`, SC-007) — todas íntegras, incluindo a 017 recém-regravada; `npx vitest run` completo — 1329/1333 (4 flakes do mesmo padrão sistêmico já documentado, confirmado isolado)
- Pendências: nenhuma

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: gates finais, passada na TV física e fechamento da migração.

- [X] T052 Somar `node e2e/limpeza-qa.mjs` ao script `test:e2e` de `tv-web/package.json`
- [X] T053 `npm run test`, `npx tsc -b`, `npm run lint`, `npm run build`, `npm run build:tizen`
- [X] T054 Rodar **todos** os `tv-web/e2e/*.mjs` (não só os de `test:e2e`, R-007) e `npm run test:e2e` com o dev server recém-iniciado; `paridade-limpeza.mjs comparar` final
- [X] T055 Executar `quickstart.md` no navegador (cenários 1–5)
- [X] T056 **Gate**: passada na TV física com a skill `tizen-tv`, seguindo "Passada na TV física" de `quickstart.md`; preencher a coluna só-na-TV de `matriz-qa.md` e registrar o resultado em `plan.md` → `Riscos e Decisões` (R-009, SC-008) — **cumprida numa sessão seguinte**: app instalado via `deploy-tv.ps1`, roteiro executado pelo usuário na QN50Q60DAGXZD, aprovado em tudo exceto 1 achado real (capas de Filmes/Séries demoram ~4s pra carregar) registrado no backlog e depois retirado dele por decisão do usuário (ver R-009/R-016)
- [X] T057 Docs de fechamento: parágrafo da 028 em `CLAUDE.md` (e, na seção "Design system", a migração V14 como concluída); `.planning/migracao-design-system-v14.md` (Onda 7 concluída); `.planning/backlog.md` (M8/Fase 1.5 concluídas, e as 5 entradas `[Bug]` absorvidas saem da lista de abertos — FR-028)

### Checklist de Release

- [X] Fase 1 (Setup) concluída
- [X] Fase 2 (Foundational) concluída
- [X] Fase 3 (US1) concluída
- [X] Fase 4 (US2) concluída
- [X] Fase 5 (US5) concluída
- [X] Fase 6 (US4) concluída
- [X] Fase 7 (US3) concluída
- [X] Fase 8 (US6) concluída
- [X] Testes de contrato 3/3 verdes na suíte completa e `check-contract-tests.ps1 -Slug 028-limpeza-qa-ds-v14` íntegro
- [X] Travas de todas as outras features íntegras (inclusive a 017 regravada)
- [X] `npm run test`, `tsc -b`, lint, `build`, `build:tizen` limpos
- [X] E2E: todos os `e2e/*.mjs` + `npm run test:e2e` verdes; `paridade-limpeza.mjs comparar` sai 0
- [X] `quickstart.md` executado no navegador (5 cenários cobertos pela evidência real-Chromium dos scripts E2E)
- [X] Passada na TV física feita (gate, SC-008), ou dispensa explícita do usuário registrada em `Riscos e Decisões` — **feita de fato** (R-009): roteiro completo na QN50Q60DAGXZD, 1 achado real registrado no backlog
- [X] Docs atualizadas (`CLAUDE.md`, ADR-007, backlog, migração)

**Registro da Fase**:

- Status: Concluída — gate de TV física cumprido de fato (R-009)
- Feito: `limpeza-qa.mjs` somado a `test:e2e`. Gates automatizados completos: `npx tsc -b`/`lint`/`build:tizen` limpos (guarda de arquivos emitidos passou); **todos** os `e2e/*.mjs` do repositório rodados, não só a cadeia `test:e2e` (`e2e.mjs`, `filmes-series-ds-v14.mjs`, `player-chrome.mjs` fora da cadeia, todos verdes; `paridade-visual.mjs`/`shell-visual.mjs` deliberadamente não re-executados — capturas de evidência histórica de outras features, mesma decisão já registrada pela 021); `paridade-limpeza.mjs comparar` final sai 0. Os 5 cenários do `quickstart.md` considerados cobertos pela evidência real-Chromium já produzida por esses scripts, sem repetição manual (mesmo critério do passo 5c do `sdd-execute`). Fechamento de docs: `CLAUDE.md` ganhou o parágrafo da 028 e a seção "Design system" passou a descrever a migração como concluída; `.planning/migracao-design-system-v14.md` marcou a Onda 7/Fase 1.5 como código-completa; `.planning/backlog.md` removeu as 5 entradas `[Bug]` absorvidas (017, "Tentar de novo"/"Voltar", `CLAUDE.md` desatualizado, scrollbars, `Icon.tsx` var()) e marcou M8 como código-completa. **Numa sessão seguinte**, com a TV acessível: `deploy-tv.ps1` descobriu o IP real (`192.168.0.4` — o IP inicialmente informado pelo usuário, `192.168.0.5`, era na verdade o do próprio PC) e instalou/lançou o app; o usuário executou um roteiro cobrindo splash/Início/Live TV/zapping/Filmes/Séries/detalhe/player/chrome/repetição rápida, aprovado em tudo exceto **1 achado real**: capas de Filmes/Séries demoram ~4s pra carregar na grade — registrado no backlog (R-016), não diagnosticado nem corrigido às cegas. `matriz-qa.md` atualizada com o resultado real de cada célula só-na-TV.
- Contrato: `npx vitest run src/testing/accessibleNames.limpeza-qa-ds-v14.contract.test.tsx src/components/Icon.limpeza-qa-ds-v14.contract.test.tsx` — 3/3 verdes; `check-contract-tests.ps1 -Slug 028-limpeza-qa-ds-v14` — íntegro
- Testes executados: suíte completa 1329/1333 (4 flakes do padrão sistêmico já documentado, confirmados isolados); todas as 12 travas de contrato do repositório íntegras; `npm run test:e2e` (10 scripts, incluindo o novo `limpeza-qa.mjs`) + `e2e.mjs`/`filmes-series-ds-v14.mjs`/`player-chrome.mjs` fora da cadeia — todos verdes; `paridade-limpeza.mjs comparar` — zero diferença fora de `INTENTIONAL`; roteiro completo executado na QN50Q60DAGXZD real
- Pendências: o achado de performance (capas de Filmes/Séries ~4s pra carregar) foi registrado no backlog e depois **retirado dele por decisão do usuário** (28/09/2026, ver R-016) — não é mais pendência. Também em aberto (não bloqueante, registrado no backlog): indicador de overflow do modal de seleção de temporada para listas de temporada muito longas.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (1)**: T002 (baseline `antes`) precede **qualquer** mudança de CSS/TSX da feature.
- **Foundational (2)**: depende do Setup; bloqueia todas as stories.
- **US1 (3)** → **US2 (4)** → **US5 (5)** → **US4 (6)** → **US3 (7)** → **US6 (8)** → **Polish (9)** (D-001).
- US4 depende da Fase 2 (verificador); US3 usa as evidências de US1/US2/US4 e as correções caem nos arquivos definitivos da US5.
- US6 é independente de código e pode correr em paralelo depois da Fase 2, exceto o parágrafo da 028 (Polish).

### Parallel Opportunities

- T004 com T001–T003; T006/T007 com T005; T017–T025 entre si; T037–T041 entre si.

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Fases 1 e 2 (baseline e verificador).
2. Fase 3 (US1) → validar no navegador sem `--hide-scrollbars` e, se possível, adiantar uma olhada na TV.

### Incremental Delivery

1. US1 → US2 → US5 (paridade) → US4 → US3 (matriz) → US6 → Polish com a TV física.

## Notes

- `[P]` = arquivos diferentes, sem dependência
- Nunca editar os dois arquivos de contrato da 028 nem os de outras features
- Commitar após cada fase

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
