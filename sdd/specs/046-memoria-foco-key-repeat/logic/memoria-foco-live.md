# Lógica: memória de foco da Live TV

Cobre FR-007–FR-016 (US2 / 14b). Stub: `tv-web/src/features/live/liveSessionMemory.ts`. Modelo a imitar: `features/vod/vodSessionMemory.ts` (feature 025).

## 1. Chave e dado

`rememberLiveFocus(sourceId, entry, channelId, index)` / `recalledLiveFocus(sourceId, entry)`; mapa de módulo, chave `` `${sourceId}|live|${entry}` ``, valor `{ channelId, index }`.

`LiveEntryKey`: `'favorites' | 'all' | 'category:<groupLabel(nome)>'` — **nome da categoria** (`groupLabel`), como a trilha e o `vodEntryKey` já identificam, não o id numérico (o nome sobrevive a uma renovação/nova geração). Função pura `liveEntryKey(entered, categories)` converte `EnteredKey` (`{kind:'category', id}`) → `LiveEntryKey`; devolve `undefined` se a categoria não existe mais.

`index` é só dica de vizinho (FR-010), **nunca identidade**: quem decide qual canal é, é o `channelId`.

`forgetLiveSource(sourceId)`: remove todas as chaves da lista. Chamado por `useDeleteSource` (`features/import/importApi.ts`, `onSuccess`) — `lib/` nunca importa `features/` (camadas). Trocar de lista não exige limpar: a chave inclui o `sourceId`, então nunca se aplica à outra lista (FR-013).

## 2. Quando gravar (em `useLiveChannels`, `useLiveCatalog.ts`)

Um `useEffect` depois do cálculo de `channelIdx`, com as dependências `[sourceId, entered, categories, effectiveCol, topFocused, searchActive, activeChannel, channelIdx]`.

Regras (todas devem valer para gravar):

1. `entered !== null` e `liveEntryKey(entered, categories)` definida;
2. `effectiveCol >= 1` (a pessoa está na coluna de canais ou no preview) e `!topFocused`;
3. `!searchActive` — a posição numa lista **filtrada** nunca sobrescreve a memória (FR-014);
4. `activeChannel` existe e **está em `items`** — `focusedIdentity.channelId` que não pertence à lista exibida (ex.: CH± andou por outra vizinhança) nunca é gravado como se fosse dela;
5. grava `channelIdx` como `index`.

Nunca grava com a trilha (`col 0`) em foco: mover a trilha não muda o canal lembrado.

## 3. Quando restaurar (em `useLiveKeyboard.ts`: `enterCategory`/`enterFavorites`/`enterAll`)

Hoje as três fazem `setFocusedIdentity({ trailKey, channelId: null })` ao trocar de entrada. Troca-se `null` por `recalledLiveFocus(sourceId, key)?.channelId ?? null`:

- entrada nunca visitada → `null` → primeiro item (FR-009), exatamente como hoje;
- visitada → o canal lembrado; `locateOrNeighbor` já o acha por id e a virtualização já rola até ele (`useVirtualFocusSync`, mesma mecânica do retorno do detalhe em Filmes/Séries).

`sourceId` precisa chegar a `useLiveKeyboard` (hoje vem em `trail`/params de `LiveScreen`; passar como campo novo de `LiveKeyboardParams`).

**Canal lembrado que sumiu (FR-010)** — dentro da mesma entrada já aberta, a feature 038 resolve (`lastChannelFocusRef`). Ao **reentrar** numa entrada, o `lastChannelFocusRef` ainda guarda a lista anterior; em `useLiveChannels`, passar a `locateOrNeighbor` o `last` assim:

```ts
const memory = entered ? recalledLiveFocus(sourceId, liveEntryKey(entered, categories)) : null
const hint = lastChannelFocusRef.current?.listKey === channelListKey
  ? lastChannelFocusRef.current
  : memory ? { listKey: channelListKey, index: memory.index } : null
const channelIdx = locateOrNeighbor(items, (c) => c.id === focusedIdentity.channelId, channelListKey, hint)
```

Assim um id lembrado que já não existe cai na posição lembrada (vizinho), nunca no topo sem motivo. **Cuidado**: o `index` de `memory` é lido no render; o efeito de gravação (§2) só roda quando o canal existe em `items`, então não sobrescreve a dica com o índice 0 do fallback.

## 4. Fechar o player (FR-011) — `useLiveZapping.ts`

Hoje `onClose={() => setPlaying(null)}` (`LiveScreen.tsx:294`). O foco só fica certo se a entrada exibida ainda contém o canal; mas `openZapping` troca `entered` para a categoria do canal (`original_group`) e `stepChannel` (↑/↓/CH±) anda pela vizinhança de `zapKeyRef` — que pode ser "Todos"/"★ Favoritos" — setando só `channelId`. Resultado hoje: ao fechar, `entered` é a categoria e o canal vizinho não está nela → foco cai no 1º item.

Novo `onPlayerClosed` em `useLiveZapping`, usado no lugar do `setPlaying(null)`:

```ts
function onPlayerClosed() {
  const last = playing
  const origin = zapKeyRef.current            // entrada de onde a sessão começou/foi recapturada
  setPlaying(null)
  if (!last || !origin) return
  const key = liveEntryKey(origin, categories)
  if (!key) return                            // categoria de origem sumiu: mantém o que está (vizinho pela 038)
  setEntered(origin)
  setFocusedIdentity({ trailKey: trailKeyOf(origin, categories), channelId: last.id })
  // a gravação do §2 fixa a memória dessa entrada no render seguinte (o canal está em `items`)
}
```

- `trailKeyOf(origin, categories)`: `favorites`→`{kind:'favorites'}`, `all`→`{kind:'all'}`, `category`→`{kind:'category', name: groupLabel(categoria.name)}` (função pura nova em `liveTrail.ts`).
- `setCol` não muda: o foco continua na coluna de canais, como hoje ao voltar.
- Se `last` já pertence à entrada exibida (caso comum: OK numa categoria, assistir, RETURN), o resultado é idêntico ao de hoje — a mudança só aparece quando `entered` e a origem divergem.
- O guia EPG (feature 031) tem seu próprio retorno (`guideWatchPendingRef`) e **não** muda aqui.
- Fora do player (não tocando), `playing === null` → `onPlayerClosed` nunca roda.

## 5. Não fazer

- Nada de `localStorage`/Dexie (FR-012).
- Nada de ler memória durante o zapping para mover o foco da lista de zapping: lá o foco é o canal que toca (feature 016), já correto.
- "Todos" da Live **não** é paginado (`useAggregatedItems` sem `progressive`): a regra "perseguir o item ainda não carregado" da spec (edge case de "Todos") só se aplica a Filmes/Séries (feature 039) e não gera código aqui — R-003.
