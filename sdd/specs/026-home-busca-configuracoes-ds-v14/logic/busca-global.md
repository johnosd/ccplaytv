# Lógica — Busca global

Feature `026-home-busca-configuracoes-ds-v14`, US3 (FR-035..FR-044).
Contrato travado: `tv-web/src/lib/catalog/globalSearch.home-busca-configuracoes-ds-v14.contract.test.ts`.

## 1. Motor (`tv-web/src/lib/catalog/globalSearch.ts`)

```ts
loadGlobalSearchIndex(sourceId, db) =
  Promise.all([loadSearchIndex(sourceId,'channel'), …'movie', …'series'])
  → { channel, movie, series }

searchGlobal(index, term):
  coverage = soma de coveredCategories/totalCategories dos três
  if normalizeForSearch(term).length < GLOBAL_SEARCH_MIN_CHARS (2):
    return { channels: [], movies: [], series: [], ...coverage }
  para cada tipo: searchWithinItems(index[tipo].entries.map(e => e.record), term, r => r.name)
  return { channels, movies, series, ...coverage }
```

- Reaproveita `normalizeForSearch`/`searchWithinItems` (feature 018) — mesma
  normalização (acentos, caixa, espaços) e ordenação (prefixo primeiro, cada
  grupo alfabético). **Não** muda `SEARCH_MIN_CHARS` (3) nem `searchIndex()`:
  são da busca por categoria e têm contrato travado na 017/018.
- `searchGlobal` é **pura** (índice pronto → resultado). Nada de rede,
  `ensureCategory` ou leitura de `storedEntries` (FR-037).
- "Coberta" segue `isCovered` de `catalogSearch.ts` (eager, ou já aberta).

## 2. Hook

`useGlobalSearchIndex(sourceId)` em `catalogApi.ts`, chave
`['global-search-index', sourceId]`, `staleTime: 0`, `refetchOnMount:
'always'` (mesmo padrão de `useAggregatedItems`: categorias abertas desde a
última vez entram na próxima busca). Termo → `useMemo(() => searchGlobal(index, term))`,
sem debounce (FR-039, clarificação).

## 3. Tela (`tv-web/src/features/search/SearchScreen.tsx`)

Sob `AppShell` + `TopBar currentItem="search"`. Conteúdo, de cima para baixo:

1. Linha `field`: `TextField purpose="search"` com rótulo permanente
   "Buscar nesta lista" + botão "Buscar por voz" (`ComingSoon`,
   `getComingSoon('voice-search')`).
2. Aviso de cobertura, sempre visível: "Busca em X de Y categorias" (texto
   real, X/Y de `searchGlobal`). Com X < Y, uma linha de apoio: "Abra outras
   categorias em TV ao vivo, Filmes ou Séries para incluí-las."
3. Resultados (só com termo ≥ 2): uma `Rail` por tipo **com resultado**, na
   ordem Canais, Filmes, Séries, com título "Canais (N)" etc.
4. Sem resultado (termo ≥ 2, três listas vazias): `EmptyState` "Nada
   encontrado para "{termo}"" com a descrição de cobertura e ação focável
   "Editar busca" (volta o foco ao campo) (FR-040).

## 4. Foco e teclado

Linhas: `field` (itens: campo, voz) → rails de resultado presentes → nada mais.

- Abrir a tela: foco no **campo**, teclado **não** abre sozinho (SELECT abre;
  IME da TV só com ação explícita, DS §37).
- SELECT no campo → `input.focus()` (abre o IME). Digitação passa pelo
  `useRemoteNav` graças à guarda de alvo editável (ADR-009, emenda da 017).
- Com o input focado (teclado aberto): RETURN/Escape → `input.blur()` (fecha
  o teclado) **e para aí** — não sai da tela (FR-036, RETURN em camadas).
  DOWN (ou Enter/Done do IME) → `blur()` e foco na primeira rail de
  resultado, se houver.
- Teclado fechado: UP na linha `field` → topbar ("Buscar"); DOWN/UP entre
  linhas; LEFT/RIGHT com clamp; RETURN → `onBack()` (FR-044).
- `TextField` ganha prop opcional `inputRef?: Ref<HTMLInputElement>`
  (aditivo; `TextField` não tem contrato travado).

## 5. Abrir resultado e voltar (FR-041, FR-042)

- Filme → `open` `movie-detail`; série → `open` `series-detail`; canal →
  `open` `live` com `initialChannel: { channelId, entry: 'category' }`
  (`logic/navegacao.md` §3).
- Em todos, `from: { name: 'search', restore: SearchSnapshot }`:

```ts
export interface SearchSnapshot {
  term: string
  focus: { row: 'field' } | { row: 'results'; kind: 'channel' | 'movie' | 'series'; itemId: string }
}
```

- Remontar com `restore`: termo reposto (sem reabrir o teclado), foco no
  resultado por **id**; id sumiu → mesmo tipo, índice clampado; tipo sumiu →
  `field`.
