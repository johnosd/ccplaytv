# Lógica: Busca Local e Restauração ao Voltar do Detalhe

Contrato estrito para o `sdd-execute`. Os testes de contrato
(`contract-tests.lock`) definem o "pronto"; este documento fixa o "como"
onde um executor poderia tomar uma decisão ruim.

## 1. Camada de dados — `tv-web/src/lib/catalog/catalogSearch.ts`

Stub já criado. Nenhuma função aqui toca rede (FR-009).

### `normalizeForSearch(text)`

```
text.normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // diacríticos combinantes — não usar \p{...}
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
```

Usada nos dois lados (nome do item e termo) — nunca comparar um lado
normalizado com o outro cru.

### Cobertura (FR-014)

Uma categoria do tipo está **coberta** quando seu conteúdo já está em
`channels`:

```
covered(c) = c.fetchMode === 'eager' || c.itemsFetchedAt !== undefined
```

- `on_demand` nunca aberta → não coberta.
- `stored` nunca aberta → **não coberta** (decisão D-003 do plano: o
  conteúdo guardado não tem registro em `channels`, logo não tem id para
  tocar/abrir; e é apagado de `storedEntries` quando a categoria é aberta).
- Categoria vencida pela janela de 24 h continua coberta (não revalida).

`totalCategories` = todas as categorias do tipo na geração ativa (a
entrada virtual "★ Favoritos" e "🔍 Buscar" nunca contam).

### `loadSearchIndex(sourceId, kind, database)`

1. `generation = activeGeneration(sourceId)`; sem geração → índice vazio,
   `0 de 0`.
2. Categorias: `listCategories(sourceId, kind, database)` → conta
   `covered`/`total`.
3. Itens: **uma** leitura por faixa do índice
   `[sourceId+generation+kind+groupOrder]` de `KEY_MIN` a `KEY_MAX` (o
   mesmo helper `query()` de `catalogRepository.ts` — exponha uma função
   nova no repositório em vez de o módulo de busca falar com Dexie direto,
   D-001 da feature 010). Episódios nunca entram (kind é sempre
   `channel`/`movie`/`series`).
4. `buildSearchIndex(records, coverage)`.

### `buildSearchIndex(records, coverage)`

Puro. Calcula `normalizedName` uma vez por registro.

### `searchIndex(index, term)`

```
t = normalizeForSearch(term)
if (t.length < SEARCH_MIN_CHARS) return []
hits = entries where normalizedName.includes(t)
starts = hits where normalizedName.startsWith(t)
rest   = hits where !startsWith
sort each by (normalizedName, record.name, record.id) ascending
return [...starts, ...rest].map(e => e.record)
```

Síncrono e puro — é o que torna FR-008/SC-004 verdadeiros por construção:
não existe resposta assíncrona por termo que possa chegar fora de ordem.

## 2. Hook — `useCatalogSearch` em `catalogApi.ts`

Stub já criado. As telas só falam com `catalogApi` (D-001 da feature 010).

```
function useCatalogSearch(sourceId, kind, term, enabled): CatalogSearchResult {
  const settled = useDebouncedValue(term, 300)          // FR-006; ajustável
  const indexQuery = useQuery({
    queryKey: ['catalog-search-index', sourceId, kind],
    queryFn: () => loadSearchIndex(sourceId, kind),
    enabled: enabled && sourceId !== null,
    staleTime: 0,
    refetchOnMount: 'always',   // cada entrada na busca relê: categorias abertas desde a última vez entram
  })
  const belowMinimum = normalizeForSearch(term).length < SEARCH_MIN_CHARS   // do termo CRU, não do assentado
  const items = belowMinimum || !indexQuery.data ? [] : searchIndex(indexQuery.data, settled).map(toItemOut)
  return { items, belowMinimum, coveredCategories, totalCategories, isLoading: indexQuery.isLoading }
}
```

- `belowMinimum` usa o termo cru: apagar para menos de 3 caracteres some
  com os resultados na hora, sem esperar a pausa (edge case da spec).
- `useDebouncedValue` é um hook pequeno novo (`tv-web/src/lib/
  useDebouncedValue.ts`) — não existe hoje.
- O termo nunca vai para `queryKey`, log ou qualquer lugar persistido
  (FR-021).

## 3. Teclado — guarda em `useRemoteNav`

Em `handleKeyDown`/`handleSelectKeyDown`/`handleKeyUp` de
`tv-web/src/lib/useRemoteNav.ts`, antes de qualquer `preventDefault`:

```
const editing = isEditable(event.target)   // input, textarea, [contenteditable]
if (editing && (key === 'Backspace' || key === ' ' || key === 'Enter'
                || key === 'ArrowLeft' || key === 'ArrowRight')) return
```

- `Backspace` num campo **nunca** é "voltar" — é apagar. RETURN da TV
  (keyCode 10009), `Escape` e `XF86Back` continuam sendo "voltar".
- `Enter` num campo fica com a plataforma: no Tizen é o que abre o teclado
  do sistema (mesmo mecanismo de `AddSourceScreen`, que nunca intercepta
  Enter em `<input>`).
- `ArrowUp`/`ArrowDown` continuam com a tela (sair do campo para os
  resultados).
- Nenhuma tela hoje tem campo editável sob `useRemoteNav` — a guarda não
  muda comportamento existente. Amende a ADR-009 com uma nota inline.

## 4. Tela — entrada "🔍 Buscar" (Live TV, Filmes, Séries)

Mesmo modelo de "★ Favoritos" (feature 013):

- `TrailKey` ganha `{ kind: 'search' }`; `EnteredKey` ganha
  `{ kind: 'search' }`. A trilha fica `[search, favorites, ...categorias]`.
- `defaultTrailIdx` = índice da primeira categoria real = número de
  entradas virtuais (2 fora do zapping; 1 dentro dele — ver §6).
- Entrar em "🔍 Buscar" (OK/→ na trilha): `entered = search`, `col = 1`,
  `searchTerm = ''` (FR-004 — sempre vazio numa entrada nova),
  `searchFieldFocused = true`, e **foco DOM real** no `<input
  className="search-field field-box">` (`ref.focus()`).
- Com a busca entrada, a lista de itens da tela passa a ser
  `search.items` — o MESMO render da lista/grade, virtualizador, foco por
  id, favoritar e abrir de sempre (FR-012/FR-017/FR-018). Não duplicar a
  grade.
- Cabeçalho da coluna de conteúdo em modo busca: o campo, e abaixo uma
  linha de status:
  - `belowMinimum` → `Digite pelo menos 3 letras`.
  - com resultados → `{N} resultado(s)` (`1 resultado` / `N resultados`).
  - sem resultados → estado vazio `Nenhum resultado para “{termo}”` com
    botão focável "Voltar ao campo" (FR-015 — SELECT ativa).
  - cobertura parcial (`covered < total`) → `Busca em {X} de {Y}
    categorias` (FR-014), junto de qualquer um dos anteriores.
- Live TV: cada linha de resultado mostra também
  `groupLabel(original_group)` num `<span className="live-item-group">` —
  só em modo busca (FR-011). Filmes/Séries já mostram a categoria em
  `.poster-card-meta`.

### Foco dentro da busca

| Onde | Tecla | Efeito |
| --- | --- | --- |
| campo | ↓ | 1º resultado (se houver); `input.blur()` |
| campo | Done do teclado Samsung (keyCode 65376) | 1º resultado (FR-016) |
| campo | RETURN | sai da busca → trilha (col 0), foco em "🔍 Buscar" (FR-020) |
| campo | ←/→/Backspace/espaço/Enter | com o campo (guarda §3) |
| resultado (1ª linha) | ↑ | volta ao campo, foco DOM nele |
| resultado | RETURN | volta ao campo, termo intacto (FR-020) |
| resultado | ← na 1ª coluna | trilha (col 0), igual à grade normal |
| resultado | OK / segurar OK / amarela | igual à grade normal (FR-017/FR-018) |

`canToggleFavorite` só vale com o foco num resultado, nunca no campo.

## 5. Restauração ao voltar do detalhe (Filmes/Séries) — FR-019

`App.tsx` desmonta a tela de categoria ao abrir o detalhe. Mecanismo:

1. `onOpenMovie(movieId, snapshot)` / `onOpenSeries(seriesId, snapshot)`:
   a tela monta um `CategoryScreenSnapshot`
   (`features/catalog/categoryScreenSnapshot.ts`, já criado) com
   `trailKey`, `entered`, `col`, `focusedItemId` e `searchTerm` — **vale
   para a grade normal também**, não só para a busca (fecha o bug de
   backlog "Voltar do detalhe pra grade não restaura foco nem posição").
2. `App.tsx`: ao ir para o detalhe, grava o snapshot **na entrada do
   histórico** da tela de origem
   (`history: [...s.history, { ...s.screen, restore: snapshot }]`); os
   tipos `{ name: 'movies' | 'series'; source; restore? }` ganham o campo.
3. `back()` já devolve essa entrada; a tela recebe `restore` e inicializa
   o estado a partir dele (`useState(() => restore?.x ?? padrão)`). Com
   `entered.kind === 'search'`, `searchFieldFocused = false` e o foco vai
   para `focusedItemId` nos resultados.
4. Reconciliação por identidade: categoria que não existe mais → cai no
   padrão; item que não está mais na lista → primeiro item (mesmo `locate`
   de hoje). A rolagem volta pelo `useVirtualFocusSync` já existente
   (rola até o índice do item focado).
5. O snapshot é opaco para o `App` e nunca é persistido fora da memória.

Live TV não precisa disto: o player é camada, `LiveScreen` nunca desmonta.

## 6. Zapping (feature 016) — sem busca

Com `zapOpen`, a trilha é `[favorites, ...categorias]` (sem "🔍 Buscar"),
e `defaultTrailIdx` = 1. Fora do zapping, `[search, favorites, ...]`.
Derivar `trail` de `zapOpen` basta — `categoryIdx` já indexa `trail`.
`openZapping()` continua reancorando na categoria do canal tocando
(inclusive quando o canal foi tocado pela busca; R-002 do plano).
