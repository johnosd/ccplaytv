---
description: "Tasks da feature 041 — qualidade, aspecto e preferências do player (sem velocidade)"
---

# Tasks: Qualidade, aspecto e preferências do player (sem velocidade)

**Input**: `sdd/specs/041-player-qualidade-aspecto/` (spec, plan, research, data-model, logic/aspecto-qualidade.md, quickstart)

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, logic/aspecto-qualidade.md

**Organization**: por user story; a Fase 1 é um spike na TV (gate de entrada do adaptador AVPlay) e a Fase 7 é a passada obrigatória na TV.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: US1 aspecto (P1), US2 qualidade (P2), US3 preferências (P2), US4 sem velocidade (P3)

## Path Conventions

- App da TV em `tv-web/src/` (`lib/player/`, `components/`, `components/player/`, `features/settings/`, `features/series/`)
- E2E em `tv-web/e2e/*.mjs` (Chromium; `webapis.avplay` falso injetado quando precisa do motor da TV)
- Docs da feature em `sdd/specs/041-player-qualidade-aspecto/`; scripts SDD em `.planning/scripts/powershell/`
- Nada em `api/` (ADR-008)

---

## Phase 1: Spike na TV (gate de entrada do adaptador AVPlay)

**Purpose**: provar na QN50Q60DAGXZD o que `research.md` R0-1/R0-2 marca "a confirmar", antes de escrever o adaptador AVPlay (R-001/R-002). Sem a TV, **parar e perguntar ao usuário** — não implementar o mapeamento por suposição.

- [X] T001 Sonda de diagnóstico desligada por padrão (`VITE_CCPLAY_AVPLAY_PROBE=1`, mesmo padrão do `VITE_CCPLAY_PERF`/`PerfOverlay` da 038): `tv-web/src/lib/player/avplayProbe.ts` + um painel na tela dentro do `.player-overlay` que, com um vídeo tocando, lista as entradas `VIDEO` de `getTotalTrackInfo()`/`getCurrentStreamInfo()` (só `Width`/`Height`/`Bit_rate`/`fourCC` — **nunca** URL), `typeof` de `setDisplayMethod`/`setVideoRoi`/`setStreamingProperty`/`setSelectTrack`, e permite, por teclas numéricas do controle, aplicar cada candidato de aspecto (LETTER_BOX, FULL_SCREEN, AUTO_ASPECT_RATIO, rect "original", ROI de zoom) e cada variante (`setSelectTrack('VIDEO', i)`; reabrir com `ADAPTIVE_INFO`), mostrando "aceito/lançou" e o tempo até a imagem mudar
- [X] T002 Instalar na TV (`.\.planning\scripts\powershell\deploy-tv.ps1` com o build da sonda) e rodar com o usuário: um filme, um canal MPEG-TS e um HLS multi-variante; perguntar o específico ("a imagem esticou?", "cortou as bordas?", "mudou em menos de 1 s?", "o modo ficou ao trocar de canal?") — quem viu cada resultado fica registrado
- [X] T003 Registrar o resultado em `research.md` (substituir cada "a confirmar") e em `plan.md` → R-001/R-002/R-006 (`Resolvido:` ou o plano B/C escolhido com o usuário); decidir aqui os modos que `getAspectModes()` do AVPlay declara e o caminho de `selectQuality`

**Registro da Fase**:

- Status: concluída para o aspecto (2026-10-01); qualidade só em parte.
- Feito: T001–T003. Sonda do AVPlay (build com `VITE_CCPLAY_AVPLAY_PROBE=1`) instalada na TV; o usuário não tem teclado numérico, então os botões do player foram ativados no build da sonda. Resultado: os 4 modos de aspecto funcionam (Zoom por retângulo 10% maior, `setVideoRoi` recusado), 6–28 ms; `research.md` R0-1 e R-001 resolvidos. Qualidade: `getTotalTrackInfo` devolve a entrada VIDEO (stream de qualidade única visto); troca de variante sem prova (R-009). Sonda removida (T040).
- Contrato: sem contrato nesta fase
- Testes executados: observação na TV pelo usuário (fotos do painel da sonda e respostas escritas).
- Pendências: persistência do modo entre sessões e piscada (R-006) só vistos de forma indireta (o usuário disse que o modo 'ficou'; o E2E prova a volta à preferência no navegador); troca de variante e Auto no AVPlay não provados.

---

## Phase 2: Foundational (modelo, sessão, chrome sem velocidade)

**Purpose**: tipos/funções puras, preferências, superfície da sessão e a linha de controles nova — base de todas as stories. Inclui a US4 (sem velocidade), porque a ordem da linha é pré-requisito dos contratos.

**⚠️ CRITICAL**: nenhuma user story começa antes desta fase.

- [X] T004 [P] Implementar `distinctQualities`, `qualityLabel`, `pickQualityForChoice`, `pickAspectForChoice` em `tv-web/src/lib/player/viewChoice.ts` (`logic/aspecto-qualidade.md` §1.2, §2.1, §2.2)
- [X] T005 [P] Implementar `readPlayerPreferences`/`writePlayerPreferences`/`trackChoiceFromPreferences`/`viewChoiceFromPreferences` em `tv-web/src/lib/player/playerPreferences.ts` (`data-model.md`; validação campo a campo; nunca lança)
- [X] T006 [P] Exportar `LANGUAGE_OPTIONS: { code: string; label: string }[]` (ordem de `LANGUAGE_NAMES`) em `tv-web/src/lib/player/tracks.ts`
- [X] T007 Sessão: `aspectModes`, `currentAspect`, `setAspectMode`, `supportsQuality`, `getQualities`, `selectedQualityId`, `selectQuality` em `tv-web/src/lib/player/PlayerService.ts` (interface `PlayerSession` + `PlayerServiceSession`; `logic` §1.1/§2.3; mesmo try/catch e "fechada = nada" dos métodos da 029)
- [X] T008 [US4] `chromeControls`: tirar `speed` de `ChromeControlId` e das linhas; `ChromeFeatures` ganha `aspect?: boolean` e `quality?: 'many' | 'single' | 'none'`; rótulos de `logic` §2.4 em `tv-web/src/components/chromeControls.ts` (D-010)
- [X] T009 [US4] Remover `player-quality`, `player-speed`, `player-aspect` de `tv-web/src/lib/comingSoon.ts` e o ícone/rótulo de `speed` em `tv-web/src/components/PlayerChrome.tsx`
- [X] T010 Mensagens novas (`ASPECT_UNAVAILABLE_MESSAGE`, `QUALITY_UNAVAILABLE_MESSAGE`, `QUALITY_SINGLE_MESSAGE`, `ASPECT_SWITCH_FAILED`, `QUALITY_SWITCH_FAILED`) em `tv-web/src/components/player/playerMessages.ts` (textos exatos de `logic` §1.4/§2.4/§2.5)
- [X] T011 [P] Modelo puro dos painéis (linhas, chaves `a:<modo>`/`q:auto`/`q:<altura>`, marcado, foco inicial, mover, reconciliar por chave) em `tv-web/src/components/playerViewPanels.ts`
- [X] T012 [P] Componente genérico `PlayerChoicePanel` (diálogo + `radiogroup` + linhas `radio`, CSS dos painéis da 029, rola sem barra) em `tv-web/src/components/PlayerChoicePanel.tsx`

### Testes da Fase

- [X] T013 [P] `tv-web/src/lib/player/viewChoice.test.ts` (empate de altura por taxa, altura inválida, ordem, max/min/height/auto, < 2 opções → `null`, fallback de aspecto)
- [X] T014 [P] `tv-web/src/lib/player/playerPreferences.test.ts` (fábrica, campo inválido isolado, JSON ruim, armazenamento `null`/que lança na leitura e na gravação, merge)
- [X] T015 [P] Sessão: casos novos em `tv-web/src/lib/player/PlayerService.viewChoice.test.ts` (interseção e ordem de `aspectModes`, modo fora da lista, motor que lança, `selectedQualityId` só no sucesso, sessão fechada)
- [X] T016 [P] Atualizar testes não travados que fixavam o chrome antigo, só onde a FR mudou (R-005): `tv-web/src/components/chromeControls.test.ts`, `tv-web/src/components/PlayerChrome.test.tsx`, `tv-web/src/lib/comingSoon.test.ts`; casos novos para os três estados de qualidade e aspecto
- [X] T017 [P] `tv-web/src/components/playerViewPanels.test.ts`

**Critério de Conclusão**: `npx vitest run src/lib/player src/components/chromeControls.test.ts src/components/PlayerChrome.test.tsx src/lib/comingSoon.test.ts src/components/playerViewPanels.test.ts` verde; `npx tsc -b --noEmit` limpo; `check-contract-tests.ps1 -Slug 041-player-qualidade-aspecto` íntegro. Os contratos ainda podem estar vermelhos (dependem do `PlayerLayer`).

**Checkpoint**: fundação pronta.

**Registro da Fase**:

- Status: concluída (2026-10-01). A Fase 1 (spike na TV) foi feita depois, ver o registro dela.
- Feito: T004–T017. `viewChoice.ts` e `playerPreferences.ts` implementados; `LANGUAGE_OPTIONS` em `tracks.ts`; a sessão ganhou `aspectModes`/`currentAspect`/`setAspectMode`/`supportsQuality`/`getQualities`/`selectedQualityId`/`selectQuality`; `chromeControls` sem `speed` (`features.aspect`/`features.quality`); mocks `player-quality`/`player-speed`/`player-aspect` fora de `comingSoon.ts` (`settings-player` fica para a Fase 5); mensagens novas; `playerViewPanels.ts` e `PlayerChoicePanel.tsx` (ainda sem consumidor).
- Contrato: sem contrato fechado nesta fase — 5 da 041 + o 1º da 027 seguem vermelhos como esperado (dependem do `PlayerLayer`, Fases 3/4); trava íntegra em todas as 24 features com `contract-tests.lock`.
- Testes executados: `npx vitest run src/lib/player src/components/chromeControls.test.ts src/components/PlayerChrome.test.tsx src/lib/comingSoon.test.ts src/components/playerViewPanels.test.ts` → 19 arquivos, 195/195; `npx tsc -b --noEmit` limpo; `npx vitest run src/components src/features/series src/features/live` → só os 5 contratos esperados vermelhos (`PlayerLayer.test.tsx` ajustado de 8 para 7 botões, R-005). `oxlint` só com os avisos `react(refs)` já aceitos na 040 (R-006).
- Pendências: Fase 1 (spike na TV) bloqueia T022/T029; `PlayerLayer.test.tsx` entrou na lista de R-005 (não estava nominalmente).

---

## Phase 3: User Story 1 - Ajustar o aspecto do vídeo no player (Priority: P1) 🎯 MVP

**Objetivo**: "Aspecto" real em filme, episódio e canal, com a escolha seguindo a sequência e cada reprodução nova partindo da preferência.

**Independent Test**: num filme e num canal, trocar o modo, ver a imagem mudar; trocar de canal/episódio e ver o modo mantido; abrir outro conteúdo do zero e ver o padrão.

### Contrato da Fase

- `filme: "Aspecto" abre o painel só com os modos do motor; escolher aplica e marca sem pausar nem saltar; RETURN volta ao botão` — US1/AC1-2, FR-001/002/015
- `canal: escolha de aspecto atravessa o zapping, não altera a preferência (nem é alterada por ela no meio) e uma montagem nova parte da preferência` — US1/AC3-5, US3/AC2-4, FR-003/012, SC-003
- 027 (emendado): `filme: chrome com título, Play/Pause focado e Qualidade/Aspecto sem suporte do motor; selecionar um deles avisa sem mexer na reprodução`
- Comando (de `tv-web/`): `npx vitest run src/components/PlayerLayer.qualidade-aspecto.contract.test.tsx src/components/PlayerLayer.player-chrome.contract.test.tsx -t "Aspecto|aspecto"`

### Implementation

- [X] T018 [US1] `PlayerLayer`: ler as preferências uma vez por montagem (lazy, no topo, sem efeito novo); semear `choiceRef` com `initialTrackChoice ?? trackChoiceFromPreferences(prefs)` e um `viewChoiceRef` com `initialViewChoice ?? viewChoiceFromPreferences(prefs)`; ligar `onViewChoiceChange` em `tv-web/src/components/PlayerLayer.tsx` e `tv-web/src/components/player/usePlayerPanels.ts` (`logic` §3; regras da 040) → contrato: C2
- [X] T019 [US1] `reapplyViewChoice` (aspecto sempre; `logic` §1.3, D-004) chamado logo após `reapplyTrackChoice` em `tv-web/src/components/player/usePlayerSession.ts` → contrato: C2
- [X] T020 [US1] Painel "Aspecto": `PanelState` `aspect` em `tv-web/src/components/player/playerLayerTypes.ts`; abrir/mover/OK/RETURN/falha em `usePlayerPanels.ts` (`activatePanelControl` trata `aspect` real/indisponível); `usePlayerChrome.controlsFor` passa `aspect: session.aspectModes.length > 0`; desenhar `PlayerChoicePanel` no `PlayerLayer.tsx` → contratos: C1, 027-T1
- [X] T021 [P] [US1] Adaptador `<video>`: `getAspectModes` (os quatro) e `setAspectMode` por `object-fit` em `tv-web/src/lib/player/htmlVideoAdapter.ts` (`research.md` R0-3)
- [X] T022 [US1] Adaptador AVPlay: `getAspectModes`/`setAspectMode` com o mapeamento provado na Fase 1 em `tv-web/src/lib/player/avplayAdapter.ts` (só modos provados; erro do motor nunca repassado)
- [X] T023 [US1] `SeriesDetailScreen`: `viewChoiceRef` ao lado de `trackChoiceRef`, zerado nos mesmos pontos, passado por `initialViewChoice`/`onViewChoiceChange` em `tv-web/src/features/series/SeriesDetailScreen.tsx` (US1/AC4, autoplay)

### Testes da Fase

- [X] T024 [P] [US1] `tv-web/src/lib/player/htmlVideoAdapter.aspect.test.ts` e `tv-web/src/lib/player/avplayAdapter.aspect.test.ts` (mapeamento, motor que lança → `false`, nada de URL em erro)
- [X] T025 [P] [US1] `PlayerLayer`: falha ao aplicar (toast, marcação reflete o motor), motor sem modo nenhum (soft disabled), autoplay de série mantendo o modo via `initialViewChoice` — em `tv-web/src/components/PlayerLayer.aspect.test.tsx`

**Critério de Conclusão**: C1 e C2 verdes, o 1º teste da 027 verde (5/5 da 027), `check-contract-tests.ps1` íntegro para 041, 027 e 029; `npx vitest run src/components src/lib/player src/features/series` verde.

**Checkpoint**: aspecto funcional e testável isoladamente.

**Registro da Fase**:

- Status: concluída (2026-10-01).
- Feito: T018–T025. Além do previsto, o `PlayerLayer` já traz também o painel/reaplicação de **qualidade** (T026–T028 antecipadas, necessárias para o spike sem teclado numérico). AVPlay: modos provados na TV (`research.md` R0-1).
- Contrato: `npx vitest run src/components/PlayerLayer.qualidade-aspecto.contract.test.tsx src/components/PlayerLayer.player-chrome.contract.test.tsx src/components/PlayerLayer.audio-legendas-info.contract.test.tsx` → 14/14 (4 da 041, 5 da 027, 5 da 029); trava íntegra.
- Testes executados: `npx vitest run src/components src/lib/player src/features/series src/features/live src/features/movies` → 834/834 (antes dos testes novos); novos: `avplayAdapter.aspect`, `htmlVideoAdapter.aspect`, `PlayerLayer.aspect` (5/5); `tsc` limpo.
- Pendências: aspecto validado pelo usuário na TV (Original/Preencher/Zoom/Ajustar, conteúdo não 16:9); persistência entre `close()`/`open()` e piscada (R-006) não observadas.

---

## Phase 4: User Story 2 - Escolher a qualidade quando o stream oferece (Priority: P2)

**Objetivo**: "Qualidade" real com Auto + só as resoluções anunciadas; soft disabled com o motivo quando não há o que escolher.

**Independent Test**: num stream com variantes, trocar e ver a resolução mudar (e o Info do stream refletir); num de qualidade única, ver o motivo.

### Contrato da Fase

- `filme: preferência "Máxima" aplica a maior resolução anunciada; o painel lista "Auto" e só o que o stream anuncia; escolher Auto não grava preferência` — US2/AC1-2, FR-005/014, SC-001
- `stream de qualidade única: "Qualidade" fica soft disabled com o motivo e só explica; a linha não tem "Velocidade" e o mock sumiu do registro` — US2/AC3, US4, FR-006/009/016, SC-004
- Comando (de `tv-web/`): `npx vitest run src/components/PlayerLayer.qualidade-aspecto.contract.test.tsx`

### Implementation

- [X] T026 [US2] Ref compartilhado de opções (`logic` §2.4) criado no `PlayerLayer.tsx`, lido por `usePlayerChrome.controlsFor` (`quality: 'many' | 'single' | 'none'`) e escrito por `usePlayerPanels.ts` (reaplicação, SELECT, releitura) → contratos: C3, C4
- [X] T027 [US2] `reapplyViewChoice` aplica a qualidade (`pickQualityForChoice`; `null` não chama) em `tv-web/src/components/player/usePlayerPanels.ts` → contrato: C3
- [X] T028 [US2] Painel "Qualidade": `PanelState` `quality`; abrir/mover/OK (commit `{height}`/`'auto'`)/falha (FR-007)/releitura que cai para Auto sem commit; `activatePanelControl` trata `quality` nos três estados → contratos: C3, C4
- [X] T029 [US2] Adaptador AVPlay: `getQualities` (entradas `VIDEO`) e `selectQuality` pelo caminho decidido na Fase 1 (troca direta ou reabertura interna com posição preservada e descarte de callbacks de `open` superado — R-002) em `tv-web/src/lib/player/avplayAdapter.ts`

### Testes da Fase

- [X] T030 [P] [US2] `tv-web/src/lib/player/avplayAdapter.quality.test.ts` (leitura de variantes, `extra_info` ruim, reabertura com posição, callbacks atrasados descartados, Auto)
- [X] T031 [P] [US2] `tv-web/src/components/PlayerLayer.quality.test.tsx` (falha na troca mantém a anterior com aviso, variante escolhida some na releitura → Auto, sequência com `{height}` não anunciada → Auto, Live)

**Critério de Conclusão**: contratos da 041 4/4 do `PlayerLayer` verdes, 027 5/5, 029 5/5, travas íntegras; `npx vitest run src/components src/lib/player` verde.

**Checkpoint**: qualidade funcional.

**Registro da Fase**:

- Status: concluída em código (2026-10-01); troca de variante **não provada na TV**.
- Feito: T026–T031 (T026–T028 já tinham entrado na Fase 3). AVPlay: `getQualities` (entradas `VIDEO` de `getTotalTrackInfo`) e `selectQuality` por `setSelectTrack('VIDEO', i)` com falha segura; Auto só é aceito se nenhuma variante foi forçada (voltar ao adaptativo exigiria reabrir o stream, R-002 — recusa com o aviso 'Não foi possível mudar a qualidade.'). Sonda do spike removida (T040).
- Contrato: 4/4 da 041 no `PlayerLayer` + 5/5 da 027 + 5/5 da 029 verdes; trava íntegra.
- Testes executados: `npx vitest run src/lib/player src/components` → 485/485 antes dos novos; `avplayAdapter.quality` + `PlayerLayer.quality` 11/11; `tsc` limpo.
- Pendências: na TV só foi visto o caso de qualidade única (botão 'só uma disponível', usuário, 2026-10-01); o catálogo do usuário separa HD/4K em itens distintos, então não há stream multi-variante para provar a troca — decisão do usuário: implementar sem prova, com falha segura (R-009). Gate da Fase 7: testar um HLS multi-variante se existir.

---

## Phase 5: User Story 3 - Preferências do player em Configurações (Priority: P2)

**Objetivo**: aba real "Player & reprodução" com as quatro preferências do aparelho.

**Independent Test**: definir Preencher/Máxima/Inglês/Português; abrir um filme com tudo isso e ver aplicado; abrir um sem inglês e ver o padrão, sem aviso.

### Contrato da Fase

- `sem lista ativa: mostra os valores de fábrica; escolher "Preencher" grava a preferência do aparelho, devolve o foco à linha e sobrevive a uma montagem nova` — US3/AC1-5, FR-010/011/015/016
- Comando (de `tv-web/`): `npx vitest run src/features/settings/SettingsScreen.player-reproducao.contract.test.tsx`

### Implementation

- [X] T032 [US3] `PlayerPreferencesPanel` (4 linhas `no-scale`, `aria-label="<rótulo>: <valor>"`, texto honesto do topo) em `tv-web/src/features/settings/PlayerPreferencesPanel.tsx` (`logic` §4) → contrato: C5
- [X] T033 [US3] `PlayerTab` (handle de teclas, seletor por `Modal` com foco na marcada, OK grava e volta à linha, RETURN não grava) em `tv-web/src/features/settings/tabs/PlayerTab.tsx` → contrato: C5
- [X] T034 [US3] Registro: `player` → `PlayerTab` em `tv-web/src/features/settings/tabs/settingsTabs.ts`; tirar `PlayerSoonTab` de `tabs/SimpleTabs.tsx`, a entrada `player` de `features/settings/ComingSoonPanel.tsx` e `settings-player` de `tv-web/src/lib/comingSoon.ts` → contrato: C5

### Testes da Fase

- [X] T035 [P] [US3] `tv-web/src/features/settings/PlayerTab.test.tsx` (as 4 linhas e seus seletores, idiomas de `LANGUAGE_OPTIONS`, RETURN sem gravar, ↑ na 1ª linha → topbar, ← → abas, só um `.tv-focus`)
- [X] T036 [P] [US3] Ajustar `tv-web/src/features/settings/SettingsPanels.test.tsx` e `tv-web/src/features/settings/SettingsScreen.test.tsx` (o mock "Em breve" de referência passa a ser "Perfis & parental") e `tv-web/src/lib/comingSoon.test.ts` (R-005)
- [X] T037 [P] [US3] FR-013 no `PlayerLayer`: preferência de áudio/legenda ausente no conteúdo → nada selecionado, sem toast; presente → aplicada — em `tv-web/src/components/PlayerLayer.preferencias.test.tsx`

**Critério de Conclusão**: C5 verde e os 5/5 da 041 verdes; travas 041/027/029/026/028 íntegras; `npx vitest run src/features/settings src/components` verde.

**Checkpoint**: preferências funcionais.

**Registro da Fase**:

- Status: concluída (2026-10-01).
- Feito: T032–T037. `PlayerTab` + `PlayerPreferencesPanel` + `playerPreferencesModel.ts` (4 linhas, seletor por `Modal`, grava em `playerPreferences`, sem lista ativa); registro `player` → `PlayerTab`; `PlayerSoonTab`, a entrada `player` do `ComingSoonPanel` e o mock `settings-player` removidos; testes antigos migraram o mock de referência para 'Perfis & parental' (R-005).
- Contrato: C5 verde; 5/5 da 041, 5/5 da 027 e 5/5 da 029 verdes; trava íntegra (24 features).
- Testes executados: `npx vitest run` → 2113/2118; as 5 falhas são os contratos da feature 034 (`*.fontes-estado.contract.*`), o vermelho de base que já existia antes da 041 (nota da 040). `PlayerTab` 6/6, `PlayerLayer.preferencias` 3/3; `tsc` limpo; `oxlint` só avisos antigos.
- Pendências: aba ainda não vista na TV (Fase 7); o texto honesto do topo e o seletor por `Modal` só foram provados em jsdom.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: E2E, limpeza, docs.

- [X] T038 Novo `tv-web/e2e/qualidade-aspecto.mjs` (registrar a lista por `e2e/lib/entrada.mjs`; `<video>`: aspecto real com `object-fit` verificado; `webapis.avplay` falso injetado: qualidade com variantes e com uma só, preferências aplicadas numa reprodução nova; aba de Configurações; nenhuma "Velocidade") e incluí-lo em `test:e2e` (`tv-web/package.json`)
- [X] T039 [P] Ajustar `tv-web/e2e/player-chrome.mjs`, `tv-web/e2e/audio-legendas-info.mjs` e `tv-web/e2e/home-busca-configuracoes.mjs` só onde o comportamento mudou (R-005)
- [X] T040 Sonda da Fase 1: remover, ou deixar desligada por padrão e documentada (decidir com o usuário); garantir que o build normal não a inclui
- [X] T041 Gates: `npx tsc -b --noEmit`, `npm run lint`, `npm run test` (flakes conhecidos `*.favorites.test.tsx`/`LiveScreen.test.tsx` confirmados isolados — registrar como pendência, nunca "ok"), `npm run build:tizen`, todas as travas (`check-contract-tests.ps1` para cada feature com `contract-tests.lock`), `npm run test:e2e` com `npm run dev` recém-iniciado (scripts rodados um a um se o encadeado falhar por conexão)
- [X] T042 Executar `quickstart.md` (cenários A–E no navegador)
- [X] T043 Docs: `CLAUDE.md` (parágrafo da 041; 027 sem "Velocidade"), `.planning/backlog.md` (item 55b), nota em `sdd/specs/029-audio-legendas-info-player/plan.md` sobre o comentário "Velocidade" que ficou na linha 315 do contrato travado

### Checklist de Release

- [X] Fase 1 (spike na TV) concluída, R-001/R-002 decididos
- [X] Fase 2 (Foundational + US4) concluída
- [X] Fase 3 (US1) concluída
- [X] Fase 4 (US2) concluída
- [X] Fase 5 (US3) concluída
- [X] Testes de contrato todos verdes na suíte completa e `check-contract-tests.ps1` íntegro (041, 027, 029 e as demais travas do repositório)
- [X] `npm run test:e2e` verde (incluindo `qualidade-aspecto.mjs`)
- [X] `quickstart.md` (navegador) executado
- [X] Fase 7 — passada na TV física (gate)

**Registro da Fase**:

- Status: concluída (2026-10-01).
- Feito: T038–T043. `e2e/qualidade-aspecto.mjs` (30 verificações, em `test:e2e`); `player-chrome.mjs` e `audio-legendas-info.mjs` ajustados (sem Velocidade; Qualidade indisponível no `<video>`); `home-busca-configuracoes.mjs` não precisou mudar; docs: `CLAUDE.md`, backlog 55b, spec (A-01), nota na 029.
- Contrato: 5/5 da 041, 5/5 da 027, 5/5 da 029 verdes; trava íntegra nas 24 features.
- Testes executados: `npx vitest run` → 2113/2118 (as 5 falhas são os contratos da 034, base anterior à 041); `tsc` limpo; `oxlint` só avisos antigos; `npm run build:tizen` ok; `npm run test:e2e` (22 scripts) todos com 'Todas as verificações passaram' contra o dev server que já rodava na 5173; quickstart A–D no navegador pelo E2E novo; E (idioma ausente) e o caso sem lista ativa por teste de componente (jsdom), não por navegador.
- Pendências: os contratos da 034 seguem vermelhos (não são desta feature); `CCPlayTv/assets/index.js` aparece modificado pelo build (artefato rastreado); ruído `AbortError` do `<video>` em `player-chrome.mjs` já existia.

---

## Phase 7: Passada na TV física (GATE OBRIGATÓRIO — SC-002, SC-005, R-008)

- [X] T044 Instalar (`.\.planning\scripts\powershell\deploy-tv.ps1`) e rodar com o usuário os 7 cenários de `quickstart.md` → "Passada na TV física"; registrar quem viu cada item e o que não foi executado; achado vira task ad-hoc nesta fase

**Registro da Fase**:

- Status: concluída (2026-10-01) — gate obrigatório fechado pelo usuário.
- Feito: build final (sem sonda) instalado na QN50Q60DAGXZD com `deploy-tv.ps1 -SkipBuild`; o usuário percorreu os 7 itens de `quickstart.md` → 'Passada na TV física' e confirmou todos: aba Player & reprodução com valores de fábrica e gravação; filme novo partindo da preferência (e não do Zoom anterior); Zoom atravessando a troca de canal; 'Qualidade — só uma disponível' em canal; preferências de áudio/legenda com idioma ausente sem aviso; nenhuma 'Velocidade'; painéis de Aspecto/Qualidade sobre o vídeo AVPlay com o foco de volta ao botão. Quem viu: o usuário (resposta escrita 'todos itens confirmados', sem detalhe por item).
- Contrato: sem contrato nesta fase (os 5/5 da 041, 5/5 da 027 e 5/5 da 029 seguem verdes; trava íntegra).
- Testes executados: observação na TV pelo usuário.
- Pendências: **não executado**: qualidade em um HLS multi-variante (troca de variante e Auto depois de forçar uma — R-009, o catálogo do usuário não tem stream assim); o item 3 do quickstart (qualidade real) fica, portanto, só provado contra o AVPlay falso. Persistência do modo entre sessões e piscada ao aplicar (R-006): sem relato específico; coberto no navegador pelo E2E (volta à preferência).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Fase 1 (spike)**: sem dependências de código; bloqueia T022 e T029 (adaptador AVPlay). As tasks não-AVPlay das Fases 2–5 podem começar antes do spike terminar, se a TV demorar.
- **Fase 2**: bloqueia as stories.
- **Fase 3 (US1)** → **Fase 4 (US2)**: a US2 reaproveita painel genérico, ref de escolha e reaplicação da US1.
- **Fase 5 (US3)**: depende só da Fase 2 (preferências) — pode correr em paralelo com 3/4.
- **Fase 6**: depois de 3–5. **Fase 7**: depois de `npm run test:e2e` verde.

### Parallel Opportunities

- T004/T005/T006/T011/T012 (arquivos diferentes); T013–T017.
- T021 (`<video>`) em paralelo com T018–T020.
- Fase 5 inteira em paralelo com a Fase 4 (zonas diferentes: `features/settings/` × `components/player/`).

---

## Parallel Example: Fase 2

```text
Task: "T004 [P] viewChoice.ts"
Task: "T005 [P] playerPreferences.ts"
Task: "T011 [P] playerViewPanels.ts"
Task: "T012 [P] PlayerChoicePanel.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Fase 1 (spike) → Fase 2 → Fase 3.
2. **Parar e validar**: aspecto num filme e num canal (navegador; na TV se já houver acesso).

### Incremental Delivery

1. US1 (aspecto) → US2 (qualidade) → US3 (aba) → Polish → TV (gate).

## Notes

- Nunca editar os arquivos travados (041, nem o 1º teste emendado da 027, nem o comentário da 029).
- Toda mensagem/rótulo exato está em `logic/aspecto-qualidade.md` e nos contratos.
- Commitar por fase, só quando o usuário pedir.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
