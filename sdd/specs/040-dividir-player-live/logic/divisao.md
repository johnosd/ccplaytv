# Lógica — como dividir sem mudar comportamento (feature 040)

Esta feature não cria regra de negócio. O risco é **mover** código de um jeito
que muda o tempo das coisas — e o player já teve corridas que só apareceram
assim (027: estado lido por `useState` numa tecla que chega entre a criação da
sessão e o próximo commit). As regras abaixo são o "como" travado; os nomes de
arquivo são a proposta do plano (o executor pode ajustar nome, nunca regra).

## §1 Regras de movimentação (valem para os dois arquivos)

1. **Ref continua ref, estado continua estado.** Nada que hoje é `useRef`
   vira `useState` (nem o contrário). Os refs são criados **uma vez** no
   componente (ou num hook chamado uma vez por ele) e passados **como o
   próprio objeto ref** aos módulos — nunca o `.current` copiado num valor.
2. **Ordem dos efeitos preservada.** A ordem relativa de declaração dos
   `useEffect`/`useLayoutEffect` (e do `useRemoteNav`, que registra
   efeitos) continua a de hoje. Se um módulo precisa de um efeito que hoje
   fica entre outros dois, ele exporta esse efeito como **hook separado**,
   chamado pelo componente na mesma posição.
3. **Um só `useRemoteNav` por componente.** O teclado do `PlayerLayer`
   continua sendo **um** registro com `{ modal: true }`; o da `LiveScreen`,
   um registro. O módulo de teclado é um hook que chama `useRemoteNav` uma
   vez, com os mesmos handlers.
4. **Funções de render continuam funções.** `renderColumns(withPreview)` e
   `withShell(children)` da `LiveScreen` (e o JSX do `PlayerLayer`) **não**
   viram componentes React: um componente novo é uma fronteira de
   reconciliação (pode remontar subárvores, mudar a identidade de refs de
   DOM e o scroll). Viram funções puras exportadas (`renderLiveColumns(model)`),
   chamadas no mesmo lugar.
5. **Sem contexto React novo.** Nada de `createContext` para "compartilhar
   o estado do player": dependências entram por parâmetro explícito e saem
   por retorno explícito. Isso deixa claro, para 55b/61/19, o que cada
   módulo lê e escreve.
6. **Mesmas importações externas.** Um módulo novo importa
   `catalogApi`/`userStateRepository`/`PlayerService`/`screenSaver` pelos
   mesmos módulos de hoje (só o caminho relativo muda) — os testes travados
   mockam esses módulos por identidade, e o mock continua valendo.
7. **Comentários vão junto.** O comentário que explica uma decisão
   (refs do chrome, `scheduleHide` lendo `sessionRef`, `useLayoutEffect`
   etc.) acompanha o código para o módulo novo — eles são a memória das
   corridas já encontradas.
8. **API pública intacta.** `PlayerLayer.tsx` e `LiveScreen.tsx`
   reexportam tudo o que exportam hoje (`PlayerLayer`, `PlayerLayerProps`,
   `PlayerLayerTopLayer`, `PlayerIdentity`, `PlayerEpisodeStep`;
   `LiveScreen`, `LiveScreenProps`, `LiveShellProps`).

## §2 Mapa do player (`tv-web/src/components/player/`, pasta nova)

| Módulo | Responsabilidade (FR-003) | Sai de `PlayerLayer.tsx` hoje |
| --- | --- | --- |
| `playerLayerTypes.ts` | Tipos públicos e internos | `PlayerLayerTopLayer`, `PlayerLayerProps`, `Phase`, `PanelState`, `InfoSnapshot`, `ChromeLevel` |
| `playerMessages.ts` | Constantes e textos | `STATE_LABEL`, `HIDE_CONTROLS_MS`, `JUMP_MS`, mensagens padrão/de erro/limite/painéis |
| `usePlayerChrome.ts` | **Chrome**: nível, mídia, foco, barra, auto-ocultar | refs `chromeMedia/Level/focusedIndex/seekBarFocused`, `hideTimerRef`, `rerender`, `set*`, `clearHideTimer`, `episodeNeighborsOf`, `controlsFor`, `playPauseIndexOf`, `scheduleHide`, `revealFull`, `revealBand` |
| `usePlayerPanels.ts` | **Painéis** de áudio/legendas e info + escolha de faixas | refs `panelTracks/panelInfo/choice`, `reapplyTrackChoice`, `commitChoice`, `readInfoSnapshot`, `refreshPanel`, `open*Panel`, `closePanel`, `activatePanelControl`, `handlePanelDirection/Select`; e o hook separado `usePanelRefresh(panelKind, refreshPanel)` (o intervalo de 1 s, §1.2) |
| `usePlayerSession.ts` | **Sessão e ciclo de vida** | estados `phase`/`attempt`/`hardwarePlane`, o efeito grande (`start`, `publish`, `teardown`, visibilidade, gravador) e os efeitos de plano de hardware, reagendar ao mudar de estado e proteção de tela — cada um como hook na posição atual (§1.2) |
| `usePlayerKeyboard.ts` | **Teclado** | o `useRemoteNav` inteiro (`onDirection`, `onSelect`, `onMediaKey`, `onBack`, `onLongSelect`/`onFavoriteKey` do `topLayer`) |
| `PlayerLayer.tsx` (fica) | Composição + JSX | cria `sessionRef`/`panelRef`/`errorFocus`/toast, chama os hooks na ordem, desenha |

`sessionRef` e `panelRef` são lidos por chrome, painéis, sessão e teclado: são
criados no `PlayerLayer` e passados a todos (§1.1). `prefetchGate.acquirePlayback`
continua sendo o primeiro efeito.

## §3 Mapa da TV ao vivo (`tv-web/src/features/live/`)

| Módulo | Responsabilidade (FR-004) | Sai de `LiveScreen.tsx` hoje |
| --- | --- | --- |
| `liveTrail.ts` | Tipos e regras puras da trilha | `TrailKey`, `TrailEntry`, `EnteredKey`, `FocusIdentity`, `sameTrailKey`, `trailEntryId`, `defaultTrailIdx`, `VIRTUAL_TRAIL_COUNT`, constantes de linha/overscan/ações |
| `useLiveCatalog.ts` | **Trilha e lista de canais** (dados) | categorias, `topPhase`, `trail`, identidade/índice focado da trilha, `entered`, conteúdo (categoria, ★, Todos), `items`, reconciliação do foco do canal, leituras de EPG da lista |
| `useLiveSearch.ts` | **Busca** | `searchActive`, `searchTerm`, `searchInputRef`, efeitos de foco do campo, `belowMinimum`, `resetSearchState` |
| `useLiveZapping.ts` | **Zapping** | `playing`, `zapOpen`, `lastGoodChannelRef`, `zapSequenceRef`, `zapKeyRef`, `playActiveChannel`, `stepChannel`, `openZapping` e os handlers que o `PlayerLayer` recebe |
| `useLiveGuide.ts` | **Guia** | `guide`, `guideRef`, `guideWatchPendingRef`, `openGuideFromPreview`, `watchFromGuide`, `openGuideFromPlayer` |
| `useLiveKeyboard.ts` | Teclado | `handleTrailDirection`, `handleTrailSelect` e o `useRemoteNav` |
| `liveColumns.tsx` | Desenho da trilha/lista/preview | `renderColumns` → `renderLiveColumns(model)` **função** (§1.4); `withShell` → `renderLiveShell(...)` **função** |
| `LiveScreen.tsx` (fica) | Composição + JSX de topo | estados de navegação (`col`, `previewAction`, `zone`, `topbarItem`), chama os hooks na ordem, desenha |

Dependências cruzadas esperadas (e aceitas): zapping lê `items`/`entered`
do catálogo; guia lê o zapping (`playing`) e o catálogo; teclado lê todos.
Um hook nunca escreve o estado de outro por fora do retorno dele.

## §4 Bugs pequenos achados durante a divisão (FR-009, US3)

1. **Achou → não corrige no meio da movimentação.** Anota (arquivo, sintoma,
   como reproduzir) e termina a task de movimentação, deixando a suíte no
   estado da linha de base.
2. **Pequeno** = local, sem decisão de produto, sem mudar contrato travado.
   Senão → `.planning/backlog.md` (`[Bug]`, origem 040) e segue.
3. **Um sub-agente por bug** (decisão do usuário), lançado só **depois** que
   a fase que mexe no módulo afetado fechou — o principal não edita os mesmos
   arquivos enquanto ele trabalha. O sub-agente recebe: o arquivo/módulo, o
   sintoma, o passo de reprodução e a regra "teste de regressão primeiro";
   devolve o teste novo (vermelho antes, verde depois, provado com a saída)
   e a correção mínima.
4. O principal revisa o diff, roda a suíte da área e a suíte inteira, e
   registra uma task ad-hoc + um `R-00X` no `plan.md`. Commit separado da
   movimentação.
5. Nunca um teste existente muda de asserção para "acomodar" uma correção.
