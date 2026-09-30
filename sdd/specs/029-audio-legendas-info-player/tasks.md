---
description: "Tasks da feature 029 — Player: trilhas de áudio, legendas e info do stream"
---

# Tasks: Player — Trilhas de Áudio, Legendas e Info do Stream

**Input**: Documentos de design de `sdd/specs/029-audio-legendas-info-player/`

**Prerequisites**: plan.md, spec.md, logic/faixas-e-legendas.md, quickstart.md, contract-tests.lock

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (US1, US2, US3)
- Incluir caminhos de arquivo exatos nas descrições

## Path Conventions

- Frontend único em `tv-web/` (React 19 + TS + Vite 8). Comandos rodam em `tv-web/`.
- Camada de player (sem UI): `tv-web/src/lib/player/`.
- Componentes compartilhados e o `PlayerLayer`: `tv-web/src/components/`.
- CSS do player: `tv-web/src/styles/player.css`; tokens: `tv-web/src/index.css`.
- E2E: `tv-web/e2e/*.mjs` (Playwright, contra `npm run dev`).
- Scripts SDD (PowerShell 5.1): `.planning/scripts/powershell/`, rodados da raiz do repo.
- Nada em `api/` nem em `CCPlayTv/`.

---

## Phase 1: Setup — Spike da API do AVPlay na TV

**Purpose**: confirmar na QN50Q60DAGXZD o que o AVPlay expõe de fato (R-001–R-004) antes de construir o adaptador. Decisão do usuário na spec: primeira fase do execute.

- [ ] T001 **ADIADA (decisão do usuário, 2026-09-28: sem TV nesta sessão; vira a passada física do T041)** Instalar e abrir o build atual na TV de referência pelo skill `tizen-tv`, com um VOD que tenha 2+ áudios e 1 legenda embutida (e, se houver, um canal com 2+ áudios)
- [ ] T002 **ADIADA (idem T001)** Executar os passos 1–8 de `sdd/specs/029-audio-legendas-info-player/quickstart.md` §Spike pelo Web Inspector remoto, **sem** logar URL nem credencial, sem deixar código de depuração no repositório
- [X] T003 Registrar o resultado de cada passo em `sdd/specs/029-audio-legendas-info-player/plan.md` → `Riscos e Decisões` (R-001…R-004, "Resolvido:"/"Confirmado:"/"Não testado") e, se o formato real divergir da referência, emendar `logic/faixas-e-legendas.md` §1.2 antes da Fase 2 (nunca o contrato)

**Critério de Conclusão**: R-001…R-004 têm resultado registrado (ou "não testado — sem acesso à TV", decisão explícita de seguir pela referência); `logic §1.2` reflete o formato real observado.

**Registro da Fase**:

- Status: fechada com T001/T002 **adiadas** por decisão explícita do usuário (2026-09-28) — spike NÃO executado.
- Feito: T003 — R-001…R-004 registrados como "não testado" em `plan.md`; `logic §1.2` mantido como está (referência oficial, sem formato real observado).
- Contrato: sem contrato nesta fase.
- Testes executados: nenhum (fase sem código).
- Pendências: o spike vira parte da passada física (T041/SC-006). Se o formato real divergir da referência, só `avplayAdapter.ts` e `logic §1.2` mudam, nunca o contrato.

---

## Phase 2: Foundational — contrato de motor, sessão, lógica pura e chrome

**Purpose**: tudo que as três stories usam. Nenhuma story começa antes.

**⚠️ CRITICAL**: sem esta fase os contratos não têm como ficar verdes.

- [X] T004 [P] Implementar `normalizeLanguage`, `trackLabel` e `pickTracksForChoice` em `tv-web/src/lib/player/tracks.ts` conforme `logic/faixas-e-legendas.md` §2 e §4 (tabela explícita, sem `Intl.DisplayNames`)
- [X] T005 Estender `PlayerServiceSession` em `tv-web/src/lib/player/PlayerService.ts` com `supportsTracks`, `supportsStreamInfo`, `getTracks`, `selectAudioTrack`, `selectTextTrack`, `getStreamInfo`, `subscribeSubtitles` (logic §1.4): `selectedTextId`, descarte de linha com legenda desativada, `null` emitido ao desativar, no-op após `close`, sem passar pelo `emit()` de estado
- [X] T006 [P] AVPlay em `tv-web/src/lib/player/avplayAdapter.ts`: tipos opcionais em `AvplayApi`/`AvplayListener`, `setSilentSubtitle(true)` no `open`, `getTracks`/`selectAudioTrack`/`selectTextTrack`/`getStreamInfo` e `onsubtitlechange` → `onSubtitle` (logic §1.2), tudo em `try`, nunca repassando erro bruto
- [X] T007 [P] `<video>` em `tv-web/src/lib/player/htmlVideoAdapter.ts`: só `getStreamInfo` (`videoWidth`/`videoHeight` > 0) (logic §1.3)
- [X] T008 [P] `chromeControls` em `tv-web/src/components/chromeControls.ts`: 5º parâmetro opcional `features`, disponibilidade `'unavailable'`, rótulos da tabela de logic §7.1, posições inalteradas
- [X] T009 [P] Remover `player-tracks` e `player-info` de `tv-web/src/lib/comingSoon.ts` (D-010)
- [X] T010 [P] Criar `tv-web/src/components/playerPanels.ts` (puro): linhas do painel de faixas com chave estável, disponibilidade e textos de toast (logic §3), movimento ↑/↓ sem volta, reconciliação de foco por chave, linhas de info com formatos pt-BR (logic §6)

### Testes da Fase

- [X] T011 [P] `tv-web/src/lib/player/tracks.test.ts`: normalização (`por`/`pt-BR`/`und`/desconhecido), rótulos (codec+canais, "Faixa N", duplicados), `pickTracksForChoice` (idioma com código diferente, ausente → padrão, AD ignorada)
- [X] T012 [P] `tv-web/src/lib/player/PlayerService.test.ts`: API nova da sessão (descarte de linha, `active` de texto, `null` ao desativar, no-op após `close`, `supports*` pela presença do método)
- [X] T013 [P] `tv-web/src/lib/player/avplayAdapter.test.ts`: mapeamento de `extra_info` (inclusive malformado), faixa ativa por `getCurrentStreamInfo`, exceção → `null`/`false`, `setSilentSubtitle(true)` no `open`, bps → kbps
- [X] T014 [P] `tv-web/src/lib/player/htmlVideoAdapter.test.ts`: `getStreamInfo` só com dimensões > 0; sem métodos de faixa
- [X] T015 [P] Ajustar `tv-web/src/components/chromeControls.test.ts` (mocks de tracks/info → `real`/`unavailable`) e `tv-web/src/lib/comingSoon.test.ts` (lista de ids)
- [X] T016 [P] `tv-web/src/components/playerPanels.test.ts`: ordem das linhas, "Nenhuma legenda…", sincronização ausente sem faixa de texto, negativos e "texto desativado" soft, formatos de info, linha ausente quando o campo falta

**Critério de Conclusão**: `npx vitest run src/lib/player src/components/chromeControls.test.ts src/components/playerPanels.test.ts src/lib/comingSoon.test.ts` verde; `npx tsc -b` e `npm run lint` limpos; os 5 contratos da 029 **ainda vermelhos** (é esperado — a UI vem nas fases seguintes); `check-contract-tests.ps1` íntegro para 029, 027 e 020.

**Checkpoint**: fundação pronta.

**Registro da Fase**:

- Status: concluída (2026-09-28).
- Feito: T004–T016. `tracks.ts` (normalização, rótulos, `trackLabels` novo para duplicados, escolha por idioma); API nova da sessão em `PlayerService.ts`; AVPlay (faixas, legenda silenciada no open, `onsubtitlechange`, info); `<video>` só com `getStreamInfo`; `chromeControls` com `features`/`'unavailable'`; `player-tracks`/`player-info` fora de `comingSoon.ts`; `playerPanels.ts` (modelo dos dois painéis + foco por chave).
- Contrato: sem contrato a fechar nesta fase; os 5 da 029 seguem vermelhos por asserção (esperado); trava íntegra para 029, 027 e 020.
- Testes executados: `npx tsc -b` limpo (exit 0); `npm run lint` sem warning novo (só os pré-existentes); `npx vitest run src/lib/player src/components/chromeControls.test.ts src/components/playerPanels.test.ts src/lib/comingSoon.test.ts` -> 15 arquivos, 160/160 verdes. Uma iteração para corrigir um teste meu (`objectContaining` com propriedade `undefined`).
- Pendências: os testes novos ficaram em arquivos próprios (`PlayerService.tracks.test.ts`, `avplayAdapter.tracks.test.ts`, `htmlVideoAdapter.streamInfo.test.ts`) em vez de dentro dos existentes citados em T012–T014 — mesmo escopo, só arquivo separado. Sem spike na TV: formato real do AVPlay ainda não observado (R-001–R-004).

---

## Phase 3: User Story 1 — Trocar áudio e ligar legenda embutida (Priority: P1) 🎯 MVP

**Objetivo**: "Áudio e legendas" abre o painel real em VOD e Live, troca áudio e liga/desliga a legenda que o app desenha sobre o vídeo.

**Independent Test**: conteúdo com ≥2 áudios e ≥1 legenda → trocar pelo painel, ver a legenda, confirmar que a posição não voltou.

### Contrato da Fase

- `filme: "Áudio e legendas" abre o painel com a faixa ativa marcada e focada; trocar o áudio não reinicia nada; RETURN volta ao botão` — US1/AC1-2-5, FR-001/003/006/010
- `filme: legenda começa desativada; escolher a faixa embutida exibe a linha do motor e "Desativadas" a apaga` — US1/AC3, FR-004/007, D-005
- `sem API de faixas o botão é soft disabled e só explica; no canal com uma faixa só o painel diz "Nenhuma legenda neste conteúdo"` — FR-002/004/001
- Comando: `npx vitest run src/components/PlayerLayer.audio-legendas-info.contract.test.tsx -t "filme: \"Áudio|legenda começa|sem API de faixas"` (ou o arquivo inteiro, esperando 3/5)

### Implementation

- [X] T017 [P] [US1] Criar `tv-web/src/components/PlayerTracksPanel.tsx` (apresentação): `role="dialog"` "Áudio e legendas", classes `.modal-overlay`/`.modal-panel no-scrollbar`, radiogroups "Áudio"/"Legendas" (e "Sincronização da legenda" desenhada a partir do modelo), `<button role="radio" aria-checked>`, `tv-focus` pela chave focada, `aria-disabled` nos soft, `scrollIntoView({block:'nearest'})` da linha focada (logic §3) → contrato: os três acima
- [X] T018 [P] [US1] Criar `tv-web/src/components/SubtitleOverlay.tsx` (logic §5): assinatura `subscribeSubtitles`, atraso 0 imediato, duração, cue vazia apaga, pausa segura a linha, tags removidas, texto puro, `aria-hidden`, `raised` → contrato: `legenda começa desativada…`
- [X] T019 [US1] Em `tv-web/src/components/PlayerLayer.tsx`: `panelRef` + roteamento com prioridade `topLayer` → painel → erro → chrome (logic §7); abrir a partir do botão `tracks` (checando `getTracks()` não-nulo e não-vazio, senão o toast de FR-002); SELECT nas linhas de áudio/legenda/AD (logic §3); RETURN fecha e devolve o foco ao botão de origem; releitura de 1 s (D-009); fecha sozinho em nova sessão, erro ou conclusão; `MediaStop` ainda fecha o player; chrome não desenhado com o painel aberto → contrato: os três acima
- [X] T020 [US1] Em `tv-web/src/components/PlayerLayer.tsx`: passar `features: { tracks: session.supportsTracks, info: session.supportsStreamInfo }` ao `chromeControls` em todos os pontos de chamada (`controlsFor`, `playPauseIndexOf`); SELECT em `'unavailable'` → toast do logic §3/§6 → contrato: `sem API de faixas…`
- [X] T021 [US1] Em `tv-web/src/components/PlayerLayer.tsx`: montar `<SubtitleOverlay>` com `delayMs` de `choiceRef`, `paused`, `raised = chromeVisible`; não montar com `topLayer`, tela de erro ou sem sessão (FR-008)
- [X] T022 [P] [US1] CSS em `tv-web/src/styles/player.css`: `.player-subtitle`/`--raised`, linhas e seções do painel (só tokens; `--subtitle-bg` em `tv-web/src/index.css` se não houver token equivalente)

### Testes da Fase

- [X] T023 [P] [US1] `tv-web/src/components/SubtitleOverlay.test.tsx`: atraso positivo (fake timers), duração, cue vazia, pausa, tags `<i>` removidas, `\n` → quebra
- [X] T024 [US1] Ajustar `tv-web/src/components/PlayerLayer.test.tsx` só onde FR-001 muda algo (contagem "8 botões" e rótulos "em breve" de Áudio/Info); adicionar: painel com topLayer aberto não intercepta, `MediaStop` com painel aberto fecha o player, painel fecha quando a sessão cai em erro, `findUnnamedControls` sem achados com o painel de faixas aberto
- [X] T025 [P] [US1] Teste no Live em `tv-web/src/components/PlayerLayer.test.tsx`: RETURN do painel volta à **linha** (não à faixa) com foco em "Áudio e legendas"; a legenda não é renderizada com `topLayer` aberto

**Critério de Conclusão**: `npx vitest run src/components/PlayerLayer.audio-legendas-info.contract.test.tsx` → os 3 contratos de US1 verdes (os de US2/US3 podem seguir vermelhos); `PlayerLayer.player-chrome.contract.test.tsx` 5/5 e `PlayerLayer.ciclo-vida-player.contract.test.tsx` 4/4 verdes; `check-contract-tests.ps1` íntegro para 029/027/020; `npx vitest run src/components src/lib/player` verde; `tsc`/lint limpos.

**Checkpoint**: US1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: concluída (2026-09-28).
- Feito: T017–T025. `PlayerTracksPanel.tsx`, `SubtitleOverlay.tsx` (atraso por cue, duração, pausa segura a linha, texto puro), CSS em `player.css` + token `--subtitle-bg`; `PlayerLayer.tsx` com painel interno (`panelRef`, roteamento `topLayer` → painel → erro → chrome), `features` no chrome, toast de FR-002 e de linhas soft disabled, releitura de 1 s, RETURN devolvendo o foco ao botão de origem, legenda fora do zapping/erro. Adiantamento honesto: `commitChoice`/`choiceRef` e as linhas de sincronização (T031, parte de T029) já entraram aqui porque o modelo do painel as exige; a reaplicação por idioma e o `initialTrackChoice` (T030/T032) seguem para a Fase 5.
- Contrato: `npx vitest run src/components/PlayerLayer.audio-legendas-info.contract.test.tsx` -> 3/5 verdes (testes 1, 2 e 3 = US1); os 2 restantes são das Fases 4 e 5. Trava íntegra para 029, 027 e 020.
- Testes executados: `npx tsc -b` limpo; `npx vitest run src/components` -> 247 verdes + só os 2 contratos futuros vermelhos; `npx vitest run src/features/live src/features/series src/features/movies src/features/home` -> 283 verdes e 4 falhas do padrão instável já documentado (`MoviesScreen.favorites`, `LiveScreen.favorites` x2, `LiveScreen.test` T010), confirmadas 103/103 verdes rodando isoladas com `--maxWorkers=1`. `npm run lint` sem warning novo nos arquivos tocados.
- Pendências: instabilidade sob paralelismo dos 4 testes acima segue como problema aberto conhecido (não regressão da 029; passam isolados). T024/T025 viraram um arquivo novo, `PlayerLayer.faixas.test.tsx` (8 testes), em vez de mexer em `PlayerLayer.test.tsx` — nenhuma contagem/rótulo existente mudou, então não havia o que ajustar lá.

---

## Phase 4: User Story 2 — Info técnica do stream (Priority: P2)

**Objetivo**: "Info do stream" abre o painel com os campos do motor + Conexão, relidos a cada 1 s.

**Independent Test**: abrir durante a reprodução, só campos informados, taxa atualizando, "Fechar" volta ao botão.

### Contrato da Fase

- `info: só os campos que o motor informou, relidos a cada ~1 s enquanto aberto, sem URL nem credencial; "Fechar" para a releitura e volta ao botão` — US2, FR-013–018, Constitution: Segredos
- Comando: `npx vitest run src/components/PlayerLayer.audio-legendas-info.contract.test.tsx -t "info:"`

### Implementation

- [X] T026 [P] [US2] Criar `tv-web/src/components/PlayerInfoPanel.tsx`: `role="dialog"` "Info do stream", linhas de `playerPanels` (logic §6), "Conexão" por `useOnlineStatus()` (`tv-web/src/lib/onlineStatus.ts`), texto de "não informou dados técnicos", botão único "Fechar" com `tv-focus` → contrato: `info: …`
- [X] T027 [US2] Em `tv-web/src/components/PlayerLayer.tsx`: abrir/fechar o painel de info pelo botão `info` (mesmo `panelRef`, logic §7); SELECT/RETURN em "Fechar" fecham e devolvem o foco; releitura de 1 s de `getStreamInfo()` + `getTracks()` (linha "Áudio"), pulada com página oculta, cancelada ao fechar (FR-016) → contrato: `info: …`

### Testes da Fase

- [X] T028 [P] [US2] Em `tv-web/src/components/PlayerLayer.test.tsx`: info com motor devolvendo `null` mostra só Conexão + "não informou…"; evento `offline` troca para "Offline" sem fechar; `findUnnamedControls` sem achados com o painel de info aberto

**Critério de Conclusão**: contrato `info: …` verde (junto dos 3 de US1); `check-contract-tests.ps1` íntegro para 029/027/020; suíte de `src/components` verde; `tsc`/lint limpos.

**Checkpoint**: US1 e US2 funcionando independentemente.

**Registro da Fase**:

- Status: concluída (2026-09-28).
- Feito: T026–T028. `PlayerInfoPanel.tsx` (linhas do motor + Conexão via `useOnlineStatus`, frase de 'não informou', único focável 'Fechar'); `PlayerLayer.tsx` com `PanelState` estendido (`kind: 'info'`), `panelInfoRef`, `readInfoSnapshot` (info + rótulo do áudio ativo), `activatePanelControl` cobrindo 'info' (toast quando indisponível), releitura de 1 s reaproveitando `refreshPanel`, SELECT/RETURN fecham e devolvem o foco.
- Contrato: `npx vitest run src/components/PlayerLayer.audio-legendas-info.contract.test.tsx` -> 4/5 verdes (teste 5 = US2 verde; só o 4, da Fase 5, segue vermelho por asserção). Trava íntegra 029/027/020.
- Testes executados: `npx tsc -b` limpo; `npx vitest run src/components/PlayerLayer.info.test.tsx src/components/PlayerLayer.faixas.test.tsx src/components/PlayerLayer.test.tsx` -> 3 arquivos, 71/71 verdes.
- Pendências: nenhuma nova. T028 virou um arquivo próprio, `PlayerLayer.info.test.tsx` (5 testes), em vez de dentro de `PlayerLayer.test.tsx`.

---

## Phase 5: User Story 3 — Sincronizar legenda e manter a escolha adiante (Priority: P3)

**Objetivo**: atraso da legenda (só para trás é real) e reaplicação por idioma no próximo item da sequência.

**Independent Test**: "+500 ms" desloca a linha; próximo episódio/canal com o mesmo idioma reaplica áudio/legenda/atraso; montagem nova não herda.

### Contrato da Fase

- `escolha de áudio atravessa a troca de item por idioma, não vaza para uma montagem nova e volta via initialTrackChoice` — FR-021/022/023, D-008
- Comando: `npx vitest run src/components/PlayerLayer.audio-legendas-info.contract.test.tsx` → **5/5**

### Implementation

- [X] T029 [US3] Em `tv-web/src/components/PlayerLayer.tsx`: desestruturar `initialTrackChoice`/`onTrackChoiceChange`; `choiceRef` semeado só na montagem; atualizar a escolha a cada SELECT bem-sucedido de áudio/legenda/atraso e chamar `onTrackChoiceChange` (logic §3/§4) → contrato: `escolha de áudio atravessa…`
- [X] T030 [US3] Em `tv-web/src/components/PlayerLayer.tsx`: reaplicação **síncrona** na primeira entrada em `'playing'` de cada sessão (dentro do `publish`, junto de `onEnteredPlaying`), via `pickTracksForChoice`, sem chamar `onTrackChoiceChange`, silenciosa na falha (logic §4) → contrato: `escolha de áudio atravessa…`
- [X] T031 [US3] Sincronização no painel: SELECT em `+500`/`+1000`/`Sem atraso` atualiza `choiceRef.subtitleDelayMs` e o `SubtitleOverlay`; negativos e "legenda desativada" dão os toasts de logic §3 (D-006, FR-019/FR-020)
- [X] T032 [US3] Em `tv-web/src/features/series/SeriesDetailScreen.tsx`: `trackChoiceRef` passado como `initialTrackChoice`/`onTrackChoiceChange`; zerado em `handlePlayerClose` e `cancelCountdown`; mantido no caminho `handlePlayerCompleted` → countdown → `playNext` (logic §4)

### Testes da Fase

- [X] T033 [P] [US3] Em `tv-web/src/components/PlayerLayer.test.tsx`: Live — trocar por ↓ (`onChannelStep` + novo `itemId`) reaplica o idioma de áudio e a legenda; atraso carregado para o próximo item; idioma inexistente no próximo cai no padrão sem toast
- [X] T034 [P] [US3] Em `tv-web/src/features/series/SeriesDetailScreen.test.tsx`: autoplay (conclusão → countdown → próximo) repassa a escolha; RETURN do player e "cancelar" do countdown a zeram

**Critério de Conclusão**: `npx vitest run src/components/PlayerLayer.audio-legendas-info.contract.test.tsx` → **5/5 verdes**; `check-contract-tests.ps1` íntegro para 029/027/020; `npm run test` verde (flakes conhecidos `*.favorites.test.tsx` confirmados isolados); `tsc`/lint limpos.

**Checkpoint**: todas as stories funcionando.

**Registro da Fase**:

- Status: concluída (2026-09-28).
- Feito: T029–T034. `choiceRef` semeado só na montagem por `initialTrackChoice` e `commitChoice` -> `onTrackChoiceChange` (já da Fase 3); `reapplyTrackChoice` síncrono no `publish()` da primeira entrada em `playing` (por idioma, silencioso na falha, sem `onTrackChoiceChange`); linhas de sincronização (T031, entregues na Fase 3) agora cobertas por testes; `SeriesDetailScreen` guarda `trackChoiceRef` (zera em RETURN, cancelar contagem e último episódio; mantém no autoplay). Emenda de `logic §4`: a reaplicação só chama `selectTextTrack` quando há idioma a ligar (a sessão já nasce desativada, D-005).
- Contrato: `npx vitest run src/components/PlayerLayer.audio-legendas-info.contract.test.tsx` -> **5/5 verdes**; `check-contract-tests.ps1` íntegro para 029, 027 e 020.
- Testes executados: `npx tsc -b` limpo; `npx vitest run src/components src/lib/player src/lib/comingSoon.test.ts src/features/series` -> 56 arquivos, 493/493 verdes; `npm run lint` sem warning novo. T033 em arquivo próprio `PlayerLayer.continuidade.test.tsx` (5 testes: idioma por código diferente + atraso mantido, idioma ausente sem aviso nem chamada ao motor, reaplicação não é 'escolha', rebuffering não reaplica, motor sem API); T034 dentro de `SeriesDetailScreen.test.tsx` (4 testes). Uma iteração para corrigir teste meu (`waitFor` sob relógio falso).
- Pendências: nenhuma nova.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: E2E, documentação, build Tizen e verificação manual.

- [X] T035 [P] Atualizar `tv-web/e2e/player-chrome.mjs` (linhas ~190/194): no navegador sem motor de faixas, "Áudio e legendas — indisponível" e "Info do stream" real (motor `<video>` informa resolução) — só o que FR-001/FR-013 mudam
- [X] T036 Criar `tv-web/e2e/audio-legendas-info.mjs` com `webapis.avplay` falso via `page.addInitScript` (faixas, `getCurrentStreamInfo`, `onsubtitlechange` disparável pelo script, `setSelectTrack` registrando chamadas), fixture M3U fictícia em `tv-web/e2e/fixtures/`, cobrindo os 5 cenários de `quickstart.md` §Cenário ponta a ponta; incluir em `"test:e2e"` de `tv-web/package.json`
- [X] T037 Rodar com `npm run dev` ativo: `node e2e/audio-legendas-info.mjs`, `node e2e/player-chrome.mjs`, `node e2e/paridade-limpeza.mjs` (R-007: diff restrito ao botão Áudio/Info é esperado, registrar) e `npm run test:e2e`
- [X] T038 `npm run build` e `npm run build:tizen` limpos (nenhum arquivo emitido novo; guarda `findUnlistedFiles` passa)
- [X] T039 Revisão de segredos: nenhum `console.log` do spike, nenhum erro bruto do AVPlay repassado, nenhuma URL no painel de info
- [X] T040 [P] Documentação: `CLAUDE.md` (parágrafo da feature 029 em Project status), `.planning/backlog.md` (item 55: 55a entregue, 55b pendente; Próximas entregas), `.planning/migracao-design-system-v14.md` §matriz (linha do player: áudio/legendas/info reais)
- [X] T041 **(parte automatizada feita; passada física NÃO feita — ver R-009)** Executar `sdd/specs/029-audio-legendas-info-player/quickstart.md` (checagens automatizadas + cenário E2E) e, se houver acesso à TV, a passada física recomendada (SC-006), registrando cada item em `plan.md` → `Estado Atual` ("não testado" nunca vira "aprovado")

### Checklist de Release

- [X] Fase 1 (spike) concluída ou explicitamente pulada com registro
- [X] Fase 2 (fundação) concluída
- [X] Fase 3 (US1) concluída
- [X] Fase 4 (US2) concluída
- [X] Fase 5 (US3) concluída
- [X] Testes de contrato 5/5 verdes na suíte completa e `check-contract-tests.ps1` íntegro para 029, 027 e 020 (e as demais travas do repositório)
- [X] `npm run test`, `npx tsc -b`, `npm run lint`, `npm run build:tizen` limpos
- [X] `npm run test:e2e` verde (inclui `audio-legendas-info.mjs`) com `npm run dev` recém-iniciado
- [X] Mocks `player-tracks`/`player-info` fora de `comingSoon.ts`; `findUnnamedControls` sem achados nos dois painéis
- [X] Documentação atualizada (T040)
- [X] Passada física (SC-006) feita ou registrada como pendente — recomendada, não gate (**registrada como PENDENTE**, R-009: nada foi visto na TV)

**Registro da Fase**:

- Status: concluída (2026-09-28), com a passada na TV física **pendente** por decisão do usuário (recomendada, não gate).
- Feito: T035–T041. `e2e/player-chrome.mjs` com os rótulos que FR-001/FR-013 mudam (no navegador: Áudio `— indisponível`, Info real); `e2e/audio-legendas-info.mjs` novo (`webapis.avplay` falso via `addInitScript`, fixture reaproveitada de `player-chrome.m3u`, 39 verificações, 5 cenários) e registrado em `test:e2e`; builds; revisão de segredos (nenhum `console.*` novo, o adaptador não repassa erro bruto, nada derivado da URL); `CLAUDE.md`, `backlog.md` e `migracao-design-system-v14.md`.
- Contrato: 5/5 verdes na suíte completa; `check-contract-tests.ps1` íntegro para as 13 travas do repositório.
- Testes executados: `npx tsc -b` limpo; `npm run lint` sem warning novo; `npm run test` -> 1433/1437 (4 falhas do padrão instável documentado: `LiveScreen.favorites`, `LiveScreen.test` T010, `MoviesScreen.favorites`, `SeriesScreen.favorites` — confirmadas 106/106 verdes isoladas com `--maxWorkers=1`); `npm run build` e `npm run build:tizen` limpos (guarda de arquivos não listados passou); `node e2e/audio-legendas-info.mjs` e `node e2e/player-chrome.mjs` verdes; `npm run test:e2e` completo, 12 roteiros, exit 0 (dev server recém-iniciado). Na 1ª rodada da suíte um assert do meu roteiro falhou por corrida de timing (verificação logo após a tecla); corrigido com `eventually` e a suíte foi repetida inteira.
- Pendências: (1) `e2e/paridade-limpeza.mjs` **não** foi re-executado: é a ferramenta antes/depois da 028 e o modo `depois` sobrescreveria a evidência arquivada dela; o diff esperado (botões Áudio/Info do chrome VOD em `18-player-vod`) fica registrado em R-007 como não verificado. (2) Passada na TV física e spike do AVPlay (T001/T002) — R-001…R-004 e SC-006. (3) O `pageerror` `AbortError: play() interrupted` visto uma vez no Cenário 4 de `player-chrome.mjs` é do `<video>` de desenvolvimento ao fechar (`htmlVideoAdapter`, não tocado além de `getStreamInfo`); não falha nenhuma verificação.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (spike)**: sem dependências de código; pode ser pulada só com registro explícito (sem TV).
- **Phase 2 (fundação)**: depende da Phase 1 (formato real do AVPlay) — BLOQUEIA todas as stories.
- **Phase 3 (US1)**: depende da Phase 2.
- **Phase 4 (US2)**: depende da Phase 2; usa o `panelRef` criado em T019 (fazer depois da Phase 3, mesmo arquivo).
- **Phase 5 (US3)**: depende da Phase 3 (painel e `SubtitleOverlay` existentes).
- **Phase 6 (Polish)**: depende de todas.

### Parallel Opportunities

- Phase 2: T004, T006, T007, T008, T009, T010 em arquivos diferentes; T005 depois de T004 (tipos já existem, mas `getTracks` usa as regras de `active`). Testes T011–T016 em paralelo.
- Phase 3: T017, T018, T022, T023 em paralelo; T019–T021 sequenciais (mesmo arquivo `PlayerLayer.tsx`).
- `PlayerLayer.tsx` é tocado por T019–T021, T027, T029–T031: nunca em paralelo entre si.

---

## Parallel Example: Phase 2

```text
Task: "T004 [P] tracks.ts — normalizeLanguage/trackLabel/pickTracksForChoice"
Task: "T006 [P] avplayAdapter.ts — faixas, legenda, info"
Task: "T007 [P] htmlVideoAdapter.ts — getStreamInfo"
Task: "T008 [P] chromeControls.ts — features + 'unavailable'"
Task: "T010 [P] playerPanels.ts — modelo dos painéis"
```

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Phase 1: spike (ou registro de que foi pulado)
2. Phase 2: fundação
3. Phase 3: US1 — trocar áudio e ligar legenda
4. **PARAR E VALIDAR**: 3 contratos de US1 verdes, teste manual no navegador com o E2E parcial

### Incremental Delivery

1. Fundação → US1 (MVP: remove `player-tracks`) → US2 (remove `player-info`) → US3 (sincronização + continuidade) → Polish.

## Notes

- `[P]` = arquivos diferentes, sem dependência
- Os contratos da 029 **e** o da 027 (emendado pelo plan, D-011) estão travados — nunca editar
- Commitar após cada task ou grupo lógico coerente

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
