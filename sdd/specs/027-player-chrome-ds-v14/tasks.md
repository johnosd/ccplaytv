---
description: "Tasks da feature 027 — Player chrome V14 com auto-hide e teclas de mídia"
---

# Tasks: Player chrome do Design System V14 com auto-hide e teclas de mídia (Onda 6)

**Input**: Documentos de design de `sdd/specs/027-player-chrome-ds-v14/`

**Prerequisites**: plan.md, spec.md, logic/chrome-player.md, quickstart.md, contract-tests.lock

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)

## Path Conventions

- Frontend em `tv-web/src/` (componentes compartilhados em `components/`,
  libs em `lib/`, telas em `features/<área>/`, CSS em `styles/`).
- Testes ao lado do arquivo (`*.test.ts(x)`); contrato em
  `tv-web/src/components/PlayerLayer.player-chrome.contract.test.tsx` (travado).
- E2E em `tv-web/e2e/*.mjs`.
- Comandos rodam a partir de `tv-web/`; scripts `.planning/` a partir da raiz.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Ícones, entradas "Em breve" e o arquivo de CSS do chrome.

- [X] T001 [P] Adicionar os ícones `speed`, `aspect`, `guide`, `skipPrevious`, `skipNext` em `tv-web/src/components/iconPaths.ts` (D-013), SVG local no mesmo formato dos existentes
- [X] T002 [P] Adicionar `player-tracks`, `player-quality`, `player-speed`, `player-aspect`, `player-info` (backlogItem 55) em `tv-web/src/lib/comingSoon.ts` (D-014)
- [X] T003 [P] Criar `tv-web/src/styles/player.css` (só tokens V14; faixa, linha, timeline, soft disabled, reduzir movimento) e importar em `tv-web/src/main.tsx` logo após `./features/screens.css` (D-012)

**Critério de Conclusão**: `npx vitest run src/components/Icon.test.tsx src/lib` verde; `npx tsc -b` limpo.

**Registro da Fase**:

- Status: Concluída
- Feito: T001–T003. `Icon.test.tsx` é parametrizado por `Object.keys(ICON_PATHS)`, então os 5 ícones novos entraram sem editar o teste.
- Contrato: sem contrato nesta fase
- Testes executados: `npx vitest run src/components/Icon.test.tsx` — 22/22 verdes; `npx tsc -b` limpo
- Pendências: nenhuma. **Achado durante a fase (bloqueava T008, corrigido inline)**: `tv-web/src/components/playerChrome.ts` (o STUB) e o novo `PlayerChrome.tsx` diferem só na primeira letra — no Windows (filesystem case-insensitive), `import { PlayerChrome } from './PlayerChrome'` (sem extensão) resolvia para `playerChrome.ts` (o resolvedor tenta `.ts` antes de `.tsx`), devolvendo `undefined`. Renomeado o módulo de lógica pura para `tv-web/src/components/chromeControls.ts` (T004 em diante já usa esse nome); ver R-008 em `plan.md`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Peças puras e de teclado que todas as stories usam.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

- [X] T004 Implementar `chromeControls` e mover `hasSeekBar` para `tv-web/src/components/chromeControls.ts` seguindo `logic/chrome-player.md` §2 (ordem, rótulos, `availability`, `comingSoonId`) — renomeado de `playerChrome.ts`, ver Registro da Fase 1
- [X] T005 [P] Implementar `registerMediaKeys` e `mediaKeyOf` em `tv-web/src/lib/tizenMediaKeys.ts` (D-006, `logic` §5 — registro estrito, `key` ou `keyCode`)
- [X] T006 Adicionar `onMediaKey?: (key: MediaKey) => void` a `tv-web/src/lib/useRemoteNav.ts`. Sem o handler, a tecla não é interceptada; com ele, `preventDefault` e, em modal, `stopImmediatePropagation` (D-007)
- [X] T007 Chamar `registerMediaKeys()` em `tv-web/src/App.tsx`, no mesmo efeito de `registerFavoriteColorKey()`
- [X] T008 Criar `tv-web/src/components/PlayerChrome.tsx`: componente de apresentação com a identidade (título/subtítulo, ou a faixa "AO VIVO" + número + `PosterArt variant="logo"` + nome), timeline (`hasSeekBar`) e linha `chromeControls` com `.tv-focus`/`.is-soft-disabled` e `aria-label` = rótulo. Sem estado próprio de foco (ADR-009)

### Testes da Fase

- [X] T009 [P] `tv-web/src/components/chromeControls.test.ts`: tabela de `chromeControls` para VOD/Live × `canPause`/`canSeek` × `episodeStep` (nulo, limites, meio), cobrindo "Velocidade só no VOD" e "Guia só no Live"
- [X] T010 [P] `tv-web/src/lib/tizenMediaKeys.test.ts`: fora da TV é no-op; registra só as teclas listadas; lista vazia ou ausente não registra; `mediaKeyOf` reconhece por nome e por `keyCode`
- [X] T011 [P] Casos novos em `tv-web/src/lib/useRemoteNav.test.tsx` (arquivo existente, não o contrato da 017): `onMediaKey` recebe a tecla; sem handler, o evento não tem `defaultPrevented`
- [X] T012 [P] `tv-web/src/components/PlayerChrome.test.tsx`: faixa sem botões, linha com o foco no índice pedido, rótulos acessíveis

**Critério de Conclusão**: T009–T012 verdes, `npx tsc -b` e `npm run lint` limpos, e os demais testes de `src/components`/`src/lib` sem regressão (fora os flakes documentados).

**Registro da Fase**:

- Status: Concluída
- Feito: T004–T012. `chromeControls`/`hasSeekBar` seguem `logic` §2 à risca; `registerMediaKeys` mais estrito que `tizenColorKey.ts` (lista ausente/vazia/erro → nada registrado, D-006); `useRemoteNav` ganhou `onMediaKey` sem tocar o resto do fluxo.
- Contrato: sem contrato nesta fase (a 027 só tem contrato a partir da Fase 3)
- Testes executados: `npx vitest run src/components/chromeControls.test.ts src/lib/tizenMediaKeys.test.ts src/lib/useRemoteNav.test.tsx src/components/PlayerChrome.test.tsx` — 52/52 verdes; `npx vitest run src/lib/useRemoteNav.busca.contract.test.tsx` (trava da 017) — 1/1 verde; `npx tsc -b`/`npm run lint` limpos
- Pendências: nenhuma

**Checkpoint**: Fundação pronta — user stories podem começar.

---

## Phase 3: User Story 1 - Chrome V14 no filme e no episódio (Priority: P1) 🎯 MVP

**Objetivo**: filme e episódio usam o chrome V14, com o comportamento de teclas da 011 preservado e os mocks "Em breve" na linha.

**Independent Test**: abrir um filme → título, timeline, ⏪ ▶⏸ ⏩, mocks; some em 5 s; pausado não some.

### Contrato da Fase

- `filme: chrome com título, Play/Pause focado e mocks "em breve"; selecionar um mock avisa sem mexer na reprodução` — US1/AC1, US5/AC1, FR-007/FR-020/FR-021
- Comando: `npx vitest run src/components/PlayerLayer.player-chrome.contract.test.tsx -t "filme: chrome"`

### Implementation

- [X] T013 [US1] Em `tv-web/src/components/PlayerLayer.tsx`, guardar a mídia do chrome (`playback.kind === 'channel'` → `live`) e trocar `playerControlsActions` por `chromeControls` para o VOD. Manter as regras de teclas do VOD (`logic` §3, FR-002), incluindo ↑ para a barra e ↓ de volta. OK em `soon`/`limit` só dá o aviso → contrato: `filme: chrome…`
- [X] T014 [US1] Adicionar `useToast()` + `<Toast>` dentro do `.player-overlay` em `PlayerLayer.tsx`, com os textos de `logic` §6 (D-005) → contrato: `filme: chrome…`
- [X] T015 [US1] Consumir `identity` (fallback `title`) e renderizar `PlayerChrome` no lugar de `PlayerControls` em `PlayerLayer.tsx` → contrato: `filme: chrome…`
- [X] T016 [US1] Remover `tv-web/src/components/PlayerControls.tsx` e `PlayerControls.test.tsx`, migrando os casos ainda válidos (timeline sem duração, sem percentual) para `PlayerChrome.test.tsx` (D-011)
- [X] T017 [P] [US1] Passar `identity` em `tv-web/src/features/movies/MovieDetailScreen.tsx` (título do filme) e em `tv-web/src/features/home/HomeScreen.tsx` (título; sem `episodeStep`, D-010)
- [X] T018 [US1] Ajustar `tv-web/src/components/PlayerLayer.test.tsx` onde o VOD visível mudou de propósito (contagem/ordem de botões), mantendo a intenção de cada caso (R-004)

### Testes da Fase

- [X] T019 [US1] Em `PlayerLayer.test.tsx`: timeline ausente sem duração (FR-008); motor sem `canSeek` → sem ⏪/⏩/timeline (US1/AC5); episódio mostra `identity.subtitle` (US1/AC4)

**Critério de Conclusão**: `npx vitest run src/components/PlayerLayer.player-chrome.contract.test.tsx -t "filme: chrome"` → 1/1 verde. `check-contract-tests.ps1 -Slug 027-player-chrome-ds-v14` e `-Slug 020-ciclo-vida-player` íntegros, e o contrato da 020 continua 4/4. Mais `PlayerLayer.test.tsx`/`PlayerChrome.test.tsx` verdes, `tsc`/lint limpos.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída
- Feito: T013–T019. `chromeMedia`/`chromeLevel`/`focusedIndex`/`seekBarFocused` implementados nesta fase (ver R-008 abaixo — viraram refs na Fase 4 por um bug de corrida achado lá, não nesta). `PlayerControls.tsx`/`.test.tsx` removidos; 4 casos migrados pra `PlayerChrome.test.tsx`. Corrigido também um desvio real do FR-002/AC5 achado ao escrever T019: a timeline exigia só `reportsDuration`, mas o código antigo (`playerControlsActions`) sempre também exigiu `canSeek` — `PlayerChrome`/`PlayerLayer` corrigidos pra exigir os dois (ver R-009).
- Contrato: `npx vitest run src/components/PlayerLayer.player-chrome.contract.test.tsx -t "filme: chrome"` — 1/1 verde
- Testes executados: `npx vitest run src/components/PlayerLayer.test.tsx src/components/PlayerChrome.test.tsx` — 63/63 verdes; `check-contract-tests.ps1` da 027 e da 020 íntegros; `tsc -b`/lint limpos
- Pendências: nenhuma

---

## Phase 4: User Story 2 - Chrome V14 no canal ao vivo com troca por ↑/↓ (Priority: P1)

**Objetivo**: faixa de identidade + linha por ←/→; ↑/↓ trocam de canal na entrada de origem, sem volta nas pontas; OK na faixa abre o zapping da 016.

**Independent Test**: canal → ↓ troca para o seguinte e mostra a faixa; no último, só avisa; OK abre o zapping.

### Contrato da Fase

- `canal: faixa "AO VIVO" com número e nome; ↓ pede o próximo canal, OK abre o zapping, → revela a linha sem "Velocidade"` — US2/AC1-2-5, FR-009/FR-010/FR-013/FR-022/FR-034
- `canal: ↓ no último canal da lista avisa o limite e a faixa continua mostrando o mesmo canal` — US2/AC3, FR-011
- Comando: `npx vitest run src/components/PlayerLayer.player-chrome.contract.test.tsx -t "canal:"`

### Implementation

- [X] T020 [US2] Em `PlayerLayer.tsx`: níveis `hidden`/`band`/`row` do Live (`logic` §3). ↑/↓ → `onChannelStep`, com aviso de limite quando devolve `false`; ←/→ → `row`; OK na faixa → `onIdleSelect`; RETURN na linha → faixa; nova sessão do Live começa em `band` → contratos: `canal: faixa…`, `canal: ↓ no último…`
- [X] T021 [US2] Em `scheduleHide` (`PlayerLayer.tsx`): remover a saída antecipada para "sem ações", para que a faixa e a linha escondam em 5 s e pausado continue sem esconder (D-015)
- [X] T022 [US2] Em `tv-web/src/features/live/LiveScreen.tsx`: `zapSequenceRef` capturado em `playActiveChannel` (dentro e fora do zapping), `stepChannel` conforme `logic` §7 (pula não reproduzíveis, atualiza `lastGoodChannelRef` e `focusedIdentity`), e `identity` com `channelNumberOf` e `icon_url` (D-008/D-009)
- [X] T023 [US2] Ajustar em `PlayerLayer.test.tsx` o caso "canal ao vivo em playing não tem elemento focável…" e o T011 da 016 para o comportamento de faixa (sem botão) e linha (R-004), sem perder a garantia de que RETURN sai — **nenhum ajuste foi de fato necessário**: os dois já só afirmavam ausência de `.tv-focus`/chamada de `onIdleSelect`, sem depender de contagem de botões, e continuaram válidos como estavam.

### Testes da Fase

- [X] T024 [P] [US2] Em `tv-web/src/features/live/LiveScreen.test.tsx` (arquivo existente, não o contrato da 024): ↓ troca para o seguinte da categoria; canal não reproduzível pulado; ao sair do player o foco está no último canal assistido (FR-014); "Todos" respeita a mesma vizinhança (D-008) — **"★ Favoritos" ficou de fora**: `useFavoritesContent` não é mockado neste arquivo (só IndexedDB real), então esse caso específico foi deixado para o E2E (T035)
- [X] T025 [US2] Em `PlayerLayer.test.tsx`: faixa e linha somem em 5 s; `topLayer` aberto → nenhum chrome renderiza (FR-005)

**Critério de Conclusão**: `npx vitest run src/components/PlayerLayer.player-chrome.contract.test.tsx -t "canal:"` → 2/2 verdes, travas da 027/020/024 íntegras, `LiveScreen*.test.tsx` verdes (os flakes conhecidos confirmados isolados), `tsc`/lint limpos.

**Checkpoint**: User Stories 1 e 2 funcionais.

**Registro da Fase**:

- Status: Concluída
- Feito: T020–T025.
- Contrato: `npx vitest run src/components/PlayerLayer.player-chrome.contract.test.tsx -t "canal:"` — 2/2 verdes
- Testes executados: `npx vitest run src/features/live/LiveScreen.test.tsx` — 71/71 verdes; `LiveScreen.live-tv-ds-v14.contract.test.tsx` (024) — 2/2; `tsc -b`/lint limpos
- Pendências: nenhuma. **R-008 (achado real, corrigido nesta fase — detalhe completo em `plan.md`)**: uma corrida de closure obsoleta — `sessionRef.current` (ref) é mutado sincronamente quando a sessão nasce, mas `chromeMedia`/`chromeLevel`/`focusedIndex`/`seekBarFocused` eram `useState`; uma tecla que chegasse entre a sessão nascer e o próximo commit React lia a sessão nova com nível/mídia ainda no *default* ('vod'/'full'), executando a ação errada. Reproduzido pelos 11 testes de zapping (016/018) dentro de `LiveScreen.test.tsx` (todos abrem o zapping com um segundo `Enter` logo após `getByRole('dialog')`, que já existe desde o primeiro render, antes da sessão terminar de resolver). Corrigido convertendo os quatro em refs — mesmo padrão de `sessionRef.current.state`, já documentado no próprio arquivo.

---

## Phase 5: User Story 3 - Teclas de mídia do controle (Priority: P2)

**Objetivo**: Play/Pause, Play, Pause, Stop, ⏪, ⏩ e CH± agem no player conforme a mídia.

**Independent Test**: filme → Play/Pause alterna, revela e foca ▶⏸; Stop fecha como RETURN.

### Contrato da Fase

- `filme: MediaPlayPause pausa e foca Play/Pause; MediaFastForward salta 10 s; MediaStop fecha como RETURN` — US3/AC1-3-4, FR-024/FR-025/FR-026
- Comando: `npx vitest run src/components/PlayerLayer.player-chrome.contract.test.tsx -t "MediaPlayPause"`

### Implementation

- [X] T026 [US3] Passar `onMediaKey` no `useRemoteNav` do `PlayerLayer.tsx` com a tabela de `logic` §5: VOD age pelas capacidades; Live só revela a faixa, exceto CH± (→ `onChannelStep`) e Stop; com `topLayer`, só Stop; sem sessão tocando/pausada, só Stop → contrato: `filme: MediaPlayPause…`

### Testes da Fase

- [X] T027 [US3] Em `PlayerLayer.test.tsx`: `MediaPause` idempotente; `MediaRewind` → −10 s; no canal, Play/Pause/⏪/⏩ só revelam e CH+/CH− chamam `onChannelStep('previous'/'next')`; com `topLayer` aberto só Stop age; tecla antes de `playing` não trava

**Critério de Conclusão**: `npx vitest run src/components/PlayerLayer.player-chrome.contract.test.tsx -t "MediaPlayPause"` → 1/1 verde, travas íntegras, `tsc`/lint limpos.

**Registro da Fase**:

- Status: Concluída
- Feito: T026–T027. `MediaPlayPause`/`MediaPlay`/`MediaPause` usam `session.togglePause()` (que já checa `canPause`/estado internamente) guardado por `session.state` explícito pra `MediaPlay`/`MediaPause` ficarem idempotentes (só o Play/Pause combinado sempre alterna).
- Contrato: `npx vitest run src/components/PlayerLayer.player-chrome.contract.test.tsx -t "MediaPlayPause"` — 1/1 verde
- Testes executados: `npx vitest run src/components/PlayerLayer.test.tsx` — 63/63 verdes; `tsc -b`/lint limpos
- Pendências: nenhuma

---

## Phase 6: User Story 4 - Episódio anterior/próximo pelo chrome (Priority: P2)

**Objetivo**: botões de episódio no chrome, atravessando temporadas, soft disabled no limite.

**Independent Test**: E2 → "Próximo episódio" toca o E3; no 1º episódio, "Episódio anterior" só avisa.

### Contrato da Fase

- `episódio: "Episódio anterior" no limite só avisa; "Próximo episódio" pede a troca` — US4/AC1-3, FR-016/FR-017
- Comando: `npx vitest run src/components/PlayerLayer.player-chrome.contract.test.tsx -t "episódio:"`

### Implementation

- [X] T028 [US4] Em `PlayerLayer.tsx`: `episodeStep` entra em `chromeControls`; OK em `real` → `episodeStep.onStep`; em `limit` → aviso (`logic` §6) → contrato: `episódio: …`
- [X] T029 [P] [US4] `previousEpisode(seasons, currentId)` em `tv-web/src/features/series/episodeNavigation.ts` (espelho de `nextEpisode`, atravessa para o último da temporada anterior)
- [X] T030 [US4] Em `tv-web/src/features/series/SeriesDetailScreen.tsx`: passar `identity` (série + `episodeCode` • nome, sem repetir) e `episodeStep` (`hasPrevious`/`hasNext` por `previousEpisode`/`nextEpisode`; `onStep` → `setMode({ kind: 'playing', episode, startAtMs: startAtMsFor(episode) })`) (D-010) — generalizado via nova `switchEpisode()`, que `playNext` (autoplay) passou a chamar também, pra "mesmo caminho do autoplay" (FR-018) valer de verdade (move `seasonIdx`/`row`/foco, não só `mode`)

### Testes da Fase

- [X] T031 [P] [US4] `tv-web/src/features/series/episodeNavigation.test.ts`: `previousEpisode` no meio, no 1º da temporada (atravessa), no 1º da série (`null`), com temporada sem número
- [X] T032 [US4] Em `tv-web/src/features/series/SeriesDetailScreen.test.tsx` (não travado): "Próximo episódio" no último da T1 abre o 1º da T2, movendo temporada/foco (FR-018) — a gravação do progresso em si é do teardown do `PlayerLayer` (mockado neste arquivo), coberta por `PlayerLayer.test.tsx`/`progressRecorder.test.ts`, não aqui

**Critério de Conclusão**: `npx vitest run src/components/PlayerLayer.player-chrome.contract.test.tsx` → **5/5** verdes, `check-contract-tests.ps1 -Slug 027-player-chrome-ds-v14` íntegro, testes de séries verdes, `tsc`/lint limpos.

**Registro da Fase**:

- Status: Concluída
- Feito: T028–T032.
- Contrato: `npx vitest run src/components/PlayerLayer.player-chrome.contract.test.tsx` — **5/5 verdes** (todos os cenários da 027)
- Testes executados: `npx vitest run src/features/series/episodeNavigation.test.ts src/features/series/SeriesDetailScreen.test.tsx` — 64/64 verdes; `check-contract-tests.ps1 -Slug 027-player-chrome-ds-v14` íntegro; `tsc -b`/lint limpos
- Pendências: nenhuma

---

## Phase 7: User Story 5 - Controles "Em breve" do Spec (Priority: P3)

**Objetivo**: fechar acessibilidade e a experiência dos mocks (já renderizados desde as Fases 3/4).

**Independent Test**: em canal e filme, cada mock focável anuncia "Em breve — …"; Velocidade só no VOD; Guia só no Live.

### Implementation

- [X] T033 [US5] Revisar `PlayerChrome.tsx`/`player.css`: foco dos mocks visível sem depender só de cor (contorno + escala da receita ADR-007), `aria-disabled="true"` em `soon`/`limit`, e a transição de aparecer/sumir respeitando reduzir movimento (FR-030/FR-031) — **sem mudança de código**: `.tv-focus`/reduzir movimento já são globais (`index.css`, feature 021) e se aplicam a qualquer `<button>`, inclusive os do chrome; `aria-disabled` já saiu certo de T008/T028

### Testes da Fase

- [X] T034 [US5] Em `PlayerChrome.test.tsx`: todo controle tem nome acessível e os `soon`/`limit` têm `aria-disabled`; nenhum mock renderiza valor de qualidade, resolução ou velocidade (FR-021)

**Critério de Conclusão**: T034 verde, contrato 5/5 continua verde, `tsc`/lint limpos.

**Registro da Fase**:

- Status: Concluída
- Feito: T033 (revisão, sem mudança de código) + T034.
- Contrato: contrato 5/5 continua verde (nenhuma mudança de código nesta fase)
- Testes executados: `npx vitest run src/components/PlayerChrome.test.tsx` — 12/12 verdes; `tsc -b`/lint limpos
- Pendências: nenhuma

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: E2E, docs e a passada obrigatória na TV física.

- [X] T035 Criar `tv-web/e2e/player-chrome.mjs` (mesmo padrão dos scripts existentes; fixture em `tv-web/e2e/fixtures/`), cobrindo o chrome do filme (auto-hide, mock "Em breve", ⏪ escondido), a faixa do canal (↓ troca, limite, OK → zapping, → linha, RETURN em camadas), episódio anterior/próximo e as teclas de mídia sintéticas (`MediaPlayPause`, `MediaStop`, `ChannelDown`)
- [X] T036 Rodar todos os `tv-web/e2e/*.mjs` e `npm run test:e2e` com o dev server recém-iniciado; atualizar só o que dependia de comportamento que esta spec mudou de propósito (R-005), registrando cada ajuste
- [X] T037 `npm run test`, `npx tsc -b`, `npm run lint`, `npm run build`, `npm run build:tizen` (a guarda de arquivos emitidos precisa passar sem mexer em `tizen_web_project.yaml`, D-016)
- [X] T038 Executar `quickstart.md` no navegador (cenários 1–5)
- [X] T039 Atualizar `CLAUDE.md` (bloco da 027 em "Project status"), `.planning/backlog.md` (M7 → status real) e `.planning/migracao-design-system-v14.md` (Onda 6), sem descrever como entregue o que não foi
- [X] T040 **Gate**: passada na TV física com a skill `tizen-tv`, seguindo o roteiro da seção "Passada na TV física" de `quickstart.md`. Registrar teclas que chegam, `event.key`/`keyCode`, `getSupportedKeys()`, chrome/toast sobre o plano de hardware e a direção ↑/↓ (R-001/R-002/R-003/R-006)

### Checklist de Release

- [X] Fase 1 (Setup) concluída
- [X] Fase 2 (Foundational) concluída
- [X] Fase 3 (US1) concluída
- [X] Fase 4 (US2) concluída
- [X] Fase 5 (US3) concluída
- [X] Fase 6 (US4) concluída
- [X] Fase 7 (US5) concluída
- [X] Testes de contrato 5/5 verdes na suíte completa e `check-contract-tests.ps1 -Slug 027-player-chrome-ds-v14` íntegro
- [X] Contratos travados de outras features intactos e verdes: `020-ciclo-vida-player`, `024-live-tv-ds-v14`, `017`/`018` (busca)
- [X] `npm run test`, `tsc -b`, lint, `build`, `build:tizen` limpos
- [X] E2E: `player-chrome.mjs` + todos os scripts existentes verdes
- [X] `quickstart.md` executado no navegador
- [X] Passada na TV física feita (gate, SC-004), ou dispensa explícita do usuário registrada em `Riscos e Decisões`
- [X] Docs atualizadas (CLAUDE.md, backlog, migração)

**Registro da Fase**:

- Status: Concluída
- Feito: T035–T040.
- Contrato: 5/5 verde na suíte completa; travas 027/020/024/017/018 íntegras
- Testes executados: `npm run test` (1269/1273 — só os 4 flakes-sob-paralelismo já documentados, confirmados isolados), `tsc -b`/lint/`build`/`build:tizen` limpos; `node e2e/player-chrome.mjs` (novo, 33 verificações) + os 10 scripts `.mjs` existentes + `npm run test:e2e` — todos verdes; `quickstart.md` cenários 1–3 e 5(mecanismo global) via o script novo, cenário 4 (Favoritos) verificado interativamente no navegador (Playwright MCP) por não ter mock de `useFavoritesContent` disponível em `LiveScreen.test.tsx`
- Pendências: nenhuma. **T040 concluído em 28/09/2026** — passada na TV física (QN50Q60DAGXZD) confirmada pelo usuário: teclas de mídia (Play/Pause, ⏪/⏩, Stop, CH±) funcionando em Filme/Episódio/Canal, zapping por ↑/↓ funcionando, e a direção ↑=anterior/↓=próximo (R-003) confirmada como natural — sem relato de tecla ausente ou de `getSupportedKeys()` incompleta. Verificação feita pelo próprio usuário na TV (não por sessão interativa desta sessão); o detalhamento tecla-a-tecla com `event.key`/`keyCode` exatos não foi coletado por escrito, só a confirmação funcional. Achado à parte, **fora do escopo desta feature**: scrollbars nativas visíveis e pouco aproveitamento de tela em `MoviesScreen`/`HomeScreen` (telas das features 025/026, não tocadas pela 027) — registrado em `.planning/backlog.md` (Bugs, absorvido pela feature 028/Onda 7), não corrigido aqui por decisão do usuário. Achado no meio do caminho (Cenário 4 do quickstart, sessão interativa): `page.route('**/live/**', () => route.abort())` intercepta também os módulos do próprio Vite dev server (`/src/features/live/*.tsx`) e derruba o app inteiro — nunca usar um glob amplo desses num script E2E; escopar ao host fictício (`http://…-e2e.test/**`) e nunca `route.abort()` (usa `route()` sem chamar nada, deixando pendente pra sempre — `route.abort()` dispara o evento `error` nativo do `<video>` antes do evento sintético `playing`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (1)** → **Foundational (2)** → bloqueia todas as stories.
- **US1 (3)** vem antes de todas: troca `PlayerControls` por `PlayerChrome` e cria o toast.
- **US2 (4)** depende de US1 (toast, `PlayerChrome`).
- **US3 (5)** depende de US1 e US2 (usa os níveis dos dois).
- **US4 (6)** depende de US1.
- **US5 (7)** depende de US1 e US2.
- **Polish (8)** depende de todas.

### Parallel Opportunities

- T001/T002/T003; T005 com T004; T009–T012; T017 com T018; T024 com T025; T029/T031.
- US4 (Fase 6) pode correr em paralelo com US2/US3, depois da US1.

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Fases 1 e 2.
2. Fase 3 (US1) → validar filme/episódio no navegador.

### Incremental Delivery

1. US1 → US2 (Live) → US3 (teclas) → US4 (episódios) → US5 (acabamento) → Polish com a TV física.

## Notes

- `[P]` = arquivos diferentes, sem dependência
- Nunca editar `PlayerLayer.player-chrome.contract.test.tsx` nem o contrato da 020
- Commitar após cada fase

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->

## Phase 9: Convergence

**Purpose**: Achado do `sdd-converge` (2026-09-28) — comparação da feature contra spec/plan/tasks encontrou 1 lacuna acionável (ver tabela "Convergence Findings" apresentada no chat).

- [X] T041 [Convergence] Atualizar a seção "### Onda 6 — Player chrome (feature 027)" de `.planning/migracao-design-system-v14.md` (por volta das linhas 336–350): troca "**Código-completo** (52/54 tasks; só falta o gate da TV física)" por um texto que reflita 54/54 tasks e o gate da TV física (SC-004/T040) confirmado pelo usuário na QN50Q60DAGXZD em 28/09/2026 — mesma informação que `sdd/specs/027-player-chrome-ds-v14/plan.md` → `## Estado Atual` e `.planning/backlog.md` (linha ~1082, `## Features`) já registram. Origem: `plan: T039` (Fase 8/Polish, que atualizou `CLAUDE.md`/`backlog.md` mas deixou esta seção específica desatualizada) / Constitution "Documentação do Repositório É Canônica".

**Registro da Fase**:

- Status: Concluída
- Feito: T041 — seção "Onda 6" de `.planning/migracao-design-system-v14.md` reescrita para "Implementada, 54/54 tasks, gate da TV física cumprido", com a confirmação de 28/09/2026 (T040) explícita.
- Contrato: sem contrato nesta fase (achado de documentação, não de código)
- Testes executados: `check-contract-tests.ps1 -Slug 027-player-chrome-ds-v14` — trava íntegra (5/5), inalterada por esta task (edição não tocou em código nem em teste)
- Pendências: nenhuma
