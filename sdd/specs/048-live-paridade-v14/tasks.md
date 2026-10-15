---
description: "Tasks da feature 048 — paridade visual da TV ao vivo com o Design System V14"
---

# Tasks: Paridade visual da TV ao vivo com o Design System V14

**Input**: `sdd/specs/048-live-paridade-v14/` (spec.md, plan.md, `logic/destaque-e-programacao.md`, quickstart.md)

**Prerequisites**: plan.md, spec.md. Sem `research.md`/`data-model.md`/`contracts/` (nenhuma incerteza técnica, nenhum dado novo persistido, nenhuma API).

**Organization**: por user story. US1 e US2 (P1) são independentes; US3 depende só da Fase 2; US4 e US5 são independentes entre si.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

- Código em `tv-web/src/` (Vite/React/TS). Comandos a partir de `tv-web/`; scripts de trava rodam da raiz do repositório.
- Live: `tv-web/src/features/live/` (desenho em `liveColumns.tsx`, como **funções** — regra da 040). CSS da tela: `tv-web/src/styles/live.css`.
- EPG: `tv-web/src/lib/epg/`. Componentes compartilhados: `tv-web/src/components/`.
- E2E: `tv-web/e2e/` (Playwright, `npm run dev` rodando; registrar roteiro novo em `e2e/run.mjs`).

## Phase 1: Setup

**Purpose**: baseline antes de mexer.

- [X] T001 Rodar `npx tsc -b` e `npx vitest run src/features/live src/components src/lib/epg src/features/profiles` e registrar no `plan.md` (Execution Notes) o resultado base — só os 5 contratos desta feature devem falhar. Rodar `check-contract-tests.ps1` para 018, 024, 030, 031, 046 e 048 (todas íntegras).

**Checkpoint**: baseline registrado.

---

## Phase 2: Foundational — próximos programas

**Purpose**: o dado dos cartões (US3) e a linha "ao vivo" (US1) leem do mesmo lugar.

### Contrato da Fase

- `devolve min(3, futuros) em ordem, o 1º igual ao "A seguir" de nowAndNext, com deslocamento e lacuna` — FR-009/FR-010/SC-003
- Comando: `npx vitest run src/lib/epg/upcoming.live-paridade-v14.contract.test.ts`

### Implementation

- [X] T002 Implementar `upcomingAfterNow`/`upcomingForChannel` em `tv-web/src/lib/epg/upcoming.ts` conforme `logic/destaque-e-programacao.md` §2. Se extrair um helper de `tv-web/src/lib/epg/nowNext.ts`, manter `nowAndNext`/`nowNextForChannel` com a mesma assinatura e saída (contrato travado da 030) → contrato: `devolve min(3, futuros)…`
- [X] T003 Em `tv-web/src/features/live/useLiveCatalog.ts`, expor `activeUpcoming = upcomingForChannel(epgLookup, activeChannel?.epg_channel_id, epgNow)` junto de `activeNowNext` (mesmo `epgNow`; nenhuma consulta nova) e incluir no tipo `LiveChannels`.

### Testes da Fase

- [X] T004 [P] `tv-web/src/lib/epg/upcoming.test.ts`: `limit` diferente de 3; sobreposição (mesma regra de `nowAndNext`); programas com `description` preservam o campo; programa que começa exatamente no fim do atual entra.

**Critério de Conclusão**: o comando do contrato → 1/1 verde; `nowNext.epg-dados-agora.contract.test.ts` verde; `npx tsc -b` limpo.

**Registro da Fase**:

- Status: Concluída (Fases 1 e 2)
- Feito: baseline (tsc limpo; 5 falhas = só os 5 contratos da 048; travas 018/024/030/031/046/048 íntegras); `upcomingAfterNow`/`upcomingForChannel` em `upcoming.ts` sobre o helper `resolveSchedule` extraído de `nowNext.ts` (`nowAndNext` intacto); `activeUpcoming` exposto em `useLiveCatalog`; `upcoming.test.ts` (5 casos).
- Contrato: `npx vitest run src/lib/epg/upcoming.live-paridade-v14.contract.test.ts` → 1/1 verde; trava íntegra (048 e 030).
- Testes executados: `npx tsc -b` limpo; `npx vitest run src/lib/epg` → 11 arquivos, 59/59 verdes.
- Pendências: nenhuma.

---

## Phase 3: User Story 1 - Canal focado em destaque (Priority: P1) 🎯 MVP

**Objetivo**: o preview vira o destaque com rótulo, nome, linha "ao vivo", ações em linha e fundo com o logo real.

**Independent Test**: os 2 contratos abaixo verdes; captura com canal com/sem logo.

### Contrato da Fase

- `destaque: rótulo do grupo, nome, "Ao vivo" sem EPG, fundo com o logo real só quando ele existe` — US1/AC1+AC2, FR-001/002/005
- `ações em linha: → avança e para na última, ↑ volta uma, ← volta ao canal de origem` — FR-004
- Comando: `npx vitest run src/features/live/LiveScreen.live-paridade-v14.contract.test.tsx -t "destaque|ações em linha"`

### Implementation

- [X] T005 [US1] Em `tv-web/src/features/live/liveColumns.tsx` (ramo `withPreview`), reestruturar `.live-preview-panel` conforme `logic/…` §1: `.live-hero` > `.live-hero-art` (sempre) + `<img>` do logo com fallback de falha no padrão de `PosterArt` (§1.4) + `.live-hero-copy` (eyebrow §1.1, nome, número opcional, `.live-hero-live` §1.2, progresso/horário/sinopse do atual reaproveitando `.live-epg-*`) + `.live-preview-actions`. Remover o bloco "A seguir" de dentro do preview (vai para os cartões, US3). O estado sem canal (`.live-preview-empty`) continua → contrato: `destaque…`
- [X] T006 [US1] Ações: manter textos exatos (D-001); ícones SVG locais `<Icon name="play" />` / `<Icon name="favorite" />` / `<Icon name="guide" />` dentro dos botões (Spec §15 — nada de glifo de sistema); `Assistir` primário e os outros secundários conforme D-016 (Spec §31.1); manter `is-soft-disabled`/`aria-disabled` em `Assistir` → contrato: `ações em linha…`
- [X] T007 [US1] Em `tv-web/src/features/live/useLiveKeyboard.ts`, `handleTrailDirection`: `→` com `effectiveCol === 2` avança `previewAction` com clamp (§4); atualizar o comentário de `PREVIEW_ACTION_COUNT` em `liveTrail.ts` ("ordem visual, em linha") → contrato: `ações em linha…`
- [X] T008 [US1] CSS em `tv-web/src/styles/live.css`: `.live-preview-panel` como grid (destaque `1fr` + faixa de cartões `auto`), `.live-hero` (superfície, borda, `--radius-lg`, `overflow: hidden`, degradê `::after`), `.live-hero-art img` (contain, à direita, opacidade, **sem blur** — D-006), tipografia conforme Spec §6 (`--fs-display` Poppins 800 no nome; rótulo `--fs-caption` 600 + `--accent` + caixa alta, a única caixa alta do destaque), `.live-hero-dot` com `--live` (§5.5), ações em linha em pílula com as cores de D-016 (§31.1), sem `filter`/`will-change` (§30.3/§30.5). Só tokens (FR-019). Conferir com o Lab `#actions`/`#states`.

### Testes da Fase

- [X] T009 [US1] Atualizar `tv-web/src/features/live/LiveScreen.epg.test.tsx` ao preview novo: "Agora" (título, horário, barra, sinopse) agora dentro de `.live-hero`; os casos de "A seguir" passam a verificar o 1º cartão (pode ficar pendente até a Fase 5 — registrar). Não afrouxar: sem EPG, nenhum título/horário solto.
- [X] T010 [P] [US1] Em teste novo `tv-web/src/features/live/LiveScreen.destaque.test.tsx`: eyebrow em ★ Favoritos (`★ Favoritos • <grupo>`) e em Todos; logo que falha (`onError`) remove a `<img>` e não volta a pedir a mesma URL; `Assistir` soft disabled para canal não reproduzível com o layout novo.

**Critério de Conclusão**: o comando do contrato → 2/2 verdes; contratos 024 e 031 (`LiveScreen.live-tv-ds-v14.contract.test.tsx`, `LiveScreen.epg-guia-completo.contract.test.tsx`) verdes; `check-contract-tests.ps1` íntegro para 048/024/031.

**Checkpoint**: US1 entregável sozinha.

**Registro da Fase**:

- Status: Concluída
- Feito: .live-hero com rótulo, nome em Display, linha "ao vivo", progresso/horário/sinopse do atual reais e fundo com o logo real (LiveHeroArt, sem blur; falha de carga = mesmo padrão do PosterArt); ações em linha com <Icon> SVG (textos intactos, Assistir primário); → avança entre as ações e para na última; CSS escopado em live.css. O bloco A seguir de dentro do preview saiu (virou o 1º cartão — Fase 5). Testes: LiveScreen.epg.test.tsx ajustado ao destaque (sem afrouxar), LiveScreen.destaque.test.tsx novo (5 casos).
- Contrato: `npx vitest run src/features/live/LiveScreen.live-paridade-v14.contract.test.tsx -t "destaque|ações em linha"` → 2/2 verdes; trava íntegra (048/024/031).
- Testes executados: `npx vitest run src/features/live src/features/profiles src/components src/lib/focus` verde; contratos 024 e 031 verdes.
- Pendências: nenhuma.

---

## Phase 4: User Story 2 - Colunas em painéis, com foco inteiro visível (Priority: P1)

**Objetivo**: painéis com cabeçalho de duas linhas, larguras 200/340/resto, anel de foco inteiro na lista e na trilha, indicador de continuação nas bordas (FR-021).

**Independent Test**: captura 1920×1080; anel do 1º canal e do último visível inteiro (medido no E2E do Polish).

### Implementation

- [X] T011 [US2] Em `tv-web/src/features/live/liveColumns.tsx`: cabeçalho `.live-panel-head` na coluna de categorias ("Categorias" + `.live-panel-sub` "Grupos"); na de canais, acrescentar o subtítulo "Canais" à `.category-title-row` existente (lupa da 018 intacta). Nenhuma classe da D-003 removida.
- [X] T012 [US2] CSS em `tv-web/src/styles/live.css`: medidas locais `--live-col-groups: 200px` / `--live-col-channels: 340px` (D-011) aplicadas a `.live-column-groups`/`.live-column-channels` **dentro da Live** (sobrepõe o `340px` de `shared.css` só por especificidade/ordem, sem editar `shared.css`); aparência de painel conforme D-014 (Spec §5.1/§7/§8: `--bg-surface`, borda `--bg-elevated`, `--radius-lg`, padding `--space-3`); divisória do cabeçalho. Conferir com o Lab `#navigation` (`.sidenav`).
- [X] T013 [US2] Anel sem corte (D-010, `logic/…` §5): folga `--space-2` + margem negativa igual em `.live-channel-list` e no contêiner rolável da trilha; `no-scale` nas linhas `live-channel-row` em `liveColumns.tsx`. Não mudar `LIVE_ITEM_ROW_HEIGHT` nem a altura de 72px.
- [X] T014 [US2] Verificar que carregando/vazio/erro/busca/nota de truncamento continuam dentro do painel de canais e com a ação focável (FR-020) — ajustar só CSS escopado.
- [X] T015 [US2] Indicador de continuação (FR-021, D-018, `logic/…` §5.0): criar `tv-web/src/lib/focus/useOverflowEdges.ts`; em `liveColumns.tsx` envolver `.live-channel-list` e o contêiner rolável da trilha numa moldura `.live-scroll-frame` com `is-more-above`/`is-more-below`; degradês por `::before`/`::after` em `live.css` (`--space-5`, de `--bg-surface` a transparente, `pointer-events: none`); `scrollPaddingStart`/`scrollPaddingEnd` no `useVirtualizer` de `LiveScreen.tsx` (constante em `liveTrail.ts`) e `scroll-padding-block` na trilha, para o item focado nunca ficar sob o degradê. Vale no zapping.

### Testes da Fase

- [X] T016 [US2] `tv-web/src/lib/focus/useOverflowEdges.test.ts`: lista que cabe → nenhum lado; topo → só `below`; meio → ambos; fim → só `above`; re-render só quando muda (simular `scrollTop`/`clientHeight`/`scrollHeight`).
- [X] T017 [US2] Rodar `LiveScreen.test.tsx`, `LiveScreen.memoria-foco*.test.tsx`, `LiveScreen.busca-categoria.contract.test.tsx` — virtualização e foco inalterados.

**Critério de Conclusão**: suíte da Live verde; contratos 018/024/046 íntegros e verdes; `useOverflowEdges.test.ts` verde; captura com colunas nas larguras, anel inteiro e indicador de continuação só nas bordas com itens ocultos (verificado de fato na Fase 8, T030).

**Registro da Fase**:

- Status: Concluída
- Feito: painéis com cabeçalho de duas linhas (Categorias/Grupos, <título>/Canais), larguras 200/340px por especificidade (.live-column.… vence o shared.css), anel inteiro (folga --space-2 + margem negativa + 
o-scale nas linhas), useOverflowEdges + .live-scroll-frame com degradê overlay, scrollPaddingStart/End no virtualizador (fim = 48 + 2×16: o virtualizador não conta o padding do contêiner) e scroll-padding-block na trilha. Os estados carregando/vazio/erro continuam filhos do painel de canais, com a ação focável de hoje.
- Contrato: sem contrato nesta fase (cobertura pelo E2E live-paridade-v14.mjs, T030).
- Testes executados: useOverflowEdges.test.tsx (5 casos); suíte da Live verde; E2E live-paridade-v14.mjs: anel inteiro no 1º/último item da trilha e da lista (±15px), indicadores só nas bordas com itens ocultos, item focado fora das faixas de degradê.
- Pendências: carregando/erro não foram capturados visualmente (só vazio e lista).

---

## Phase 5: User Story 3 - Programação em cartões (Priority: P2)

**Objetivo**: até 3 cartões reais abaixo do destaque.

### Contrato da Fase

- `programação: com EPG, o atual na linha "ao vivo" e 3 cartões A seguir/Depois/Mais tarde com os próximos reais` — US3/AC1, FR-009
- Comando: `npx vitest run src/features/live/LiveScreen.live-paridade-v14.contract.test.tsx -t "programação"`

### Implementation

- [X] T018 [US3] Em `tv-web/src/features/live/liveColumns.tsx`, dentro de `.live-preview-panel` e depois de `.live-hero`: `.live-schedule` só se `activeUpcoming.length > 0`; um `.live-schedule-card` por item com `.live-schedule-label` (`['A seguir','Depois','Mais tarde'][i]`), `.live-schedule-title`, `.live-schedule-time` (`formatEpgClock(start)`) — D-004 → contrato: `programação…`
- [X] T019 [US3] CSS em `live.css`: faixa em grid de 3 colunas iguais (cartões presentes ocupam as primeiras), cartão em superfície com borda, rótulo em caixa alta `--fs-caption`; sem faixa, o destaque ocupa a altura (FR-009/US3-AC3).

### Testes da Fase

- [X] T020 [US3] Completar `LiveScreen.epg.test.tsx` (ou o novo `LiveScreen.destaque.test.tsx`): 1 programa futuro → 1 cartão "A seguir"; sem futuros → nenhuma `.live-schedule`; com `vi.setSystemTime` avançando além do fim do atual, linha "ao vivo" e cartões avançam (FR-010).

**Critério de Conclusão**: o contrato → verde; `LiveScreen.epg-dados-agora.contract.test.tsx` (030) verde e íntegro; `e2e/epg-dados-agora.mjs` continua passando (rodar no Polish).

**Registro da Fase**:

- Status: Concluída (junto da Fase 3, mesmo bloco de JSX)
- Feito: .live-schedule com até 3 .live-schedule-card (A seguir/Depois/Mais tarde, ormatEpgClock(start)), só com ctiveUpcoming.length > 0; CSS em grid de 3 colunas.
- Contrato: `npx vitest run ... -t "programação"` → 1/1 verde; contrato 030 verde e trava íntegra.
- Testes executados: LiveScreen.destaque.test.tsx (1 programa futuro → 1 cartão; relógio avança → cartões e linha o vivo recalculam; sem EPG → nenhuma faixa). e2e/epg-dados-agora.mjs ajustado ao destaque (innerText vem com a caixa alta do CSS → regex /i) — rodar de novo no gate (ver Pendências).
- Pendências: o E2E 030 ainda não foi visto passar contra o servidor certo (ver Registro do Polish).

---

## Phase 6: User Story 4 - Itens de categoria e canal no padrão V14 (Priority: P2)

**Objetivo**: tile na trilha, linha de canal V14 e estado "tocando" no zapping — só na Live.

### Contrato da Fase

- `trilha: tile antes do rótulo (★, ∞, iniciais), rótulo intacto; SideCategoryNav sem tile não desenha nenhum` — US4/AC1, FR-011, FR-017
- Comando: `npx vitest run src/features/live/LiveScreen.live-paridade-v14.contract.test.tsx -t "trilha"`

### Implementation

- [X] T021 [US4] Criar `tv-web/src/lib/initials.ts` com `listInitials` (movida sem mudança de `features/profiles/listAvatar.ts`); em `listAvatar.ts`, re-exportar (`export { listInitials } from '../../lib/initials'`) para não tocar nos testes da 037 — D-008.
- [X] T022 [US4] Em `tv-web/src/components/SideCategoryNav.tsx`, desenhar `entry.tile` (`logic/…` §3): `<span className="side-category-nav-tile" aria-hidden="true">` antes do ícone/rótulo, fora do label; atualizar o JSDoc do stub. Regra visual base do tile em `tv-web/src/styles/components.css` → contrato: `trilha…`
- [X] T023 [US4] Em `liveColumns.tsx` (`sideEntries`): Favoritos `tile: '★'` sem `icon`; Todos `tile: '∞'`; categoria `tile: listInitials(groupLabel(name))` → contrato: `trilha…`
- [X] T024 [US4] CSS escopado em `live.css`, conforme `logic/…` §5.1, D-017 e o Lab `#categoriesv131`: itens da trilha em `--bg-elevated`/`--radius-md`/48px, Favoritos com tile `--warning` e fundo fixo próprio, selecionado = Spec §31.1 Seleção (tint + texto `--accent` + borda tint, distinto de `.tv-focus`), foco sem escala (D-010); linha de canal (Spec §25/§11.2/§31.1): número em `--fs-caption`/`--text-annotation` com algarismos tabulares, placeholder de logo neutro sem textura (D-007), `.channel-row-now:not(:empty)::before { content: 'Agora: ' }` (D-003), progresso sob o texto, estrela em `--warning`.
- [X] T025 [US4] Zapping (FR-014): passar o id do canal em reprodução para `renderLiveColumns` (campo novo opcional em `LiveColumnsModel`, preenchido de `zap.playing` em `LiveScreen.tsx`) e marcar a linha com `is-playing`; CSS do estado distinto de foco e selecionado. Painéis e itens do zapping usam o mesmo CSS (sem destaque/cartões).

### Testes da Fase

- [X] T026 [P] [US4] `tv-web/src/lib/initials.test.ts` (ou mover o caso existente): duas palavras, uma palavra, emoji/símbolo, string vazia. Ajustar `LiveScreen.favorites.test.tsx`/`LiveScreen.test.tsx` se dependerem do `icon` de Favoritos — sem afrouxar.
- [X] T027 [US4] Teste do zapping: com o player aberto e o zapping visível, a linha do canal tocando tem `is-playing`; ao mover o foco, `is-playing` fica no canal que toca.

**Critério de Conclusão**: o contrato → verde; testes de `VodCatalogScreen*`/`SettingsScreen*` verdes (FR-017); contratos 018/024 íntegros.

**Registro da Fase**:

- Status: Concluída
- Feito: lib/initials.ts (listInitials movida; listAvatar.ts re-exporta), tile em SideCategoryNav (opt-in, fora do label) + regra base .side-category-nav-tile, 	ile ★/∞/iniciais na Live, CSS escopado dos itens da trilha e da linha de canal (número tabular, Agora:  por ::before, progresso sob o texto, estrela --warning), is-playing no zapping (playingId no modelo). Testes antigos que liam o 	extContent da entrada inteira passaram a ler .side-category-nav-label.
- Contrato: `npx vitest run ... -t "trilha"` → 1/1 verde; trava íntegra.
- Testes executados: initials.test.ts, teste do zapping (is-playing não acompanha o foco) em LiveScreen.test.tsx; Filmes/Séries/Configurações (VodCatalogScreen*, SettingsScreen*) verdes.
- Pendências: nenhuma.

---

## Phase 7: User Story 5 - Cabeçalho e dicas (Priority: P3)

**Objetivo**: cabeçalho V14 e dica de favoritar só no rodapé.

### Implementation

- [X] T028 [US5] Em `tv-web/src/features/live/LiveScreen.tsx`: `.live-header` com título + subtítulo "Canais, programação e guia em um só lugar" à esquerda e `.live-header-chips` à direita (`justify-content: space-between`); chip da entrada com `selected` (tint da Spec §31.1 — **não** fundo branco), contagem só conhecida (FR-012). Em `liveColumns.tsx`, remover `<FavoriteHint />` da lista (D-013; `LIVE_HINTS` já cobre). CSS em `live.css`: título **mantém** `--fs-h1` (Spec §6, D-015 — não aumentar), subtítulo `--fs-body` `--text-secondary`.

### Testes da Fase

- [X] T029 [US5] Ajustar testes que esperavam o `FavoriteHint` na Live; `FavoritesState.test.tsx` e Filmes/Séries seguem com a dica.

**Critério de Conclusão**: suíte da Live verde; cabeçalho conferido na captura do Polish.

**Registro da Fase**:

- Status: Concluída
- Feito: cabeçalho com subtítulo e chips à direita (chip da entrada selected = tint, título mantém --fs-h1); FavoriteHint removido da lista da Live (a dica fica só no rodapé).
- Contrato: sem contrato nesta fase.
- Testes executados: suíte da Live verde (nenhum teste dependia do FavoriteHint na Live; FavoritesState.test.tsx e Filmes/Séries seguem com a dica).
- Pendências: cabeçalho conferido só nas capturas do E2E (sem comparação com o protótipo — T033).

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T030 Criar `tv-web/e2e/live-paridade-v14.mjs` (padrão de `e2e/memoria-foco-key-repeat.mjs`: fixture M3U servida localmente, `cadastrarListaM3u`) que: entra numa categoria, tira capturas 1920×1080 (trilha, canais, ações, zapping) para `test-results/`; mede pelo `getBoundingClientRect` do contêiner rolável vs. a linha focada + 15px que o anel não é cortado no 1º e no último visível (SC-002); confere larguras das colunas (FR-007) e que o destaque ocupa ≥ 55% da largura útil (SC-001); com uma fixture de canais maior que a área visível, confere `is-more-above`/`is-more-below` no topo, no meio e no fim, ausência numa categoria que cabe inteira, e que a linha focada não intersecta a faixa do degradê (SC-006, FR-021). Registrar em `tv-web/e2e/run.mjs`.
- [ ] T031 Capturas antes/depois de Filmes, Séries e Configurações (SC-004) — no mesmo roteiro ou manual, registrado no `quickstart.md`.
- [X] T032 `npm run lint`, `npx tsc -b`, `npm run test`, `npm run build` e `npm run test:e2e` (com `npm run dev`) — corrigir regressões em `e2e/live-tv-ds-v14.mjs`/`e2e/epg-dados-agora.mjs` se algum seletor antigo do preview for usado.
- [ ] T033 Revisão lado a lado com o protótipo e com o Design System (`quickstart.md` §4 e §5) e registro do resultado em `plan.md`.
- [X] T034 Rodar `npm run build:tizen` para garantir que `sync-tizen.mjs` não recusa arquivo novo (não deve haver: nenhum asset/worker novo).
- [X] T035 Atualizar `plan.md` (Estado Atual, Execution Notes, Arquivos Principais) e o status no backlog via `update-feature-status.ps1`.

**Registro do Polish (T030–T035)**:

- Status: Parcial — T031 e T033 abertas (conferência visual lado a lado que só uma pessoa faz).
- Feito: `e2e/live-paridade-v14.mjs` (registrado em `run.mjs`): larguras 200/340, destaque 65% da largura útil, anel inteiro no 1º/último item da trilha e da lista, indicadores só nas bordas com itens ocultos e item focado fora do degradê, categoria curta sem indicador, ações em linha, `Todos` com o nome visível, zapping com `is-playing`; capturas 1920×1080 em `tv-web/test-results/live-paridade-v14/`. `e2e/epg-dados-agora.mjs` ajustado ao destaque (`/ao vivo agora/i`; `innerText` traz a caixa alta do CSS). **Achado no gate**: em `Todos` o rótulo do grupo esmagava o nome do canal na coluna de 340px (nome com largura 0; `busca-por-categoria` e `live-tv-ds-v14` falharam por isso) — o rótulo virou a 3ª linha da coluna de texto (`ChannelRow` ganhou `group`/`groupClassName` opcionais) e o E2E novo guarda a largura do nome.
- Contrato: `check-contract-tests.ps1` íntegro para 048, 018, 024, 030, 031 e 046; 5/5 verdes.
- Testes executados: `npx tsc -b` limpo; `npm run lint` sem erros (só avisos antigos de refs/`baseItems`); `npm run test` → 341 arquivos, 2431/2431; `npm run build` e `npm run build:tizen` ok (`sync-tizen` sem recusar arquivo); `node e2e/run.mjs` → 28/28 em 303s.
- Pendências: T031 (capturas antes/depois de Filmes/Séries/Configurações: só há o `depois`; FR-017 está protegido por testes e pela suíte E2E, não por comparação visual) e T033 (revisão lado a lado com o protótipo e o Lab, `quickstart.md` §4/§5, e a Tizen QA matrix §34). Recomendação: TV física para o desempenho do degradê e do `scrollPadding`.

### Checklist de Release

- [X] Fase 2 (próximos programas) concluída
- [X] Fase 3 (US1 — destaque) concluída
- [X] Fase 4 (US2 — painéis e foco) concluída
- [X] Fase 5 (US3 — cartões) concluída
- [X] Fase 6 (US4 — itens) concluída
- [X] Fase 7 (US5 — cabeçalho) concluída
- [X] Testes de contrato todos verdes na suíte completa e `check-contract-tests.ps1` íntegro para 048, 018, 024, 030, 031 e 046
- [X] Lint, `tsc -b`, `npm run test`, `npm run build` e `npm run build:tizen` limpos
- [X] `npm run test:e2e` verde (gate da constitution antes de qualquer validação em TV)
- [ ] `quickstart.md` executado; capturas comparadas ao protótipo
- [X] Nenhum literal de cor/raio/espaçamento/fonte novo fora das medidas locais documentadas (FR-019)
- [ ] Tabela `## Referências do Design System` do `plan.md` conferida item a item (Spec V14 + Component Lab), e Tizen QA matrix da Spec §34 (Remote / Visual / Performance) aplicada à tela — o que só a TV física prova fica registrado como recomendação

---

## Dependencies & Execution Order

- **Setup (1)** → **Foundational (2)** → US1 (3) e US2 (4) em qualquer ordem → US3 (5) depende de 2 e 3 (o destaque define o grid do painel) → US4 (6) e US5 (7) independentes → Polish (8).
- `[P]` = arquivos diferentes, sem dependência.

## Implementation Strategy

1. Fases 1–3 → MVP visual (destaque). Parar e validar com captura.
2. Fase 4 (painéis + foco) → maior ganho estrutural restante.
3. Fases 5–7 em ordem de prioridade; Polish fecha com E2E e capturas.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
