# Lógica: busca por categoria, ícone de entrada e "Todos"

Contrato do "como" para a feature `018-busca-por-categoria`. Substitui, nas
três telas (`LiveScreen.tsx`, `MoviesScreen.tsx`, `SeriesScreen.tsx`), o
mecanismo de busca da feature `017-busca-local-catalogo` (entrada "🔍
Buscar" na trilha, escopo por tipo inteiro).

## §1. Estado por tela

```ts
type TrailKey = { kind: 'favorites' } | { kind: 'all' } | { kind: 'category'; name: string }
type EnteredKey = { kind: 'favorites' } | { kind: 'all' } | { kind: 'category'; id: number }

// Trilha: sempre 2 entradas virtuais fixas + categorias reais, em toda
// seção — incluindo o zapping do Live TV (D-009). "🔍 Buscar" não existe
// mais como entrada.
const trail: TrailEntry[] = [
  { key: { kind: 'favorites' } },
  { key: { kind: 'all' } },
  ...categories.map((c) => ({ key: { kind: 'category', name: groupLabel(c.name) }, category: c })),
]
const VIRTUAL_TRAIL_COUNT = 2 // constante — não depende mais de zapOpen (D-001/D-009)

// Estado por ENTRADA (reseta sempre que `entered` muda — D-002):
const [entered, setEntered] = useState<EnteredKey | null>(restore?.entered ?? null)
const [searchActive, setSearchActive] = useState(false)      // campo aberto? (D-002)
const [searchTerm, setSearchTerm] = useState(restore?.searchTerm ?? '')
const [topFocused, setTopFocused] = useState(false)           // foco no ícone/campo, não num item (D-003)
```

`enterCategory`/`enterFavorites`/`enterAll` (nova) DEVEM, ao trocar de
`entered`, sempre resetar `searchActive = false`, `searchTerm = ''` e
`topFocused = false` — igual ao reset de foco no primeiro item que já
existia (FR-008).

## §2. Origem dos itens por entrada

```ts
// Categoria real: como já era (content.data.items).
// Favoritos: como já era (favoritesContent.data.items).
// "Todos" (nova): agregação de todas as categorias do tipo já cobertas.
const aggregated = useAggregatedItems(sourceId, kind, entered?.kind === 'all')
// aggregated: { items: CatalogItemOut[], coveredCategories, totalCategories, isLoading }

const baseItems = entered?.kind === 'category' ? (content.data?.items ?? [])
  : entered?.kind === 'favorites' ? (favoritesContent.data?.items ?? [])
  : entered?.kind === 'all' ? aggregated.items
  : []

const belowMinimum = normalizeForSearch(searchTerm).length < SEARCH_MIN_CHARS

// Itens de fato exibidos na coluna de conteúdo — D-004/D-005:
const items = !searchActive
  ? baseItems                                                  // sem busca: mostra tudo, como sempre
  : belowMinimum
    ? []                                                        // busca ativa, termo curto: nada (mensagem "digite N letras")
    : searchWithinItems(baseItems, searchTerm, (i) => i.name)   // busca ativa, termo válido: filtra + ordena
```

`searchWithinItems` é local ao array já carregado — nunca uma nova leitura
de rede/banco por tecla (FR-005/FR-019). Cobertura (`coveredCategories`/
`totalCategories`) só existe e só é exibida dentro de "Todos" (FR-010/
FR-011) — vem de `aggregated`, não muda com o termo digitado.

**Sem debounce**: diferente da feature 017 (que usava `useDebouncedValue`
para não reler o índice a cada tecla), aqui o filtro roda direto a cada
tecla, sem atraso — é um `.filter()`/`.sort()` síncrono sobre um array já
em memória (nenhuma leitura nova), barato mesmo em milhares de itens.
`useDebouncedValue` não é usado por esta feature.

## §3. Navegação — ícone/campo (topo) ↔ itens

Generaliza a tabela de foco da feature 017 (antes só existia em modo
busca; agora existe sempre que a entrada tem itens).

| Estado | ↑ (no primeiro item/1ª linha) | ↓ (no topo) | SELECT no topo | RETURN no topo | RETURN num item/resultado |
| --- | --- | --- | --- | --- | --- |
| `!searchActive`, itens > 0 | `topFocused = true` (foco no ícone) | (n/a, já não há topo abaixo) | abre a busca: `searchActive = true`, `searchTerm=''`, mantém `topFocused=true` (foco DOM vai pro campo) | sai da entrada → `col = 0` (trilha) | sai da entrada → `col = 0` (trilha) — comportamento padrão, sem busca envolvida |
| `searchActive` | `topFocused = true` (foco no campo) | `topFocused = false`, foco no 1º resultado (se `items.length > 0`) | SELECT no campo é passthrough do `<input>` nativo (guarda de alvo editável, ADR-009) — nunca chega aqui | fecha a busca: `searchActive = false`, `searchTerm = ''`, mantém `topFocused = true` (foco volta ao ícone) | volta ao campo: `topFocused = true` |

`topFocused` só é alcançável quando `items.length > 0` no modo sem busca
(D-006) — categoria vazia/carregando/com erro nunca mostra o ícone, e o
foco cai no elemento próprio desses estados (igual ao que já existia).

Tecla "Done" do teclado do sistema (`keyCode 65376`) no campo tem o mesmo
efeito de ↓ a partir dele (mesma regra da feature 017).

## §4. "Todos" — comportamento específico

- Entrar em "Todos" (`enterAll`) sempre mostra `aggregated.items` (todos os
  itens já cobertos, de todas as categorias do tipo) — igual à navegação
  normal de uma categoria, sem precisar buscar (US2 AC1).
- Ordenação de `aggregated.items` sem busca ativa: alfabética simples (não
  há "prefixo do termo" sem termo) — decisão técnica, sem requisito da
  spec sobre isso.
- O aviso de cobertura (`coveredCategories < totalCategories`) aparece
  **sempre** que "Todos" estiver entrada, buscando ou não (FR-010,
  Assumption da spec) — nunca em categoria real ou Favoritos (FR-011).
- Um item presente em mais de uma categoria aparece uma vez por categoria
  de origem dentro de `aggregated.items` (FR-013) — mesma regra de
  `loadSearchIndex`/`listAllOfKind` já usada pela 017, sem mudança.

## §5. Snapshot (voltar do detalhe) — Filmes/Séries

`CategoryScreenSnapshot` (feature 017, reaproveitado — D-007):

```ts
export type SnapshotTrailKey = { kind: 'favorites' } | { kind: 'all' } | { kind: 'category'; name: string }
  // | { kind: 'search' } — mantido só até a fase de Polish remover (D-007/D-010)
export type SnapshotEntered = { kind: 'favorites' } | { kind: 'all' } | { kind: 'category'; id: number }
  // | { kind: 'search' } — idem

export interface CategoryScreenSnapshot {
  trailKey: SnapshotTrailKey | null
  entered: SnapshotEntered | null
  col: 0 | 1
  focusedItemId: string | null
  searchTerm: string
  searchActive: boolean   // novo — se o campo estava aberto ao abrir o detalhe
}
```

`onOpenMovie`/`onOpenSeries` continuam montando o snapshot em `onSelect`,
igual a hoje; a tela, ao remontar com `restore`, inicializa `searchActive`
a partir dele (`useState(restore?.searchActive ?? false)`), além do que já
inicializava. O mecanismo de gravação em `App.tsx` (entrada de histórico da
tela de origem) não muda.

## §6. Zapping (Live TV, feature 016) — D-009

A trilha usada dentro do zapping (sobreposta ao vídeo) é a MESMA função
`trail` de §1 — "Todos" aparece nela como categoria navegável comum
(trocar de canal por ela funciona igual a qualquer categoria). O ícone de
busca continua fora do zapping: a tela nunca renderiza o ícone/campo
quando `zapOpen === true` (FR-018), independente da entrada focada.

## §7. Helpers novos (`catalogSearch.ts`)

```ts
/**
 * Filtra e ordena por termo — prefixo primeiro, resto depois, cada grupo
 * alfabético (FR-012). SEMPRE aplica o filtro (não decide sozinho se deve
 * rodar); quem chama decide quando usar isto vs. mostrar a lista sem
 * filtro (ver §2). Genérica: qualquer tipo com um nome extraível.
 */
export function searchWithinItems<T>(items: T[], term: string, nameOf: (item: T) => string): T[]
```

`searchIndex(index, term)` (feature 017) é MANTIDA com a mesma assinatura
pública — o teste de contrato antigo da 017
(`catalogSearch.contract.test.ts`) continua passando sem mudança — mas
reescrita por baixo como um wrapper fino sobre `searchWithinItems`, para
não duplicar a regra de ordenação em dois lugares:

```ts
export function searchIndex(index: SearchIndex, term: string): CatalogRecord[] {
  return searchWithinItems(index.entries, term, (e) => e.normalizedName).map((e) => e.record)
}
```

`catalogApi.ts`:

```ts
export interface AggregatedItems {
  items: CatalogItemOut[]
  coveredCategories: number
  totalCategories: number
  isLoading: boolean
}

/**
 * Todos os itens do tipo já lidos no aparelho (de todas as categorias já
 * cobertas), sem filtro — usado só por "Todos" (D-005). Reaproveita
 * `loadSearchIndex` (mesma leitura da feature 017), mas devolve TODOS os
 * registros, nunca um subconjunto filtrado por termo.
 */
export function useAggregatedItems(sourceId: string | null, kind: FavoritableKind, enabled: boolean): AggregatedItems
```
