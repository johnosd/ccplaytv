# Lógica — remoção e limpeza do Histórico (feature 036)

Regras que o `sdd-execute` segue à risca. Os testes de contrato
(`historyRemoval.limpar-historico.contract.test.ts`,
`VodCatalogScreen.limpar-historico.contract.test.tsx`) provam §1–§5 e §6–§8.

## §1 O que é "estar no Histórico"

Hoje (feature 025) o `↺ Histórico` e "Continuar assistindo" leem o **mesmo**
campo, `UserStateRecord.lastWatched` — `listPlayed` para o Histórico,
`getContinueWatching` (+ `progressSeconds > 0`) para Continuar. Apagar
`lastWatched` tiraria o item dos dois ao mesmo tempo, o que contradiz a opção
"Remover do histórico" (a retomada fica, FR-008).

Por isso a remoção **esconde** em vez de apagar:

```ts
isInHistory(state) =
  state?.lastWatched != null &&
  (state.historyHiddenAt == null || state.lastWatched > state.historyHiddenAt)
```

- `historyHiddenAt` é campo novo de valor, **sem índice** → **sem bump do
  Dexie** (continua v12). Nada de `.upgrade()`.
- `listPlayed` (`userStateRepository.ts`) é o **único** leitor de "Histórico"
  no código (confirmado por busca): ele passa a filtrar por `isInHistory`.
  `getContinueWatching`, `episodeNavigation.ts` e `homeHero` continuam lendo
  `lastWatched`/`progressSeconds` como antes — não mudam.
- Uma reprodução nova (`updateProgress` grava `lastWatched = Date.now()`)
  traz o item de volta sozinha (FR-016, contrato C2). Ninguém precisa apagar
  `historyHiddenAt`.
- Ao esconder, grave `historyHiddenAt = max(Date.now(), state.lastWatched)` —
  garante `lastWatched <= historyHiddenAt` mesmo com relógio igual.

## §2 Remover um filme — `removeMovieFromHistory(stableId, sourceId, mode)`

Numa transação `rw` de `userStates` (mesmo padrão de `upsert`):

1. Lê o estado. Ausente, ou `!isInHistory` → não faz nada (idempotente).
2. Grava `historyHiddenAt` (§1).
3. `mode === 'history-and-progress'` → `progressSeconds = undefined`.
4. **Nunca** altera `isFavorite`, `favoritedAt`, `completedAt`, `lastWatched`
   (FR-012/FR-013). `updatedAt = Date.now()`.

## §3 Remover uma série — `removeSeriesFromHistory(sourceId, seriesId, mode)`

O card do Histórico é por série, o dado é por episódio (`history.ts`
`loadSeriesHistory`). O conjunto de episódios é o **mesmo** que pôs a série
no Histórico: episódios da geração ativa com esse `seriesId`.

1. `listEpisodes(sourceId, seriesId, database)` (`catalogRepository.ts`).
2. Para cada episódio, `buildStableId({sourceId, kind:'episode',
   providerStreamId, seriesId, seasonNumber, episodeNumber, originalName})`
   — exatamente como `useSeriesWatchedSummary` faz; se lançar (sem identidade),
   pula o episódio.
3. `bulkGet` dos estados; numa transação, para cada estado existente:
   `isInHistory` → grava `historyHiddenAt`; `history-and-progress` → apaga
   `progressSeconds` de **todos** os estados dos episódios dessa série
   (inclusive os já escondidos: "apagar progresso" da série quer dizer
   nenhum episódio dela em Continuar).
4. `completedAt` de episódio nunca muda (FR-013).

## §4 Limpar em lote — `clearHistory(sourceId, scope, mode)`

- `scope` → prefixos: `movies` → `${sourceId}|movie|`; `series` →
  `${sourceId}|episode|`; `both` → os dois.
- Uma transação `rw`: `userStates.where('sourceId').equals(sourceId)`, filtra
  pelos prefixos. Para cada estado: `isInHistory` → `historyHiddenAt`;
  `history-and-progress` e `progressSeconds > 0` → apaga `progressSeconds`
  (inclusive de estados já escondidos — US2/AC3: "Continuar assistindo fica
  vazio").
- **Não** resolve nada no catálogo: pega também os registros "não
  disponíveis" (FR-025, contrato C4). Nunca toca outro `sourceId` (FR-014).

## §5 Resumo para a aba Privacidade — `summarizeHistory(sourceId)`

Por escopo (filmes / séries):

- `titles` = `loadHistory(...).records.length`;
  `unavailable` = `loadHistory(...).unresolved` (em Séries, conta episódios —
  mesma semântica da nota da 025).
- `hasProgress` = algum estado do prefixo com `isInHistory` e
  `progressSeconds > 0`.
- Escopo vazio = `titles + unavailable === 0` → ação soft disabled (FR-026).
  "Limpar ambos" fica vazio só quando os dois estão.

Texto da linha: `"{titles} títulos"` (`"1 título"`), e
`" · {unavailable} indisponíveis"` só quando `unavailable > 0`.

## §6 A confirmação — `HistoryRemovalModal` (`features/history/`)

Um componente para os três usos (grade, detalhe, Privacidade), sobre o
`Modal` da 022 — mesmo padrão de `DeleteSourceModal`:

- Ações, na ordem de foco (←/→), índice **0 = "Cancelar"** focado ao abrir
  (FR-011):
  - item: `Cancelar` · `Remover do histórico` · `Remover e apagar progresso`
  - lote: `Cancelar` · `Limpar histórico` · `Limpar e apagar progresso`
  - a terceira só existe quando `hasProgress` (FR-007/FR-024).
- `aria-label` do diálogo: item → `Remover "{nome}" do histórico?`; lote →
  `Limpar o histórico de Filmes?` / `de Séries?` / `de Filmes e Séries?`.
- Descrição fixa: "Favoritos e marcações de assistido não são alterados."
  e, quando a 3ª ação existe, "Manter a retomada deixa o título em Continuar
  assistindo."
- RETURN = Cancelar (FR-010). O `Modal` já devolve o teclado à tela: o foco
  por estado da tela nunca mudou, então "volta" sozinho a quem abriu.
- Estado de erro (FR-020): prop `error` → título "Não foi possível remover do
  histórico", ações `Cancelar` · `Tentar de novo` (índice 0 focado), sem
  mensagem técnica. "Tentar de novo" repete o mesmo `mode`.

## §7 Tecla vermelha

- `tizenColorKey.ts`: `REMOVE_COLOR_KEY = 'ColorF0Red'`,
  `REMOVE_COLOR_KEYCODE = 403` (fallback, a confirmar na TV — R-002);
  `registerRemoveColorKey(): boolean` **estrito** como
  `registerMediaKeys` (lista vazia/ausente/erro → não registra, `false`) e
  `isRemoveColorKeyRegistered()` (flag de módulo, para a dica — FR-003).
  Chamada em `App.tsx`, junto das outras.
- `useRemoteNav`: handler opcional `onRemoveKey`, reconhecido por `event.key
  === REMOVE_COLOR_KEY || event.keyCode === REMOVE_COLOR_KEYCODE`, **só**
  quando o handler existe (sem ele a tecla continua não mapeada), com debounce
  próprio de 400 ms (mesmo motivo de `FAVORITE_KEY_DEBOUNCE_MS`, FR-021).
- Em navegador de desenvolvimento a tecla não é registrada, mas um
  `KeyboardEvent` sintético com `key: 'ColorF0Red'` chega igual — é o que os
  testes e o E2E usam.

## §8 Grade do `↺ Histórico` (`VodCatalogScreen`)

- `onRemoveKey` só com `enteredHistory && col === 1 && toolbarFocus === null
  && activeItem && !removalTarget && !pending`. Com o modal aberto a tela
  **não** passa `onRemoveKey` — tecla não mapeada não é interceptada pelo
  `Modal` e chegaria à tela (FR-021).
- Ao abrir: descobre `hasProgress` do alvo (filme: `getUserState(stableId)`;
  série: estados dos episódios de `listEpisodes`) **antes** de montar o modal —
  leitura local, sem rede.
- Confirmar: calcula o vizinho **antes** (`computeNeighbor` — hoje privada em
  `useFavoriteToggle.ts`; extrair para `features/favorites/neighbor.ts` e
  reusar nos dois), chama a mutação; sucesso → toast "Removido do histórico",
  `setFocusedItemId(vizinho)`; lista vazia → estado vazio existente (FR-018).
  Falha → modal em estado de erro (§6), item continua na grade.
- Dica `● Remover do histórico` (junto do `FavoriteHint`) só quando
  `isRemoveColorKeyRegistered() && enteredHistory && showResultsGrid`.

## §9 Detalhe

- **Filme**: ação `{id: 'remove-history'}`, rótulo "Remover do histórico",
  **por último** no array (depois de `toggle-watched`) e só quando
  `isInHistory(userState)` (FR-004/FR-005). `hasProgress` =
  `progressSeconds > 0`.
- **Série**: mesma ação, por último (depois de `trailer`), quando algum
  estado de `useUserStates(stableIds)` dos episódios `isInHistory`;
  `hasProgress` = algum com `progressSeconds > 0`. Alvo = `series.series_id`.
- Sucesso → toast "Removido do histórico"; a ação some e `safeActionFocus` já
  faz o clamp para a anterior.
- Voltar para a grade depois de remover no detalhe (US1/AC9): o
  `focusedItemId` do snapshot não existe mais. Hoje `focusedIndexHint` é
  gravado mas **nunca lido**; passar a usá-lo: id ausente + dica presente →
  focar `items[min(dica, length - 1)]`.

## §10 Invalidação (FR-019)

`invalidateHistoryRemoval(queryClient)` em `catalogApi.ts`, chamada no
`onSuccess` das duas mutações (`useRemoveFromHistory`, `useClearHistory`):
`user-state`, `user-states`, `history-content`, `continue-watching`,
`resume-positions`, `home-hero`, `history-summary`. Prefixo de chave, sem
`sourceId` (mesmo estilo de `useToggleWatched`). Faltar uma destas é o bug que
a 019 já teve (Continuar não sumia) — por isso a lista é fechada aqui.

## §11 Aba Privacidade (`SettingsScreen` + `PrivacyPanel`)

- `SettingsTab` ganha `'privacy'`, rótulo "Privacidade", ícone `history`,
  inserida **antes de "Sobre & créditos"** (última aba real antes do rodapé
  informativo). Nenhuma outra aba muda de posição relativa.
- Com lista ativa (`activeSourceId` não nulo): cabeçalho com o nome da lista
  (`display_name` de `useSources`) e três linhas focáveis (↑/↓), na ordem
  Filmes · Séries · Ambos, cada uma com a contagem de §5. ← volta às abas, ↑ na
  1ª linha vai à topbar (mesmo padrão de Acessibilidade).
- Linha vazia: `.is-soft-disabled` + `aria-disabled="true"` + nome acessível
  "Limpar histórico de Filmes — histórico vazio" (FR-026, regra da 028
  `findUnnamedControls`). SELECT nela → toast "O histórico de Filmes já está
  vazio.", nunca modal.
- SELECT numa linha com conteúdo → `HistoryRemovalModal` em modo lote com
  `hasProgress` do escopo. Confirmado → `useClearHistory`; sucesso → toast
  "Histórico de Filmes limpo." e o foco **fica** na linha (agora vazia,
  FR-028); falha → modal em estado de erro.
- Sem lista ativa: texto "O histórico é guardado por lista. Entre numa lista
  para limpar o histórico dela." e um botão focável "Voltar às abas" (mesmo
  padrão de `ComingSoonPanel`) — FR-027.
- `useHistorySummary(sourceId)` (chave `['history-summary', sourceId]`) só
  habilitada com a aba Privacidade aberta — nada é lido só por abrir
  Configurações.
