---
description: "Tasks da feature 040 — Dividir PlayerLayer e LiveScreen por responsabilidade"
---

# Tasks: Dividir PlayerLayer e LiveScreen por responsabilidade

**Input**: Documentos de design de `sdd/specs/040-dividir-player-live/`

**Prerequisites**: plan.md, spec.md, logic/divisao.md, quickstart.md

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (US1, US2, US3)
- Caminhos relativos à raiz do repositório

## Path Conventions

- Todo o código em `tv-web/src/`; comandos `npm`/`npx` dentro de `tv-web/`.
- Módulos do player em `tv-web/src/components/player/` (pasta nova, D-006); `tv-web/src/components/PlayerLayer.tsx` fica.
- Módulos da Live em `tv-web/src/features/live/`; `tv-web/src/features/live/LiveScreen.tsx` fica.
- Scripts do SDD em `.planning/scripts/powershell/` (rodar da raiz).
- **Sem testes de contrato novos** (ver `plan.md` → Estratégia de Testes): a prova são os 8 contratos travados de outras features que montam os dois componentes — nenhum deles pode ser editado.

---

## Phase 1: Setup — pré-condição e linha de base (bloqueia tudo)

**Objetivo**: árvore limpa e números de "antes", para "nada mudou" ser verificável (D-004, D-008).

- [X] T001 Confirmar `git status` limpo na raiz; se houver o trabalho do item 63/036 sem commit, **parar e pedir ao usuário** para commitar (nunca commitar sozinho) — R-005
- [X] T002 Gravar `sdd/specs/040-dividir-player-live/baseline.md`: totais e lista de arquivos com falha de `npx vitest run`; ✓/✗ e roteiros de `npm run test:e2e` (com `npm run dev` recém-iniciado); quantidade de avisos de `npx oxlint`; lista de arquivos de `tv-web/dist/assets` depois de `npm run build:tizen`; contagem de linhas de `PlayerLayer.tsx` e `LiveScreen.tsx`
- [X] T003 Rodar as 8 travas listadas em `plan.md` (comando de integridade) e registrar o resultado no `baseline.md`

**Critério de Conclusão**: árvore limpa; `baseline.md` com os cinco números; travas íntegras.

**Registro da Fase**:

- Status: concluída (2026-10-01)
- Feito: T001 — árvore limpa depois dos commits `c83ff0e` (036 + item 63) e `f54bb8d` (docs da 040), feitos a pedido do usuário. T002 — `baseline.md` gravado (suíte, lint, build, E2E **por roteiro**, tamanhos). T003 — as 8 travas íntegras. Adiantado (sem ligar): `components/player/playerLayerTypes.ts`, `playerMessages.ts`, `usePlayerChrome.ts`, `usePlayerPanels.ts`, `usePlayerSession.ts`, `usePlayerKeyboard.ts` — compilam (`tsc` limpo) mas nada os importa ainda; o novo `PlayerLayer.tsx` está pronto fora do repositório e só entra na Fase 2.
- Contrato: sem contrato nesta fase (feature sem contrato novo); as 8 travas que montam os dois componentes íntegras.
- Testes executados: `npx vitest run` → 2028/2034 (5 = contratos da 034, esperados; 1 instável, abaixo); `npx oxlint` → 0 erros, 13 avisos; `npm run build:tizen` ok, pacote idêntico ao versionado; E2E por roteiro → 21/21 exit 0, 624 ✓, 0 ✗. O `npm run test:e2e` encadeado parou uma vez por `ERR_CONNECTION_REFUSED` passageiro do dev server — daí a linha de base por roteiro (resolve a pendência A2 do Analyze).
- Pendências: `SettingsScreen.privacidade.test.tsx` (feature 036) falha sob a suíte inteira por tempo (`waitFor` de 1 s vs. leitura do IndexedDB) e passa isolado 3/3 — fora do escopo da 040, levado ao usuário.

---

## Phase 2: User Story 1 — camada de reprodução dividida (Priority: P1) 🎯 MVP

**Objetivo**: `PlayerLayer.tsx` só compõe; sessão, chrome, painéis e teclado em `components/player/` (FR-003), sem mudar comportamento.

**Independent Test**: `npx vitest run src/components` igual à linha de base e as 4 travas do player verdes sem edição; E2E `player-chrome`, `audio-legendas-info`, `ciclo-vida-player`, `epg-guia-completo` verdes.

### Implementation

Ordem pensada para a suíte do player ficar verde a cada passo (rode `npx vitest run src/components/PlayerLayer` depois de cada task):

- [X] T004 [US1] Extrair tipos e constantes para `tv-web/src/components/player/playerLayerTypes.ts` e `playerMessages.ts`; `PlayerLayer.tsx` reexporta `PlayerLayerProps`, `PlayerLayerTopLayer`, `PlayerIdentity`, `PlayerEpisodeStep` (FR-001, `logic/divisao.md` §1.8)
- [X] T005 [US1] Extrair o chrome para `tv-web/src/components/player/usePlayerChrome.ts` (refs de nível/mídia/foco/barra, `hideTimerRef`, `scheduleHide`, `revealFull`, `revealBand`, `controlsFor`, `playPauseIndexOf`) recebendo `sessionRef`/`panelRef` como objetos ref (§1.1); manter o comentário dos refs do chrome
- [X] T006 [US1] Extrair os painéis para `tv-web/src/components/player/usePlayerPanels.ts` (faixas, info, escolha, reaplicação) e o intervalo de 1 s como `usePanelRefresh`, chamado na posição atual do efeito (§1.2)
- [X] T007 [US1] Extrair a sessão para `tv-web/src/components/player/usePlayerSession.ts`: `phase`/`attempt`/`hardwarePlane`, o efeito grande (`start`/`publish`/`teardown`/visibilidade/gravador) e, como hooks separados na mesma ordem, plano de hardware, reagendar ao mudar de estado e proteção de tela; `prefetchGate.acquirePlayback` continua o 1º efeito (§1.2)
- [X] T008 [US1] Extrair o teclado para `tv-web/src/components/player/usePlayerKeyboard.ts` — **um** `useRemoteNav(..., { modal: true })` com os mesmos handlers (§1.3)
- [X] T009 [US1] Deixar `tv-web/src/components/PlayerLayer.tsx` só com refs de topo, chamadas dos hooks na ordem dos efeitos de hoje e o JSX; ajustar só import/`vi.mock` de testes não travados se algo interno que eles usam mudou de arquivo (FR-007)

### Testes da Fase

- [X] T010 [US1] Rodar `npx vitest run src/components src/features/movies src/features/series src/features/home` e comparar com `baseline.md`; rodar as travas 020/026/027/029/031 (integridade + verde); rodar `node e2e/player-chrome.mjs`, `node e2e/audio-legendas-info.mjs`, `node e2e/ciclo-vida-player.mjs`, `node e2e/epg-guia-completo.mjs`

**Critério de Conclusão**: as 4 travas do player e a da 026 íntegras e verdes **sem edição**; suíte das áreas acima igual à linha de base; `tsc`/lint limpos; os 4 roteiros E2E verdes; `PlayerLayer.tsx` sem lógica de sessão/chrome/painéis/teclado (§2 da lógica, conferido item a item); nenhuma asserção de teste mudou (comando SC-002 do `plan.md` com saída vazia).

**Checkpoint**: player dividido (MVP) — 55b, 61 e 19 já podem trabalhar em módulos diferentes.

**Registro da Fase**:

- Status: concluída (2026-10-01)
- Feito: `PlayerLayer.tsx` 1151 → 205 linhas, só composição + JSX (reexporta `PlayerLayerProps`, `PlayerLayerTopLayer`, `PlayerIdentity`, `PlayerEpisodeStep`). Módulos em `components/player/`: `playerLayerTypes.ts`, `playerMessages.ts`, `usePlayerChrome.ts`, `usePlayerPanels.ts` (+ `usePanelRefresh`), `usePlayerSession.ts` (+ `useVideoPlane`, `useRescheduleOnState`, `useScreenSaverWhilePlaying`), `usePlayerKeyboard.ts`. Ordem dos efeitos: toast → pré-carga → sessão → plano de hardware → reagendar → proteção de tela → releitura do painel → teclado. Um `useRemoteNav`, nenhum `createContext`, nenhum efeito no próprio `PlayerLayer.tsx`. Nenhum teste editado.
- Contrato: sem contrato nesta fase; travas 020/026/027/029/031 íntegras e verdes **sem edição**.
- Testes executados: `npx vitest run src/components` → 294/294 na 1ª tentativa; `npx vitest run src/features/movies src/features/series src/features/home src/features/live` → 402/402; `npx tsc -b --noEmit` limpo; comando SC-002 com saída vazia; E2E isolados: `audio-legendas-info` 40 ✓, `ciclo-vida-player` 8 ✓, `epg-guia-completo` 55 ✓ (iguais à linha de base) e `player-chrome` 36 ✓ (fora do `test:e2e`, todo verde). `npx oxlint`: 0 erros, mas avisos 13 → 45 — ver R-006.
- Pendências: R-006 (avisos `react(refs)` que o lint passou a enxergar) — levar ao usuário no fim.

---

## Phase 3: User Story 2 — TV ao vivo dividida (Priority: P2)

**Objetivo**: `LiveScreen.tsx` só compõe; trilha/lista, busca, zapping, guia, teclado e desenho em módulos próprios (FR-004).

**Independent Test**: `npx vitest run src/features/live` igual à linha de base; travas 018/024/030/031 verdes sem edição; E2E da Live verdes.

### Implementation

- [X] T011 [US2] Extrair tipos/regras puras da trilha e constantes para `tv-web/src/features/live/liveTrail.ts`; `LiveScreen.tsx` reexporta `LiveScreenProps`/`LiveShellProps` (FR-002)
- [X] T012 [US2] Extrair a busca para `tv-web/src/features/live/useLiveSearch.ts` (estado, ref do campo, efeitos de foco do campo, `resetSearchState`)
- [X] T013 [US2] Extrair trilha e lista (dados) para `tv-web/src/features/live/useLiveCatalog.ts` (categorias, `topPhase`, trilha, `entered`, conteúdo ★/Todos/categoria, `items`, reconciliação do foco do canal, leituras de EPG) — efeitos na ordem de hoje (§1.2)
- [X] T014 [US2] Extrair o zapping para `tv-web/src/features/live/useLiveZapping.ts` (`playing`, `zapOpen`, `lastGoodChannelRef`, `zapSequenceRef`, `zapKeyRef`, `playActiveChannel`, `stepChannel`, `openZapping`, handlers do `PlayerLayer`)
- [X] T015 [US2] Extrair o guia para `tv-web/src/features/live/useLiveGuide.ts` (`guide`, `guideRef`, `guideWatchPendingRef`, abrir pela preview/pelo player, assistir pelo guia)
- [X] T016 [US2] Extrair o desenho para `tv-web/src/features/live/liveColumns.tsx` como **funções** (`renderLiveColumns`, `renderLiveShell`) chamadas no mesmo lugar — nunca `<Componente/>` (§1.4, R-003)
- [X] T017 [US2] Extrair o teclado para `tv-web/src/features/live/useLiveKeyboard.ts` (`handleTrailDirection`, `handleTrailSelect`, **um** `useRemoteNav`) e deixar `LiveScreen.tsx` só com estado de navegação de topo, chamadas dos hooks na ordem e o JSX de topo; ajustar só import/`vi.mock` de testes não travados, se preciso (FR-007)

### Testes da Fase

- [X] T018 [US2] Rodar `npx vitest run src/features/live src/features/home` e comparar com `baseline.md` (falha nova em `LiveScreen*.favorites`/`LiveScreen.test` → rodar isolada 3× antes de concluir, R-002); travas 018/024/030/031; `node e2e/live-tv-ds-v14.mjs`, `node e2e/zapping-live-tv.mjs`, `node e2e/epg-guia-completo.mjs`, `node e2e/busca-por-categoria.mjs`, `node e2e/favoritos.mjs`, `node e2e/epg-dados-agora.mjs`

**Critério de Conclusão**: as 4 travas da Live íntegras e verdes **sem edição**; suíte da área igual à linha de base; `tsc`/lint limpos; os 6 roteiros E2E verdes; `LiveScreen.tsx` sem lógica de zapping/guia/busca/trilha (§3 da lógica, item a item); comando SC-002 com saída vazia.

**Checkpoint**: Live dividida — 62a pode começar sem tocar no player.

**Registro da Fase**:

- Status: concluída (2026-10-01)
- Feito: `LiveScreen.tsx` 1491 → 350 linhas (composição + JSX de topo; reexporta `LiveScreenProps`/`LiveShellProps`). Módulos: `liveTrail.ts` (tipos/regras/constantes), `useLiveSearch.ts`, `useLiveCatalog.ts` (`useLiveTrail` + `useLiveChannels`), `useLiveZapping.ts` (`useLiveZappingState` + `useLiveZapping`), `useLiveGuide.ts` (`useLiveGuideState` + `useLiveGuide`), `useLiveKeyboard.ts` (entrar na trilha, setas/OK/RETURN, **um** `useRemoteNav`), `liveColumns.tsx` (`renderLiveColumns`/`renderLiveShell` como **funções**). Ordem dos efeitos: toast → favoritar → trilha (rolagem do item focado) → foco do campo de busca → pré-busca/dica/categoria inicial/foco do canal/EPG → entrar tocando → lista virtualizada → teclado. Granularidade ajustada (R-007): estado do zapping e do guia em hooks próprios chamados no topo. Nenhum teste editado.
- Contrato: sem contrato nesta fase; travas 018/024/030/031 íntegras e verdes **sem edição**.
- Testes executados: `npx vitest run src/features/live` → 177/177 na 1ª tentativa; `npx vitest run src/features/home src/App` → 37/37; `npx tsc -b --noEmit` limpo; SC-002 vazio; `npx oxlint` 0 erros, avisos da Live continuam 2 (só mudaram de arquivo); E2E isolados iguais à linha de base: `live-tv-ds-v14` 29, `zapping-live-tv` 11, `epg-guia-completo` 55, `busca-por-categoria` 18, `favoritos` 15, `epg-dados-agora` 44.
- Pendências: bug pequeno achado na leitura (vai à Fase 4): o `<Toast>` da vista principal da Live não recebe `messageKey`.

---

## Phase 4: User Story 3 — bugs pequenos revelados pela divisão (Priority: P3)

**Objetivo**: cada bug pequeno anotado nas Fases 2–3 corrigido por um sub-agente, com teste de regressão (FR-009, D-007, `logic/divisao.md` §4). **Fase vazia se nada aparecer** — registrar "nenhum bug achado".

- [X] T019 [US3] Revisar a lista de achados das Fases 2–3: classificar cada um como pequeno (local, sem decisão de produto) ou não; os "não" vão para `.planning/backlog.md` como `[Bug]` com origem 040
- [X] T020 [US3] Para cada bug pequeno, **um sub-agente** (tool `Agent`), lançado só depois de a fase do módulo afetado fechar, com: módulo/arquivo, sintoma, reprodução e a regra "teste de regressão vermelho primeiro, correção mínima depois, saída dos dois"; uma task ad-hoc `T02x` por bug
- [X] T021 [US3] Revisar cada diff devolvido, rodar a suíte da área e a inteira, registrar `R-00X` no `plan.md`, e pedir commit separado da movimentação

**Critério de Conclusão**: cada bug corrigido tem exatamente um teste novo que falhava antes (saída registrada) e um `R-00X`; nenhuma asserção existente mudou; ou "nenhum bug achado" registrado.

**Registro da Fase**:

- Status: concluída (2026-10-01)
- Feito: 1 achado, classificado pequeno (T019): o `<Toast>` da vista principal da Live sem `messageKey` (os ramos carregando/erro/vazio passavam) — com a região de anúncio montada, dois avisos iguais seguidos reusavam o mesmo nó e o leitor de tela não anunciava a repetição. Corrigido por **um sub-agente** (T020, decisão do usuário), depois de a Fase 3 fechar: teste novo `tv-web/src/features/live/LiveScreen.toast-repetido.test.tsx` (monta a Live dentro de `AnnouncerRegion`; OK duas vezes num canal sem fonte → o nó do toast tem de ser outro) e a correção de uma linha `<Toast message={toastMessage} messageKey={toastKey} />`. Registrado como R-008.
- Contrato: sem contrato nesta fase; nenhum `.contract.test.` tocado.
- Testes executados: conferido pelo principal, não só pelo relato do sub-agente — o teste passa com a correção e, com a `LiveScreen.tsx` em `git stash` (código de antes da 040, também sem `messageKey`), **falha** em `expected <div class="toast"> not to be <div class="toast">` (o bug era anterior à divisão); `npx vitest run src/features/live` → 178/178 (relatado pelo sub-agente; a suíte inteira roda no Polish); `tsc` limpo.
- Pendências: o commit separado da correção (T021) depende de o usuário pedir — a linha está no mesmo arquivo da divisão, ainda sem commit.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T022 Suíte inteira `npx vitest run`, `npx tsc -b --noEmit`, `npx oxlint`, `npm run build:tizen` — comparar com `baseline.md` (mesmas falhas conhecidas e avisos, nenhum arquivo emitido novo)
- [X] T023 `npm run test:e2e` inteiro com `npm run dev` recém-iniciado — mesma contagem de ✓ de `baseline.md` (SC-004)
- [X] T024 Todas as travas do repositório íntegras (`check-contract-tests.ps1` para cada feature com `contract-tests.lock`) e o comando SC-002 do `plan.md` com saída vazia
- [X] T025 Conferência estrutural do `quickstart.md` (um `useRemoteNav` por componente, nenhum `createContext` novo, render como função) e o cenário ponta a ponta no navegador
- [X] T026 Documentação: `CLAUDE.md` (o parágrafo do `PlayerLayer` em "four top-level directories" passa a dizer onde vivem sessão/chrome/painéis/teclado; a Live idem), item 49a do backlog (49a-1 entregue) e o par "49a-1 ∥ 63" da seção de paralelismo

### Checklist de Release

- [X] Fase 1 (linha de base) concluída
- [X] Fase 2 (US1 player) concluída
- [X] Fase 3 (US2 Live) concluída
- [X] Fase 4 (US3 bugs) concluída ou registrada como vazia
- [X] As 8 travas que montam os dois componentes (e todas as demais) íntegras e verdes sem edição
- [X] Suíte, lint, `build:tizen` e `test:e2e` iguais à linha de base — os avisos do lint foram de 13 para 45 (R-006), nova contagem aceita pelo usuário
- [X] `quickstart.md` executado
- [ ] Passada na TV física: **recomendada, não gate** (R-001)

---

## Dependencies & Execution Order

- **Fase 1** bloqueia tudo (sem linha de base não há prova).
- **Fase 2 (US1)** e **Fase 3 (US2)** são independentes entre si (arquivos diferentes) — ordem recomendada: player primeiro (prioridade do usuário). Não rodar as duas ao mesmo tempo na mesma árvore: as suítes se cruzam (`LiveScreen` monta `PlayerLayer`).
- **Fase 4** depois da fase do módulo afetado (§4 da lógica).
- **Fase 5** depois de todas.

### Parallel Opportunities

- Dentro de cada fase, as extrações são **sequenciais** (cada uma muda o mesmo arquivo de origem): sem `[P]`.

## Implementation Strategy

MVP = Fases 1 + 2 (player dividido): já destrava 55b/61/19. Depois a Live (destrava 62a). Bugs só se aparecerem.

## Notes

- Commitar ao fim de cada task de extração verde (pedir ao usuário) — reverter uma extração fica barato.
- Nunca editar um contrato travado; nunca mudar asserção de teste existente.

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
