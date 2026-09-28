---
description: "Tasks da feature 026 — Home definitiva, Busca global e Configurações no DS V14 (Onda 5)"
---

# Tasks: Home definitiva, Busca global e Configurações no Design System V14 (Onda 5)

**Input**: Documentos de design de `sdd/specs/026-home-busca-configuracoes-ds-v14/`

**Prerequisites**: plan.md, spec.md, `logic/*.md`, `contract-tests.lock`

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (US1, US2, US3)
- Caminhos relativos à raiz do repositório

## Path Conventions

- Frontend único em `tv-web/`; comandos rodam dentro de `tv-web/`.
- Lógica sem React: `tv-web/src/lib/catalog/`; hooks: `tv-web/src/features/catalog/catalogApi.ts`.
- Telas: `tv-web/src/features/<área>/`; componentes V14: `tv-web/src/components/`.
- Navegação: `tv-web/src/navigation/appNav.ts`; roteamento: `tv-web/src/App.tsx`.
- CSS: `tv-web/src/styles/*.css` (importados em `tv-web/src/main.tsx`), só tokens.
- E2E: `tv-web/e2e.mjs`, `tv-web/e2e/*.mjs`.

**Contratos (todas as fases)** — travados, nunca editar:

```powershell
npx vitest run src/lib/catalog/homeHero.home-busca-configuracoes-ds-v14.contract.test.ts src/lib/catalog/globalSearch.home-busca-configuracoes-ds-v14.contract.test.ts src/features/home/HomeScreen.home-busca-configuracoes-ds-v14.contract.test.tsx src/features/settings/SettingsScreen.home-busca-configuracoes-ds-v14.contract.test.tsx
```

Travas de outras features que **não podem quebrar** (rodar ao fim de cada
fase): `.\.planning\scripts\powershell\check-contract-tests.ps1 -Slug <slug>`
para 023, 024 e 025, e os arquivos delas no vitest.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: constante de versão e registro de mocks.

- [X] T001 [P] Ler `version="…"` do `<widget>` de `CCPlayTv/config.xml` em `tv-web/vite.config.ts` e expor `define: { __APP_VERSION__: JSON.stringify(v) }`, falhando o build com mensagem clara se não achar (D-012); declarar `declare const __APP_VERSION__: string` em `tv-web/src/vite-env.d.ts` (criar se não existir).
- [X] T002 [P] Em `tv-web/src/lib/comingSoon.ts`: remover `search-global` e `settings`; registrar `home-ai-curation` (30), `dock-tmdb` (28), `dock-ai` (31), `dock-weather` (54), `dock-speedtest` (54), `voice-search` (33), `settings-integrations` (54), `settings-player` (55), `settings-parental` (52), `settings-epg` (42), `a11y-voice-guide`, `a11y-high-contrast`, `a11y-subtitles` (56) — mensagens curtas do que farão, sem dado fictício (FR-045).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: motores locais, hooks, navegação, topbar e peças compartilhadas de gestão de lista.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

### Contrato da Fase

- `loadHomeHero — com progresso…` e `loadHomeHero — sem progresso…` — FR-002..FR-006
- `searchGlobal — agrupa por tipo…` — FR-037..FR-039
- Comando: `npx vitest run src/lib/catalog/homeHero.home-busca-configuracoes-ds-v14.contract.test.ts src/lib/catalog/globalSearch.home-busca-configuracoes-ds-v14.contract.test.ts`

### Implementation

- [X] T003 [P] Implementar `loadHomeHero` em `tv-web/src/lib/catalog/homeHero.ts` conforme `logic/hero-home.md` §2–§3 (só Dexie; episódio → série; primeiro episódio conhecido) → contrato: `loadHomeHero` (2 testes)
- [X] T004 [P] Implementar `loadGlobalSearchIndex`/`searchGlobal` em `tv-web/src/lib/catalog/globalSearch.ts` conforme `logic/busca-global.md` §1 → contrato: `searchGlobal`
- [X] T005 Em `tv-web/src/features/catalog/catalogApi.ts`: implementar `useHomeHero` (converte com `toItemOut`); criar `useMyListContent` (`logic/foco-home.md` §6) e `useGlobalSearchIndex` (`logic/busca-global.md` §2); `useToggleFavorite` passa a invalidar `['home-hero']` e `['my-list-content']`; `useToggleWatched` passa a invalidar `['home-hero']` (`logic/hero-home.md` §6)
- [X] T006 Estender `tv-web/src/navigation/appNav.ts` conforme `logic/navegacao.md` §1–§2: telas `search`/`settings` (`standalone`), campos opcionais `topbarFocus`/`openFavorites`/`initialChannel`, ação `go-home`, novas variantes de `HomeFocus` (`hero`, `rail`, `dock`), mantendo `topbar` e `shortcuts` (D-001); tipos `SearchSnapshot` (pode viver em `features/search/searchSnapshot.ts`) e `SettingsFocus` (já no stub)
- [X] T007 `tv-web/src/features/shell/TopBar.tsx`: props opcionais `onOpenSearch`/`onOpenSettings`, `currentItem` aceita `'search' | 'settings'`, sem `COMING_SOON_ITEMS` (D-005)
- [X] T008 [P] Extrair de `tv-web/src/features/profiles/ProfilesScreen.tsx` para `tv-web/src/features/sources/`: `DeleteSourceModal.tsx` e `sourceFormat.ts` (`formatType`/`formatStatus`); mover `tv-web/src/features/list-home/LimitedModeNotice.tsx` (+ teste) para `tv-web/src/features/sources/`; `ProfilesScreen` e `ListHomeScreen` (ainda vivo) importam de lá, sem mudar comportamento (D-007)
- [X] T009 [P] `tv-web/src/components/TextField.tsx`: prop opcional `inputRef?: Ref<HTMLInputElement>` repassada ao `<input>`
- [X] T010 Campos **opcionais** novos: `onOpenSearch?`/`onOpenSettings?` em `LiveShellProps` (`tv-web/src/features/live/LiveScreen.tsx`) e `VodShellProps` (`tv-web/src/features/vod/vodShell.ts`), repassados à `TopBar` (Filmes/Séries passam o snapshot atual, como `onOpenItem` já faz); `onGoHome` continua existindo (D-001)

### Testes da Fase

- [X] T011 [P] Testes do redutor em `tv-web/src/navigation/appNav.test.ts`: `open` search/settings com `topbarFocus`, `switch-top` entre busca e configurações, `go-home` com e sem Início na pilha, `settings` standalone voltando aos perfis, `source-removed` a partir de configurações
- [X] T012 [P] Testes de `useMyListContent` (ordem `favoritedAt` entre tipos, contagens resolvidas) em `tv-web/src/features/catalog/catalogApi.test.tsx`
- [X] T013 [P] Atualizar `tv-web/src/features/shell/TopBar.test.tsx`: com callbacks (OK navega, `currentItem` search/settings marca `aria-current`) e sem callbacks (soft disabled, OK sem efeito); remover asserções de "Em breve" da lupa/engrenagem

**Critério de Conclusão**: contratos de `homeHero` (2/2) e `globalSearch` (1/1) verdes; `check-contract-tests.ps1 -Slug 026-home-busca-configuracoes-ds-v14` íntegro; travas 023/024/025 íntegras e verdes; `npx tsc -b` e `npm run lint` limpos; suítes tocadas verdes.

**Checkpoint**: Fundação pronta - user stories podem começar.

**Registro da Fase**:

- Status: Concluída (T001–T013).
- Feito: `__APP_VERSION__` lido de `CCPlayTv/config.xml` (`vite.config.ts` + `vite-env.d.ts` novo); `comingSoon.ts` com os 18 mocks corretos (search-global/settings saíram, 13 novos entraram); `loadHomeHero`/`loadGlobalSearchIndex`/`searchGlobal` implementados; `useHomeHero`/`useMyListContent`/`useGlobalSearchIndex` em `catalogApi.ts`, com `useToggleFavorite`/`useToggleWatched` invalidando `home-hero`/`my-list-content`; `appNav.ts` estendido (telas `search`/`settings`, ação `go-home`, `HomeFocus` com `hero`/`rail`/`dock` no lugar de `continue`, campos opcionais em `live`/`movies`/`series`); `TopBar` com `onOpenSearch`/`onOpenSettings` reais (D-005); `features/sources/` criado (`DeleteSourceModal`, `sourceFormat.ts`, `LimitedModeNotice` movido) e `ProfilesScreen` migrado sem mudar comportamento; `TextField` com `inputRef`; `LiveShellProps`/`VodShellProps` com os dois campos opcionais novos, repassados à `TopBar`.
- Contrato: `npx vitest run src/lib/catalog/homeHero.home-busca-configuracoes-ds-v14.contract.test.ts src/lib/catalog/globalSearch.home-busca-configuracoes-ds-v14.contract.test.ts` → 3/3 verdes (2 + 1). `check-contract-tests.ps1 -Slug 026-home-busca-configuracoes-ds-v14` → trava íntegra (5/5, os outros 2 são das Fases 3/4, ainda vermelhos por não implementados — esperado). Travas 023/024/025 conferidas com `check-contract-tests.ps1` → todas íntegras.
- Testes executados: `npx tsc -b` limpo. `npm run lint` limpo (só os warnings pré-existentes de sempre, nenhum novo). `npx vitest run` (suíte completa): todos os arquivos tocados por esta fase verdes; os únicos vermelhos da suíte completa foram (a) os 2 contratos de Fase 3/4 (esperado, ainda não implementados) e (b) o padrão conhecido de flake de `*.favorites.test.tsx`/`LiveScreen.test.tsx` sob paralelismo — confirmados 100% verdes rodando cada arquivo isolado (`LiveScreen.favorites.test.tsx` 16/16, `LiveScreen.test.tsx` 67/67 com `--testTimeout` maior, `MoviesScreen.favorites.test.tsx` 5/5, `SeriesScreen.favorites.test.tsx` 3/3). Também rodei `appNav.test.ts`/`catalogApi.test.tsx`/`TopBar.test.tsx`/`comingSoon.test.ts` isolados: 91/91 verdes.
- Pendências: nenhuma nova. Achado durante a validação, fora do escopo desta feature: `MovieDetailScreen.tsx`'s `formatShortDate` dependia do fuso horário local (falhava em qualquer fuso atrás de UTC); corrigido como desvio pequeno aprovado pelo usuário (formata em `timeZone: 'UTC'`) — ver R-009 em `plan.md`.

---

## Phase 3: User Story 1 - Home definitiva em hero + rails (Priority: P1) 🎯 MVP

**Objetivo**: Início com hero (retomada direta), rails reais e mocks; hub provisório removido.

**Independent Test**: lista com progresso, favoritos de filme/série e canais favoritos — abrir o Início, retomar pelo hero, abrir detalhe e canal pelos cards, "Ver todos"/"Filmes (N)"/"Séries (N)", voltar com foco restaurado.

### Contrato da Fase

- `HomeScreen — abre com "Continuar" do hero focado…` — US1/AC1, US1/AC4, FR-004, FR-005, FR-020, SC-001
- Comando: `npx vitest run src/features/home/HomeScreen.home-busca-configuracoes-ds-v14.contract.test.tsx`

### Implementation

- [X] T014 [US1] Criar `tv-web/src/features/home/HomeContent.tsx` (hero + linhas `continue`/`mylist`/`channels`/`ai`/`dock`, skeleton por linha, linha efetiva, restauração por id) conforme `logic/foco-home.md` e `logic/hero-home.md` §4 → contrato: `HomeScreen`
- [X] T015 [US1] Reestruturar `tv-web/src/features/home/HomeScreen.tsx`: raiz `.screen.home-screen`, `HomeContent` no lugar de `ListHomeScreen`, estado `playing` + `PlayerLayer` (D-004, D-008), invalidações ao fechar (`logic/hero-home.md` §5), props finais (`onOpenItem`, `onOpenChannel`, `onOpenFavorites`, `onOpenSearch`, `onOpenSettings`; remover `onOpenContinueWatching`) → contrato: `HomeScreen`
- [X] T016 [US1] `tv-web/src/features/live/LiveScreen.tsx`: props opcionais `initialChannel`, `openFavorites`, `initialTopbarItem` (`logic/navegacao.md` §3 — reprodução uma única vez, canal ausente sem erro)
- [X] T017 [P] [US1] `tv-web/src/features/vod/VodCatalogScreen.tsx` (+ `MoviesScreen`/`SeriesScreen`): `openFavorites` (ou `restore` sintético) e `initialTopbarItem`
- [X] T018 [US1] `tv-web/src/App.tsx`: ligar as ações do Início (`open` detalhe/`live` com `initialChannel`/`openFavorites`) e trocar `onGoHome` de Live/Filmes/Séries para `go-home`
- [X] T019 [US1] Remover `tv-web/src/features/list-home/` (`ListHomeScreen.tsx` e os 3 testes dele) e o CSS do hub em `tv-web/src/styles/home.css`; estilos novos do hero/rails/dock só com tokens (FR-020, FR-048)

### Testes da Fase

- [X] T020 [P] [US1] `tv-web/src/features/home/HomeContent.test.tsx`: hero de boas-vindas com ações reais; hero `open-detail`; "Minha Lista" alterna e rótulo muda; rail vazia não renderiza; linha em foco que some → foco na linha acima; "Filmes (N)"/"Séries (N)"/"Ver todos (N)" com N real e só quando N>0; mocks anunciam "Em breve"; restauração de `initialFocus` por id
- [X] T021 [P] [US1] Atualizar `tv-web/src/features/home/HomeScreen.test.tsx` (topbar ↔ conteúdo, RETURN → modal de saída, player desativa os escopos)
- [X] T022 [P] [US1] Testes de `LiveScreen` com `initialChannel` (favoritos e categoria; reprodução uma vez; canal ausente) — feitos em `tv-web/src/features/live/LiveScreen.favorites.test.tsx` (desvio pequeno: esse arquivo, não `LiveScreen.test.tsx`, já roda `useFavoritesContent`/`useCatalogItem` reais contra `fake-indexeddb`, exatamente o que os cenários de favoritos/categoria precisam — `LiveScreen.test.tsx` mocka essas duas)

**Critério de Conclusão**: contrato `HomeScreen` 1/1 verde (e os da Fase 2 continuam verdes); `check-contract-tests.ps1` íntegro para 023/024/025/026; nenhum arquivo em `features/list-home/`; `tsc -b`, lint e suíte das áreas tocadas verdes; US1/AC1–AC12 verificados no navegador.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída (T014–T022).
- Feito: `HomeContent.tsx` novo (hero + 5 linhas navegáveis, foco por id com fallback de índice clampado — `useRowFocus`); `HomeScreen.tsx` reescrito (raiz `.screen.home-screen`, `PlayerLayer` irmão direto, invalidação de `home-hero`/`continue-watching`/`user-state`/`user-states` ao fechar); `LiveScreen`/`VodCatalogScreen`/`MoviesScreen`/`SeriesScreen` com os campos novos (`initialChannel`/`openFavorites`/`initialTopbarItem`); `App.tsx` ligando tudo, com `FAVORITES_SNAPSHOT` (restauração sintética, `categoryScreenSnapshot.ts`) para "Ver todos"/"Filmes (N)"/"Séries (N)"; `features/list-home/` removido por completo; `styles/home.css` reescrito, só tokens.
- Contrato: `npx vitest run src/features/home/HomeScreen.home-busca-configuracoes-ds-v14.contract.test.tsx` → 1/1 verde. `check-contract-tests.ps1` para 023/024/025/026 → todas íntegras.
- Testes executados: `npx tsc -b` e `npm run lint` limpos (só os warnings pré-existentes de sempre). Suíte das áreas tocadas (home/live/vod/movies/series/App/comingSoon/navigation): 304/310 verdes na rodada completa; os 6 vermelhos são o padrão de flake já documentado sob paralelismo (`*.favorites.test.tsx`, `LiveScreen.test.tsx` T010) — `HomeContent.test.tsx` passou a fazer parte desse mesmo padrão (10/10 isolado, confirmado 2x) por usar `fake-indexeddb` real como os demais.
- Pendências: nenhuma nova. US1/AC1–AC12 ainda não verificados manualmente no navegador (fica para o Polish/quickstart, T039).

---

## Phase 4: User Story 2 - Configurações com gestão de listas (Priority: P1)

**Objetivo**: engrenagem real; seis abas com Fontes IPTV, Acessibilidade e Sobre reais.

**Independent Test**: duas listas — abrir Configurações pela topbar e por "Gerenciar listas"; editar, ressincronizar, excluir (inativa e ativa), adicionar; alternar "Reduzir movimento"; percorrer abas mock.

### Contrato da Fase

- `SettingsScreen — abre em Fontes IPTV listando todas as listas sem credencial…` — US2/AC1-2, US2/AC5, FR-022..FR-025, FR-028, SC-004
- Comando: `npx vitest run src/features/settings/SettingsScreen.home-busca-configuracoes-ds-v14.contract.test.tsx`

### Implementation

- [X] T023 [US2] Implementar `tv-web/src/features/settings/SettingsScreen.tsx` (zonas topbar/tabs/panel, `SideCategoryNav` de abas, shell opcional, `initialFocus`) conforme `logic/foco-configuracoes.md` §1–§2, §4 → contrato: `SettingsScreen`
- [X] T024 [US2] Painel Fontes IPTV em `tv-web/src/features/settings/SourcesPanel.tsx` (linhas `role="group"`, ações Editar/Ressincronizar/Excluir/EPG, "Adicionar lista", `DeleteSourceModal`, foco após excluir, sem credencial) — `logic/foco-configuracoes.md` §3 → contrato: `SettingsScreen`
- [X] T025 [P] [US2] Painéis `AccessibilityPanel.tsx` (Reduzir movimento real, FR-029), `AboutPanel.tsx` (`__APP_VERSION__`, licenças OFL, FR-030) e `ComingSoonPanel.tsx` (abas mock, FR-031) em `tv-web/src/features/settings/`
- [X] T026 [US2] `tv-web/src/features/profiles/ProfilesScreen.tsx`: ação "Gerenciar listas" (`onManageSources`), sem mexer nas ações por cartão (FR-032; contrato 023 verde)
- [X] T027 [US2] `tv-web/src/App.tsx`: rota `settings` (shell/standalone, `activeSourceId`, Editar/Adicionar/Ressincronizar com `from` + `restore`, `source-removed`), engrenagem ligada em Início/Live/Filmes/Séries via `onOpenSettings`
- [X] T028 [P] [US2] `tv-web/src/styles/settings.css` (tokens) importado em `tv-web/src/main.tsx`

### Testes da Fase

- [X] T029 [P] [US2] `tv-web/src/features/settings/SettingsScreen.test.tsx`: Editar/Ressincronizar chamam callbacks com `SettingsFocus`; OK duplo em Ressincronizar inicia um só; restauração por `sourceId`; sem listas → "Adicionar lista"; RETURN; UP para topbar; sem shell não há topbar
- [X] T030 [P] [US2] Testes dos painéis (Reduzir movimento alterna classe + `localStorage`; Sobre mostra a versão definida; abas mock com "Voltar às abas" focável) — em `tv-web/src/features/settings/SettingsPanels.test.tsx` (painéis isolados) + o toggle de "Reduzir movimento" ponta a ponta em `SettingsScreen.test.tsx` (é lá que a lógica de gravar/aplicar mora)
- [X] T031 [P] [US2] Atualizar `tv-web/src/features/profiles/ProfilesScreen.test.tsx` para "Gerenciar listas" (ids/ordem do foco)

**Critério de Conclusão**: contrato `SettingsScreen` 1/1 verde; contratos 023 (`ProfilesScreen`) verdes e travas íntegras; US2/AC1–AC13 verificados no navegador; `tsc -b`, lint e suítes tocadas verdes.

**Checkpoint**: User Story 2 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída (T023–T031).
- Feito: `SettingsScreen.tsx` completo (zonas `topbar`/`tabs`/`panel`, `SideCategoryNav`, restauração por `SettingsFocus`); `SourcesPanel.tsx` (Editar/Ressincronizar/Excluir/EPG, sem credencial — confirmado pelo contrato); `AccessibilityPanel.tsx` ("Reduzir movimento" real, 3 mocks), `AboutPanel.tsx` (`__APP_VERSION__` + licenças OFL), `ComingSoonPanel.tsx` (abas mock); `ProfilesScreen.tsx` com a linha `manage` nova (DOWN a partir de "Adicionar lista", nunca de uma lista real); `App.tsx` ligado (rota `settings`, engrenagem em Início/Live/Filmes/Séries); `styles/settings.css` novo.
- Contrato: `npx vitest run src/features/settings/SettingsScreen.home-busca-configuracoes-ds-v14.contract.test.tsx` → 1/1 verde. `check-contract-tests.ps1` para 023/024/025/026 → todas íntegras.
- Testes executados: `npx tsc -b` e `npm run lint` limpos. Suíte tocada (settings/profiles/live/vod/movies/series/App/home/navigation/comingSoon): 354/357 verdes; os 3 vermelhos são o mesmo padrão de flake sob paralelismo já documentado (`*.favorites.test.tsx`, `LiveScreen.test.tsx` T010).
- Pendências: nenhuma nova. US2/AC1–AC13 ainda não verificados manualmente no navegador (Polish/quickstart, T039).

---

## Phase 5: User Story 3 - Busca global (Priority: P2)

**Objetivo**: lupa real abrindo a tela "Buscar" com resultados por tipo sobre o que já foi lido.

**Independent Test**: categorias de canais/filmes/séries já abertas — buscar a partir de telas diferentes, termos com e sem resultado, abrir cada tipo e voltar.

### Implementation

- [X] T032 [US3] Criar `tv-web/src/features/search/SearchScreen.tsx` conforme `logic/busca-global.md` §3–§5 (campo com `inputRef`, voz mock, cobertura, rails por tipo, estado vazio, RETURN em camadas, `SearchSnapshot`)
- [X] T033 [US3] `tv-web/src/App.tsx`: rota `search` (`open` a partir de Início/Live/Filmes/Séries com `topbarFocus`; `switch-top` entre busca e configurações; resultados → detalhe ou `live` com `initialChannel {entry:'category'}`, `from` com snapshot)
- [X] T034 [P] [US3] `tv-web/src/styles/search.css` (tokens) importado em `tv-web/src/main.tsx`

### Testes da Fase

- [X] T035 [P] [US3] `tv-web/src/features/search/SearchScreen.test.tsx`: foco inicial no campo sem abrir teclado; menos de 2 caracteres sem resultado; rails só dos tipos com resultado; vazio com cobertura e "Editar busca" focável; RETURN com input focado só faz blur; OK em filme/série/canal chama o callback certo com snapshot; restauração por id

**Critério de Conclusão**: contratos das fases anteriores seguem verdes; US3/AC1–AC7 verificados no navegador; nenhuma requisição de rede ao digitar (conferir no painel de rede do navegador); `tsc -b`, lint e suítes tocadas verdes.

**Checkpoint**: User Story 3 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída (T032–T035).
- Feito: `SearchScreen.tsx` completo (`logic/busca-global.md` §3–§5) — campo `TextField` com `inputRef` próprio (foco visual `.tv-focus` sem abrir o teclado sozinho, `imeOpen` via `focus`/`blur` nativos no input), `ComingSoon id="voice-search"` ao lado; aviso de cobertura sempre visível (`Busca em N de M categorias`); rails `Canais`/`Filmes`/`Séries` só para os tipos com resultado, nessa ordem fixa; `EmptyState` com "Editar busca" focável; RETURN em camadas (resultado → campo fecha o teclado → ícone da topbar → Início), nunca sai da tela com o teclado aberto; `SearchSnapshot` restaura termo e foco por id, sem reabrir o teclado. `App.tsx`: rota `search` funcional (`case 'search'`), aberta a partir de Início/Live/Filmes/Séries com `from` carregando o `topbarFocus`/`HomeFocus` de origem; `switch-top` alterna direto para Configurações sem empilhar; abrir um filme/série vai para o detalhe, um canal para `live` com `initialChannel {entry:'category'}` — todos levando o `SearchSnapshot` em `from.restore` pra restauração por id (FR-042). `styles/search.css` (só tokens) importado em `main.tsx`.
- Contrato: `npx vitest run src/lib/catalog/globalSearch.home-busca-configuracoes-ds-v14.contract.test.ts` → 1/1 verde. `check-contract-tests.ps1 -Slug 026-home-busca-configuracoes-ds-v14` → trava íntegra (5/5 testes de contrato da feature).
- Testes executados: `npx tsc -b` limpo; `npm run lint` só com os warnings pré-existentes já documentados em fases anteriores (nenhum novo em `search/`). Varredura tocada (`search`, `home`, `shell`, `App`, `navigation`, `lib/catalog`, `comingSoon`): 408/408 testes verdes (39 arquivos) — `SearchScreen.test.tsx` sozinho: 8/8.
- Pendências: nenhuma nova. US3/AC1–AC7 ainda não verificados manualmente no navegador (Polish/quickstart, T039); a verificação "nenhuma requisição de rede ao digitar" também fica para essa passada manual.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: E2E, documentação e gates.

- [X] T036 Atualizar os E2E que entravam pelos atalhos grandes do Início ou pelos mocks da topbar para entrar pela topbar: `tv-web/e2e.mjs`, `tv-web/e2e/{favoritos,m3u-sob-demanda,capa-real,zapping-live-tv,busca-por-categoria,historico-continuar-assistindo,ciclo-vida-player,live-tv-ds-v14,filmes-series-ds-v14,paridade-visual,shell-visual}.mjs` (o que tocar o Início; conferir cada um)
- [X] T037 Novo roteiro `tv-web/e2e/home-busca-configuracoes.mjs` (hero retoma e volta; rail de canal abre a Live tocando; "Filmes (N)"; busca com e sem resultado e volta; Configurações: Modo limitado, excluir com confirmação, Reduzir movimento) e incluí-lo em `test:e2e` (`tv-web/package.json`)
- [X] T038 [P] Varredura de referências a `ListHomeScreen`/hub/"Em breve" da lupa/engrenagem em comentários e docs (`CLAUDE.md`, `.planning/migracao-design-system-v14.md`, comentários em `HomeScreen.tsx`/`TopBar.tsx`/`appNav.ts`)
- [X] T039 Rodar `quickstart.md` (cenários manuais no navegador; itens de TV física marcados como recomendados)
- [X] T040 Suíte completa `npx vitest run`, `npx tsc -b`, `npm run lint`, `npm run build`, `npm run build:tizen`, `npm run test:e2e` (com `npm run dev` rodando)

### Checklist de Release

- [X] Fase 2 (Foundational) concluída
- [X] Fase 3 (US1 — Home) concluída
- [X] Fase 4 (US2 — Configurações) concluída
- [X] Fase 5 (US3 — Busca) concluída
- [X] Testes de contrato 5/5 verdes na suíte completa e `check-contract-tests.ps1 -Slug 026-home-busca-configuracoes-ds-v14` íntegro
- [X] Travas 023/024/025 íntegras e verdes (nenhum arquivo delas editado)
- [X] `npm run build:tizen` passa sem arquivo emitido fora de `tizen_web_project.yaml`
- [X] `npm run test:e2e` verde contra dev server recém-iniciado
- [X] Nenhuma URL/DNS/usuário/senha em tela nova (revisão de segredos da constitution)
- [X] `quickstart.md` executado

**Registro da Fase**:

- Status: Concluída (T036–T040).
- Feito: os 12 scripts E2E pré-existentes que entravam pelo hub antigo (`.tiles-row`) foram migrados pra entrar pela topbar/hero do Início definitivo (helper `openViaTopbar`); novo roteiro `home-busca-configuracoes.mjs` cobrindo as três user stories de ponta a ponta (hero retoma e volta, rails "Continuar assistindo"/"Minha Lista"/"Canais favoritos", Busca com e sem resultado, Configurações — Modo limitado/excluir/Reduzir movimento), incluído em `test:e2e`; varredura de docs (T038) não achou nada de fato desatualizado pra corrigir; `quickstart.md` (T039) rodado — automatizado onde já coberto pelos E2E, manual via Playwright MCP no resto (Home vazia, mocks anunciam "Em breve", Busca com 1/2+ caracteres, "Gerenciar listas" dos perfis, persistência de "Reduzir movimento" após recarregar, Sobre com a versão real).
- Contrato: `check-contract-tests.ps1 -Slug 026-home-busca-configuracoes-ds-v14` → trava íntegra (5/5). Travas 023/024/025 também íntegras.
- Testes executados: `npx tsc -b` limpo; `npm run lint` só com os warnings pré-existentes já documentados; `npx vitest run` (suíte completa) 1212/1218 — os 6 vermelhos são o mesmo padrão de flake sob paralelismo já documentado (`*.favorites.test.tsx`, `LiveScreen.test.tsx` T010), confirmados 94/94 passando isolados; `npm run build` e `npm run build:tizen` (com sincronização pro projeto Tizen) verdes; `npm run test:e2e` (12 scripts encadeados, incluindo o novo) 100% verde contra um dev server recém-iniciado.
- Pendências: nenhuma no escopo desta feature. A passada em TV física (recomendada, não gate — mesmo padrão das features 011/013/020/021) fica para quando houver acesso à TV de referência.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA todas as user stories
- **US1 (Phase 3)** e **US2 (Phase 4)**: dependem da Fase 2; independentes entre si, mas ambas editam `App.tsx` (fazer em sequência)
- **US3 (Phase 5)**: depende da Fase 2; T033 edita `App.tsx`
- **Polish (Phase 6)**: depois das três stories

### Parallel Opportunities

- T001/T002; T003/T004/T008/T009; T011–T013; testes `[P]` de cada fase

---

## Parallel Example: Foundational

```bash
Task: "T003 [P] loadHomeHero em tv-web/src/lib/catalog/homeHero.ts"
Task: "T004 [P] searchGlobal em tv-web/src/lib/catalog/globalSearch.ts"
Task: "T008 [P] features/sources (DeleteSourceModal, sourceFormat, LimitedModeNotice)"
```

---

## Implementation Strategy

### MVP First

1. Fases 1–2
2. Fase 3 (US1): Início definitivo
3. **Parar e validar** no navegador — o hub já saiu, a gestão de lista continua pelos perfis; o aviso de Modo limitado só volta a aparecer com a Fase 4 (fazer as duas antes de entregar)

### Incremental Delivery

1. Fundação → US1 → US2 (entrega mínima: hub removido sem perder nada) → US3 → Polish

## Notes

- `[P]` = arquivos diferentes, sem dependência
- Commitar após cada task ou grupo lógico coerente
- Nunca editar arquivos listados em `contract-tests.lock` de nenhuma feature

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
