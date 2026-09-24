---
description: "Template de lista de tasks para implementação de feature"
---

# Tasks: Assistir Filme, com Retomada

**Input**: Documentos de design de `sdd/specs/011-assistir-filme-retomada/`

**Prerequisites**: plan.md (obrigatório), spec.md (obrigatório para user stories), research.md, contracts/player-capabilities.md, logic/reproducao-vod.md

**Organization**: Tasks agrupadas por user story pra permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (ex: US1, US2)
- Incluir caminhos de arquivo exatos nas descrições

## Path Conventions

- Frontend (único alvo desta feature): `tv-web/`
- Camada de reprodução: `tv-web/src/lib/player/`
- Componentes compartilhados entre telas: `tv-web/src/components/`
- Telas: `tv-web/src/features/<área>/`
- Estilos de tela: `tv-web/src/features/screens.css` (tokens em `tv-web/src/index.css`)
- `api/` **não é tocada** (contorno congelado, ADR-008)

**Comandos de validação** (de `tv-web/`): `npx tsc -b`, `npm run lint`, `npx vitest run`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Os tipos e as funções puras que todo o resto consome. Nada aqui depende de DOM ou de motor.

### Testes da Fase

- [X] T001 [P] Teste de `resumePolicy` em `tv-web/src/lib/player/resumePolicy.test.ts` — cobrir `isResumable` (abaixo/igual/acima de 30 s, `undefined`), `isPastEnd` (duração ausente → `false`, duração 0 → `false`, 94 %/95 %/96 %) e `shouldWriteProgress` (avanço e **retrocesso**, via `Math.abs`)
- [X] T002 [P] Teste de capacidades em `tv-web/src/lib/player/capabilities.test.ts` — a tabela de `contracts/player-capabilities.md` §1 vira tabela de teste, incluindo `series`/`unclassified` devolvendo tudo `false` (e **não** lançando), mais `resolveCapabilities` provando a interseção (motor sabe buscar + mídia ao vivo = `canSeek: false`)

### Implementation

- [X] T003 [P] Criar `tv-web/src/lib/player/resumePolicy.ts` com `RESUME_MIN_SECONDS = 30`, `RESUME_MAX_RATIO = 0.95`, `PROGRESS_WRITE_INTERVAL_SECONDS = 5` e as três funções puras — assinaturas exatas em `logic/reproducao-vod.md` §1
- [X] T004 [P] Criar `tv-web/src/lib/player/capabilities.ts` com `PlayerCapabilities`, `EngineCapabilities`, `PlayerProgress`, `mediaCapabilities(kind)` e `resolveCapabilities(engine, kind)` — tipos e tabela em `contracts/player-capabilities.md` §1

**Critério de Conclusão**: `npx vitest run src/lib/player/resumePolicy.test.ts src/lib/player/capabilities.test.ts` passa; `npx tsc -b` limpo. Nenhum arquivo existente foi alterado ainda.

**Registro da Fase**:

- Status: Concluída
- Feito: `resumePolicy.ts` (3 constantes + 3 funções puras) e `capabilities.ts` (`PlayerCapabilities`, `EngineCapabilities`, `PlayerProgress`, `mediaCapabilities`, `resolveCapabilities`), com testes correspondentes. Nenhum arquivo existente tocado.
- Testes executados: `npx vitest run src/lib/player/resumePolicy.test.ts src/lib/player/capabilities.test.ts` → 23 passed (2 arquivos); `npx tsc -b` limpo.
- Pendências: nenhuma.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Estender `PlayerService` e os dois adaptadores. Depois desta fase o contrato existe e a Live TV continua idêntica — mas nenhuma tela nova consome nada ainda.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

### Testes da Fase

- [X] T005 [P] Estender `tv-web/src/lib/player/PlayerService.test.ts` — transições novas (`playing → paused`, `paused → playing`, `buffering → paused`, `playing → completed`) **e as proibidas** (`completed → playing`, `completed → buffering`, `error → playing`), garantindo que R-008 não afrouxou a proteção contra callback atrasado
- [X] T006 [P] Teste de tradução de fim de mídia em `tv-web/src/lib/player/PlayerService.test.ts` — com adaptador falso: `onCompleted` em mídia `movie` → estado `completed`; em `channel` → estado `error` preservando a mensagem atual (D-008, R-006). **Os dois sentidos, explicitamente**
- [X] T007 [P] Teste da porta single-flight de saltos em `tv-web/src/lib/player/PlayerService.test.ts` — três `jumpBy(+10_000)` com o primeiro em voo produzem **um** salto de `+30_000` no adaptador, não três de `+10_000`; o callback de **falha** também libera a porta (D-009, R-002). Incluir o **grampeamento aos limites reais**: `seekTo(-5_000)` vira `0`; `jumpBy` que ultrapassaria a duração para no último instante válido e **não** conclui a mídia por atalho; com duração desconhecida, só o limite inferior é aplicado (spec, Edge Cases; contrato §5)
- [X] T008 [P] Teste de `tv-web/src/lib/player/avplayAdapter.test.ts` (novo) — com `window.webapis.avplay` falso: `pause`/`seekTo`/`jumpBy` delegam corretamente; `oncurrentplaytime` vira `onProgress`; `onstreamcompleted` vira `onCompleted` (e **não** mais `onError`); erro de `seekTo` não repassa o objeto cru do motor (contrato §6)
- [X] T009 [P] Teste de `tv-web/src/lib/player/htmlVideoAdapter.test.ts` (novo) — mockar `HTMLMediaElement.play/pause` (jsdom não os implementa, ver "Cuidados para Retomada"); `timeupdate` vira `onProgress` com `positionMs`/`durationMs`; `ended` vira `onCompleted`

### Implementation

- [X] T010 Estender `tv-web/src/lib/player/PlayerService.ts`: `PlayerState` ganha `paused` e `completed`; `ALLOWED_NEXT` atualizado conforme a tabela de `contracts/player-capabilities.md` §3
- [X] T011 Estender `PlayerAdapter` e `PlayerAdapterCallbacks` em `tv-web/src/lib/player/PlayerService.ts` — `capabilities` obrigatória; `pause?`/`resume?`/`seekTo?`/`jumpBy?` opcionais; `onProgress?`/`onCompleted?` novos (contrato §2). **Refinamento de execução** (R-011): `seekTo?`/`jumpBy?` exigem um segundo parâmetro `onSettled: () => void`, não previsto na redação original do contrato — sem ele a porta single-flight não tem como saber quando a chamada assíncrona do motor voltou. Documentado em `contracts/player-capabilities.md` §2
- [X] T012 Estender `PlayerServiceSession` em `tv-web/src/lib/player/PlayerService.ts` — `capabilities` resolvida no construtor, `progress`, `togglePause()`, `seekTo()`, `jumpBy()`, tradução de `onCompleted` por capacidade (D-008), e a porta single-flight de `logic/reproducao-vod.md` §3. **Nunca** chamar método cuja capacidade seja `false` (invariante do contrato §2). Grampear o destino aos limites reais **antes** de chamar o adaptador (`0 ≤ destino < duração`): a referência Samsung exige destino positivo e menor que a duração, e ultrapassar o fim não pode virar atalho para concluir a mídia
- [X] T013 `createPlayerSession` em `tv-web/src/lib/player/PlayerService.ts` passa a exigir `kind` (sem valor padrão, D-004) e a aceitar `startAtMs`; aplicar `seekTo` **antes** de `play()` no sucesso de `prepareAsync` (`logic/reproducao-vod.md` §5). **Refinamento de execução** (R-011): `startAtMs` viaja como terceiro parâmetro de `PlayerAdapter.open()`, não por uma chamada separada — é dentro do `prepareAsync` de cada adaptador que "antes do play()" existe como instante concreto. A sessão decide *se* repassa (checando `canSeek` já resolvido); o adaptador decide só *como* aplicar. Documentado em `contracts/player-capabilities.md` §4.1
- [X] T014 Estender `tv-web/src/lib/player/avplayAdapter.ts` — declarar `capabilities` do motor; implementar `pause`/`resume`/`seekTo`/`jumpBy`; ligar `oncurrentplaytime` a `onProgress` (com `getDuration()`) e `onstreamcompleted` a `onCompleted`. **Remover** a tradução de fim de stream para erro, que passa a ser responsabilidade da sessão
- [X] T015 Estender `tv-web/src/lib/player/htmlVideoAdapter.ts` — mesma superfície via `HTMLMediaElement` (`pause()`, `play()`, `currentTime`, `duration`, eventos `timeupdate`/`ended`)
- [X] T016 Atualizar a chamada existente em `tv-web/src/features/live/PlayerOverlay.tsx` para passar `kind` (de `fetchPlayback`), mantendo o comportamento atual byte a byte — é a ponte que impede a Live TV de quebrar entre esta fase e a Fase 5

**Critério de Conclusão**: o contrato existe e está testado nos dois adaptadores; `npx vitest run` inteiro passa, **incluindo os testes existentes de `PlayerOverlay.test.tsx` sem alteração de comportamento**; `npx tsc -b` e `npm run lint` limpos. A Live TV funciona no navegador exatamente como antes (Cenário E do `quickstart.md`).

**Checkpoint**: Fundação pronta — user stories podem começar.

**Registro da Fase**:

- Status: Concluída
- Feito: `PlayerState` ganhou `paused`/`completed` com `ALLOWED_NEXT` atualizado; `PlayerAdapter`/`PlayerAdapterCallbacks` estendidos com capacidades, pausa, busca (com porta single-flight e grampeamento aos limites reais) e progresso; `PlayerServiceSession` resolve capacidades no construtor e traduz `onCompleted` por capacidade da mídia (D-008); `avplayAdapter.ts` e `htmlVideoAdapter.ts` implementam a superfície completa; `PlayerOverlay.tsx` (Live TV) passa `kind` sem mudar comportamento. Três refinamentos de execução documentados retroativamente no contrato: `onSettled` em `seekTo`/`jumpBy` (R-011), `startAtMs` como terceiro parâmetro de `open()` (R-011), e `PlayableKind` local em vez de importar `CatalogItemKind` do catálogo (R-012, preserva a fronteira `catalog → player` do backlog item 49).
- Testes executados: `npx vitest run` → 328 passed (35 arquivos), incluindo `PlayerOverlay.test.tsx` inalterado em comportamento; `npx tsc -b` limpo; `npm run lint` limpo (3 warnings pré-existentes em arquivos não tocados por esta feature).
- Pendências: nenhuma. Cenário E do `quickstart.md` (verificação manual no navegador) fica formalmente para T052 (Polish), como o restante dos cenários A–E.

---

## Phase 3: User Story 1 - Assistir um filme do começo (Priority: P1) 🎯 MVP

**Objetivo**: Um filme do catálogo abre em tela cheia, com play/pause, saltos de 10 s e barra de progresso, e RETURN devolve ao detalhe.

**Independent Test**: Filmes → categoria → filme → "Assistir": o vídeo toca, os controles funcionam e somem, RETURN volta com o foco restaurado. Vale sozinho, sem nenhuma retomada.

### Testes da Fase

- [X] T017 [P] [US1] Teste de `tv-web/src/components/PlayerControls.test.tsx` (novo) — controle cuja capacidade é `false` **não é renderizado** (D-003); com `canSeek: false` e `canPause: false` a barra inteira não existe; sem `durationMs` mostra só tempo decorrido, **sem barra e sem percentual** (FR-004)
- [X] T018 [US1] Teste de interação e de mensagens em `tv-web/src/components/PlayerLayer.test.tsx`. **(a) Interação** — a tabela de `logic/reproducao-vod.md` §4: com controles **ocultos**, esquerda/direita **saltam e revelam**; com controles **visíveis**, movem o foco sem saltar; SELECT/cima/baixo revelam; ocultar após 5 s (timers falsos); **não** ocultar enquanto pausado; RETURN encerra de todo estado. **(b) FR-011, no caminho de filme** — item sem fonte montável (409 de `fetchPlayback`) mostra indisponibilidade **sem** "Tentar de novo"; falha do motor mostra erro **com** "Tentar de novo"; nenhuma das duas contém URL, endereço, usuário ou senha. O caminho já existe no `PlayerOverlay` herdado e T020 generaliza o texto — é este teste que impede a generalização de apagar a distinção
- [X] T019 [P] [US1] Teste de `tv-web/src/features/movies/MovieDetailScreen.test.tsx` (novo) — ação primária "Assistir" focada por padrão; SELECT abre a camada; SELECT repetido **não** abre segunda sessão (FR-010); o botão do estado de erro é ativável por OK (R-005)

### Implementation

- [X] T020 [US1] Mover `tv-web/src/features/live/PlayerOverlay.tsx` → `tv-web/src/components/PlayerLayer.tsx` e `PlayerOverlay.test.tsx` → `tv-web/src/components/PlayerLayer.test.tsx`, via `git mv` (preserva histórico). Generalizar o texto específico de canal: `channelName` → `title`, "Não foi possível reproduzir este canal." → mensagem recebida por prop (D-007)
- [X] T021 [US1] Atualizar `tv-web/src/features/live/LiveScreen.tsx` para importar `PlayerLayer` de `../../components/PlayerLayer`, passando o texto de canal que hoje está embutido — **sem** mudança de comportamento (FR-022)
- [X] T022 [US1] Criar `tv-web/src/components/PlayerControls.tsx` — barra, tempo decorrido/total e as ações `[⏪ 10s] [▶/⏸] [⏩ 10s]` na ordem de foco de `logic/reproducao-vod.md` §4, renderizando **só** o que a capacidade permite. Consumir exclusivamente tokens da ADR-007
- [X] T023 [US1] Implementar em `tv-web/src/components/PlayerLayer.tsx` o estado `controlsVisible`/`focusedAction`, o temporizador de 5 s e o roteamento de teclas da tabela de `logic/reproducao-vod.md` §4 (incluindo: com `!canSeek`, esquerda/direita não fazem nada)
- [X] T024 [US1] Ligar a ação primária de `tv-web/src/features/movies/MovieDetailScreen.tsx` à camada — substituir o `showToast('Abrindo player...')` por `{playing && <PlayerLayer … />}`, com guarda de sessão única (`logic/reproducao-vod.md` §7)
- [X] T025 [US1] Rotear `onSelect` para o botão do estado ativo nos ramos de carregando/erro de `MovieDetailScreen.tsx`, para OK do controle ativá-lo (R-005). **Não** alterar `tv-web/src/lib/useRemoteNav.ts`
- [X] T026 [US1] Estilos da barra em `tv-web/src/features/screens.css`, reaproveitando as classes `.player-*` existentes e acrescentando as da barra — sem cor, raio ou tamanho de fonte literal (ADR-007)

**Critério de Conclusão**: um filme abre, toca no adaptador `<video>`, pausa, salta, mostra posição e duração, oculta e revela os controles conforme o guia 06, e RETURN devolve ao detalhe com o foco na ação primária. A Live TV continua idêntica (Cenário E). Toda a suíte passa.

**Checkpoint**: User Story 1 funcional e testável isoladamente.

**Registro da Fase**:

- Status: Concluída
- Feito: T020 (`git mv` PlayerOverlay→PlayerLayer + generalização D-007), T022 (`PlayerControls.tsx`), T023 (estado/temporizador/roteamento de teclas em `PlayerLayer.tsx`), T024/T025 (`MovieDetailScreen.tsx` liga a camada e roteia OK pro botão ativo nos estados de carregando/erro) e T026 (CSS da barra) já existiam no código (commit `player2`, sessão anterior) mas sem os checkboxes/Registro atualizados — reconciliado aqui. T021 (import de `LiveScreen.tsx`) estava genuinamente pendente: o `git mv` de T020 já tinha apagado `PlayerOverlay.tsx`, deixando `LiveScreen.tsx` com um import quebrado (`./PlayerOverlay`) e a prop antiga `channelName` — corrigido para importar `PlayerLayer` e passar `title`/`unavailableMessage`/`genericErrorMessage` com o texto de canal original ("Este canal não tem uma fonte de reprodução disponível." / "Não foi possível reproduzir este canal.", resgatados do `PlayerOverlay.tsx` pré-`git mv`). Dois bugs reais encontrados e corrigidos ao rodar a suíte herdada de T017-T019 (ver R-014/R-015 em `plan.md`): foco inicial/ao revelar caía no índice 0 (`jumpBack`) em vez do play/pause, e o temporizador de ocultar armado no momento do SELECT de pausa sobrevivia à confirmação assíncrona do motor, escondendo a barra mesmo pausado.
- Testes executados: `npx tsc -b` limpo; `npm run lint` limpo (só os 3 warnings pré-existentes de `react(incompatible-library)`/`react(only-export-components)`, nenhum deles em código desta feature); `npx vitest run` → 357/357 (38 arquivos), incluindo os 22 testes de `PlayerLayer.test.tsx` (8 falhavam antes das correções de R-014/R-015) e a suíte de `LiveScreen.test.tsx` sem alteração de asserção (Live TV intacta).
- Pendências: Cenários A e E do `quickstart.md` (verificação manual no navegador, ponto de parada sugerido pelo "Implementation Strategy" desta fase) ainda não foram executados — ficam formalmente para T052 (Polish), como o restante dos cenários A–E, mas quem retomar antes disso deveria rodá-los primeiro por precaução.

---

## Phase 4: User Story 2 - Retomar de onde parou (Priority: P2)

**Objetivo**: A posição é gravada durante a reprodução e vira "Retomar (a partir de …)" no detalhe, com "Reiniciar" ao lado.

**Independent Test**: Assistir >30 s, sair, reabrir o detalhe: a ação primária virou "Retomar" com a posição certa. Recarregar a página e conferir que sobreviveu.

### Testes da Fase

- [ ] T027 [P] [US2] Teste de gravação em `tv-web/src/lib/player/progressRecorder.test.ts` (novo), com `fake-indexeddb` — cadência de 5 s; **nada** gravado abaixo de 30 s; gravação ao pausar/encerrar; **nada** gravado quando nenhum `onProgress` chegou (FR-017); nada gravado quando `reportsPosition: false` (canal ao vivo)
- [ ] T028 [P] [US2] Teste do limiar final em `tv-web/src/lib/player/progressRecorder.test.ts` — cruzar 95 % **apaga** o progresso e a porta `marcaComoApagado` impede regravação enquanto a sessão continua (`logic/reproducao-vod.md` §2); sem duração conhecida, **não** apaga por proporção
- [ ] T029 [P] [US2] Teste de `MovieDetailScreen.test.tsx` — com progresso ≥30 s, a ação primária é "Retomar" com o tempo formatado e "Reiniciar" existe; com progresso <30 s, continua "Assistir" sem secundária; "Reiniciar" passa `startAtMs: 0` e "Retomar" passa a posição (`logic/reproducao-vod.md` §5)
- [ ] T030 [P] [US2] Teste de identidade em `progressRecorder.test.ts` — a chave usada é a de `buildStableId`; item sem `providerStreamId` cai em `originalName`; item sem nenhum dos dois **não derruba a reprodução**, só não grava (D-010, R-010)
- [ ] T031 [P] [US2] Teste de frescor em `tv-web/src/features/movies/MovieDetailScreen.test.tsx` — abrir a camada, simular avanço gravado, fechar, e conferir que a ação primária **relê** e passa a mostrar a posição nova. O teste que falha sem a invalidação: assistir e voltar deixando a tela anunciar "Assistir" ou "0:00" (`logic/reproducao-vod.md` §5.1)

### Implementation

- [ ] T032 [US2] Criar `tv-web/src/lib/player/progressRecorder.ts` — a máquina de `logic/reproducao-vod.md` §2 (`aoAtualizarPosição`/`aoSair`), consumindo `resumePolicy` e `userStateRepository.updateProgress`. Sem React: recebe posição e devolve efeito, para ser testável sem DOM
- [ ] T033 [US2] Acrescentar ao `userStateRepository` a limpeza de progresso usada pelo limiar final e pela conclusão em `tv-web/src/lib/catalog/userStateRepository.ts` — seguir o padrão de `toggleFavorite`, que já zera `favoritedAt` em vez de marcar (não inventar coleção nova)
- [ ] T034 [US2] Ligar o gravador à camada em `tv-web/src/components/PlayerLayer.tsx` — assinar `onProgress`, chamar `aoSair` em pausa/RETURN/desmontagem, envolvendo em `try/catch` para D-010
- [ ] T035 [US2] Criar `useUserState(stableId)` e `invalidateUserState(queryClient, stableId)` em `tv-web/src/features/catalog/catalogApi.ts`, com `queryKey: ['user-state', stableId]` — seguir o padrão de `useCatalogItem` (`catalogApi.ts:289`). Exportar a invalidação em vez de deixá-la inline, para a tela de séries reusar a mesma chave (`logic/reproducao-vod.md` §5.1)
- [ ] T036 [US2] Ler o estado do usuário em `tv-web/src/features/movies/MovieDetailScreen.tsx` via `useUserState` e alternar a ação primária entre Assistir / Retomar (com posição formatada) / Reiniciar (FR-015, FR-016)
- [ ] T037 [US2] Chamar `invalidateUserState` ao fechar a camada em `MovieDetailScreen.tsx` — sem isso a tela por baixo continua com a leitura de quando montou, e um filme assistido por 20 min volta anunciando "Assistir" (`logic/reproducao-vod.md` §5.1). A invalidação fica na tela, que detém a consulta **e** o estado `playing`; a camada não conhece chaves de consulta
- [ ] T038 [US2] Formatação de tempo em `tv-web/src/lib/player/formatTime.ts` (novo) com teste — `1h23`, `12:05`, sem inventar horas para um filme de 40 min

**Critério de Conclusão**: a posição sobrevive a fechar a camada e a recarregar a página, aparece como "Retomar" com o tempo certo **imediatamente ao voltar do player** (sem releitura manual), "Reiniciar" começa do zero, e nada é gravado abaixo do limiar inicial nem acima do final.

**Checkpoint**: User Story 2 funcional; US1 continua passando.

**Registro da Fase**:

- Status:
- Feito:
- Testes executados:
- Pendências:

---

## Phase 5: User Story 3 - O filme termina (Priority: P3)

**Objetivo**: Fim de filme é conclusão, não falha: a camada fecha, o detalhe volta, a retomada é apagada — e canal ao vivo continua tratando fim de stream como falha.

**Independent Test**: Buscar até perto do fim e deixar terminar: nenhuma mensagem de erro, o detalhe volta, a ação primária é "Assistir".

### Testes da Fase

- [ ] T039 [P] [US3] Teste em `tv-web/src/components/PlayerLayer.test.tsx` — estado `completed` fecha a camada e chama `onClose`, **sem** renderizar a tela de erro
- [ ] T040 [P] [US3] Teste em `progressRecorder.test.ts` — conclusão apaga o progresso (FR-020)
- [ ] T041 [P] [US3] Teste de não-regressão em `tv-web/src/components/PlayerLayer.test.tsx` — com mídia `channel`, `onCompleted` continua produzindo a tela de erro com a mensagem de transmissão interrompida (FR-021)

### Implementation

- [ ] T042 [US3] Tratar `completed` em `tv-web/src/components/PlayerLayer.tsx` — fechar a camada e devolver o foco, sem passar pelo caminho de erro
- [ ] T043 [US3] Ligar a conclusão à limpeza de progresso via `progressRecorder` (`aoSair('conclusão')`) — o `onClose` que se segue já dispara a invalidação de T037, então o detalhe volta a oferecer "Assistir" sem releitura manual

**Critério de Conclusão**: um filme que termina não mostra erro, volta ao detalhe e deixa de ser retomável; um canal cuja transmissão cai continua mostrando a falha de hoje.

**Checkpoint**: as três user stories funcionais.

**Registro da Fase**:

- Status:
- Feito:
- Testes executados:
- Pendências:

---

## Phase 6: Verificação na TV física (gate obrigatório)

**Purpose**: Provar no AVPlay o que o adaptador `<video>` é incapaz de reprovar. Decisão do usuário (23/09/2026): **gate de conclusão desta feature**.

- [ ] T044 Build e instalação pelo skill `tizen-tv` (`npm run build:tizen` em `tv-web/`)
- [ ] T045 Executar Cenário F (filme reproduz, com imagem e áudio) de `quickstart.md`
- [ ] T046 Executar Cenário G (posição e duração reais) — **registrar** se a duração veio ou não, e qual degradação ocorreu (R-007)
- [ ] T047 Executar Cenário H (pausa e busca), incluindo **segurar a seta por ~3 s** para exercitar a porta single-flight (R-002) — o risco mais concreto da feature
- [ ] T048 Executar Cenário I (retomada ponta a ponta, com o app fechado pelo controle)
- [ ] T049 Executar Cenário J (Live TV não regrediu) — reexecuta o Cenário C da feature 003 (SC-005)
- [ ] T050 Conferir `sdb dlog | Select-String CCPlay` — nenhuma URL, endereço, usuário ou senha no log (SC-006)
- [ ] T051 Registrar a evidência exigida pelo guia 06 (modelo, firmware, versão, origem **sem URL**, sequência de comandos) em `plan.md` → `## Execution Notes`

**Critério de Conclusão**: Cenários F–J aprovados na QN50Q60DAGXZD, com evidência registrada. Cenário reprovado vira task nova, não nota de rodapé.

**Registro da Fase**:

- Status:
- Feito:
- Testes executados:
- Pendências:

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Fechar a documentação e o que atravessa as stories.

- [ ] T052 Rodar a validação completa de `quickstart.md` (Cenários A–E no navegador)
- [ ] T053 Atualizar `CLAUDE.md` — a seção "Project status" hoje diz que só canal ao vivo reproduz e que `userStateRepository` não tem consumidor; as duas deixam de ser verdade
- [ ] T054 Atualizar `.planning/backlog.md` — item 4 (contrato de capacidades entregue; o que sobra é o ciclo de vida do item 10), item 8 (Assistir e ação contextual entregues) e item 13 (posição gravada; conclusão/histórico continuam abertos)
- [ ] T055 Registrar R-004 como `[Bug]` em `.planning/backlog.md` — o roteador desmonta a tela e voltar do detalhe perde foco e posição da grade. **Pré-existente**, achado nesta feature, fora do escopo dela. Caminho normal: `sdd-bugfix`
- [ ] T056 Conferir que nenhum componente novo usa cor, raio ou tamanho de fonte literal (ADR-007)
- [ ] T057 `npx tsc -b`, `npm run lint` e `npx vitest run` limpos de ponta a ponta

### Checklist de Release

<!--
  Itens marcados pelo sdd-execute conforme cada fase fecha, mais gates
  cross-cutting da feature. Ecoa o pre-acceptance checklist da constitution.md.
-->

- [X] Fase 1 (Setup) concluída
- [X] Fase 2 (Foundational) concluída
- [X] Fase 3 (User Story 1) concluída
- [ ] Fase 4 (User Story 2) concluída
- [ ] Fase 5 (User Story 3) concluída
- [ ] Fase 6 (TV física) concluída — **gate obrigatório**
- [ ] `quickstart.md` executado com sucesso (A–E no navegador, F–J na TV)
- [ ] Testes automatizados passando (`npx tsc -b`, `npm run lint`, `npx vitest run`)
- [ ] Nenhum segredo em mensagem, rótulo, UI ou log (SC-006)
- [ ] Live TV sem regressão (SC-005)
- [ ] Nenhum percentual exibido sem duração conhecida (FR-004)
- [ ] Documentação sincronizada (`CLAUDE.md`, backlog)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sem dependências
- **Foundational (Fase 2)**: depende da Fase 1 — BLOQUEIA todas as user stories
- **US1 (Fase 3)**: depende da Fase 2
- **US2 (Fase 4)**: depende da Fase 3 (precisa da camada ligada ao detalhe)
- **US3 (Fase 5)**: depende da Fase 3; independe da Fase 4
- **TV física (Fase 6)**: depende das Fases 3–5
- **Polish (Fase 7)**: depende de todas

### Parallel Opportunities

- T001–T004 (Fase 1) são todos `[P]`: dois arquivos novos e independentes
- T005–T009 (testes da Fase 2) são `[P]` entre si, mas antecedem T010–T016
- T017/T019 e T027–T031 são `[P]` dentro das suas fases
- US2 e US3 podem ser trabalhadas em paralelo depois da US1
- **Exceção dentro da US2**: T035 → T036 → T037 são sequenciais e tocam a
  mesma tela; T037 depende da consulta criada em T035 existir

---

## Parallel Example: Phase 1

```bash
# Tasks marcadas [P] na Fase 1 podem rodar juntas
Task: "T001 [P] resumePolicy.test.ts"
Task: "T002 [P] capabilities.test.ts"
Task: "T003 [P] resumePolicy.ts"
Task: "T004 [P] capabilities.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Completar Fase 1: Setup
2. Completar Fase 2: Foundational (bloqueia todas as stories)
3. Completar Fase 3: User Story 1
4. **PARAR E VALIDAR**: Cenários A e E do `quickstart.md`

Neste ponto já existe valor real: dá para assistir a um filme, o que hoje é
impossível. Retomada e conclusão podem ser entregues depois sem retrabalho.

### Incremental Delivery

1. Fases 1–2 → contrato de capacidades pronto, Live TV intacta
2. Fase 3 → assistir um filme (MVP entregável)
3. Fase 4 → retomada
4. Fase 5 → conclusão
5. Fase 6 → prova na TV (gate)
6. Fase 7 → documentação sincronizada

## Notes

- `[P]` = arquivos diferentes, sem dependência
- `[Story]` mapeia a task pra uma user story específica
- Commitar após cada task ou grupo lógico coerente
- Parar em qualquer checkpoint pra validar a story isoladamente
- **T020 usa `git mv`**, não copiar-e-apagar: o histórico do `PlayerOverlay`
  carrega dois bugs corrigidos na TV física e não deve ser perdido

<!-- sdd-converge anexa "## Phase N: Convergence" abaixo desta linha -->
