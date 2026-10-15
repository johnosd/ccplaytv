# Lógica — fileira "Bem avaliados" (feature 056)

Regras que um executor poderia errar. Os testes de contrato travados (`vodShowcase.bem-avaliados.contract.test.ts`,
`VodShowcaseScreen.bem-avaliados.contract.test.tsx`) são a definição executável; este arquivo explica o porquê e o "como".

## 1. Quem entra e em que ordem (`vodShowcase.ts`)

> **SUPERADO (2026-10-04, R-011)**: `pickTopRated` e `topRated` foram **removidos**. A seleção vigente da fileira é `selectFeaturedRated` (§7). Ficam em `vodShowcase.ts` só `RATED_MIN`, `validProviderRating`, `compareByRating` e `finiteAddedAt`, que o §7 e o §2 reaproveitam. O texto abaixo é histórico.

Entrada: itens do tipo da seção já no aparelho. Nota válida = `typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 10`
(a mesma régua do `RatingBadge`; a normalização da 055 já tira `0`/lixo na importação, mas a função não confia nisso).

```ts
export const RATED_MIN = 5            // FR-003
// SHOWCASE_LIMIT = 12 (já existe)    // FR-002

/** Genérica para a mesma regra servir ao item de tela e ao registro de disco (D-003). */
export function pickTopRated<T>(
  items: Iterable<T>,
  read: { rating: (t: T) => unknown; addedAt: (t: T) => unknown },
  limit = SHOWCASE_LIMIT,
  min = RATED_MIN,
): { top: T[]; validCount: number }
// topRated(items) = pickTopRated(items, {rating: i => i.provider_rating, addedAt: i => i.added_at}).top, ou [] se validCount < min
```

- Ordem: nota **decrescente**; empate → `added_at` **decrescente** (mais recente primeiro); sem `added_at` (null/ausente/não
  finito) fica **depois** de quem tem data, entre notas iguais; empate total mantém a ordem de entrada (estável).
- Mesma técnica de `recentlyAdded`: buffer ordenado de tamanho `limit` com busca binária (O(n log limit)); nunca ordenar o
  catálogo inteiro. `validCount` conta **todos** os itens com nota válida (não só os do buffer) — é ele que decide o mínimo.
- `validCount < min` → `[]` (a fileira não existe). Nunca preencher com itens sem nota.
- Nunca muta a entrada.

## 2. Ordenação por nota da grade (`vodSort.ts`)

`sortVodItems(items, 'rating')`: nota desc.; empate → `added_at` desc. (ausência no fim do empate); itens **sem nota válida**
no fim, na **ordem da fonte** (sort estável). Reusar `withMissingLast` para a chave principal e um desempate composto — não
duplicar a regra de "ausente". Uma regra só: o comparador de `pickTopRated` e o de `'rating'` devem concordar (a grade do
"Ver tudo" começa pelos mesmos itens da fileira, na mesma ordem).

**`availableSortOptions` NÃO retorna `'rating'`** (FR-008). `'rating'` existe em `VodSortOption` só para o `target.sort` do
"Ver tudo".

## 3. Leitura dos dados (`catalogApi.ts` → `useTopRated`)

> **Nota (2026-10-04)**: a leitura (mesma `queryKey`/`queryFn`, `select` estável, mapear só os escolhidos) continua valendo; onde o texto diz `pickTopRated`, leia `selectFeaturedRated` (§7).

- Mesma `queryKey` e mesmo `queryFn` de `useRecentlyAdded`: `['catalog-search-index', sourceId, kind]` +
  `loadSearchIndex`. A pré-carga (038) já invalida `['catalog-search-index', sourceId]` quando uma categoria chega
  (`prefetchApi.ts:53`) → a fileira se atualiza sozinha (US3/AC3, FR-004). **Não** criar outra chave nem outro `queryFn`.
- `select` **estável** (função fora do render, ou `useCallback`): um `select` inline roda a cada render. Ele devolve
  `{ items, covered, total }`.
- Eficiência (SC-004): usar `pickTopRated` sobre `index.entries` lendo `entry.record.providerRating` /
  `entry.record.addedAt` e só então `toItemOut(record, kind)` nos ≤ 12 vencedores. **Não** mapear o catálogo inteiro para
  `CatalogItemOut` (43 mil filmes).
- `coveredCategories`/`totalCategories` vêm do próprio índice (`SearchIndex`), os mesmos usados por "Todos".
- Retorno: `{ data: CatalogItemOut[] | undefined; coveredCategories: number; totalCategories: number; isLoading: boolean }`.
  `kind === 'channel'` ou `sourceId === null` → query desabilitada (como `useRecentlyAdded`).

## 4. Fileira na tela (`vodShowcaseRows.ts`, `VodShowcaseScreen.tsx`)

- `buildShowcaseRows({... hasRated })`: se `hasRated`, insere
  `{ key:'rated', kind:'items', title:t('showcase.row.rated'), format:'poster', seeAll:{kind:'all', sort:'rating'}, slotId:null }`
  entre `added` e `because`; se não, **nenhuma** linha `rated` (e nenhum slot `vod-rated`). `hasRated` ausente = `false`.
- Tela: `const rated = useTopRated(sourceId, copy.kind)`; `hasRated: (rated.data?.length ?? 0) > 0`;
  `entriesOf` para `'rated'` → `itemEntries(rated.data)` (que já acrescenta o "Ver tudo"). Card = `ContentCard variant="portrait"`
  com `RatingBadge` (já é o caminho de `renderEntry`; **não** criar variante nova).
- Aviso de escopo (FR-014): no cabeçalho da fileira `rated`, enquanto `coveredCategories < totalCategories` (e `total > 0`),
  `<span className="vod-row-coverage">{t('showcase.ratedCoverage', {covered, total})}</span>`; completo → nada. Texto só
  informativo, **não focável** (`aria-hidden` não: é conteúdo legível; só sem `tabindex`).
- Fileira que some com o foco nela: `reconcileShowcaseFocus` (053) já leva o foco para vizinha válida; **não** mexer em
  `vodShowcaseFocus.ts`. Não pode haver estado em que `focusState.rowKey === 'rated'` e a fileira não exista sem reconciliar.
- Estado inicial do foco depende de haver cards elegíveis: fileira `rated` com itens conta como elegível como `added` conta.

## 5. "Ver tudo" → grade ordenada (`VodCategoryScreen.tsx`)

- `VodTarget {kind:'all', sort:'rating'}` entra como `sortOption` inicial (já funciona para `'added'`).
- Armadilha 1: `effectiveSortOption = availableOptions.includes(sortOption) ? sortOption : 'source'` rebaixaria `'rating'`
  para `'source'` (ele não está em `availableOptions`). Regra nova: `'rating'` vale quando `enteredAll` (qualquer outra
  entrada → `'source'`). `availableOptions` continua sem `'rating'`.
- Armadilha 2: `allProgressive = !searchActive && sortOption === 'source'`; com `'rating'` fica falso → "Todos" lê o tipo
  inteiro pelo índice (certo: ordenar por nota precisa do tipo inteiro; o aviso de cobertura de "Todos" já existe).
- Armadilha 3: o índice do foco no modal de Ordenar (`sortFocusIdx`) parte de `availableOptions.indexOf(effective)`;
  com `'rating'` dá `-1` → usar 0. O botão de Ordenar mostra "Ordenar | Nota ▾" (`vod.sort.rating`); abrir o modal lista as
  opções de sempre (sem "Nota") e escolher outra sai da nota (não dá para voltar a ela por ali — aceito, FR-008).
- A escolha não vai para `setSessionSort` (como `'added'` do "Ver tudo" de Adicionados, D-010 da 052): vale só nesta abertura.

## 6. O que NÃO fazer

- Não ler `get_vod_info`/TMDB para completar notas. Não misturar nota TMDB. Rótulo sempre "Provedor" onde há rótulo.
- Não ordenar `Todos`/categorias por nota fora do "Ver tudo" da fileira.
- Não persistir nada novo (sem tabela, sem migração, sem campo no `CatalogRecord`).
- Não mexer na ordem relativa das demais fileiras.

## 7. Refinamento de 2026-10-04 — seleção variada, recente e sem duplicatas (FR-015..FR-018)

Motivo: na TV a fileira trouxe filmes antigos; a sonda do painel real (43.161 filmes, 28.846 com nota) mostrou 255 filmes de nota
10,0 (quase sempre 1–2 votos, 88% de 2020+), topo cheio de duplicatas `[L]` e o mesmo conjunto a cada abertura.

A fileira usa **`selectFeaturedRated`** (em `features/vod/ratedSelection.ts`); o hook `useTopRated` chama só ele. A regra antiga
"maior nota" (§1, `topRated`/`pickTopRated`) foi removida na emenda R-011, e o contrato travado passou a cobrir esta função.

```ts
export const RATED_MIN_RATING = 6        // FR-015: piso
export const RATED_MAX_RATING = 10       // FR-015: exclusivo (10,0 fica de fora)
export const RECENT_YEARS = 10           // FR-016
export const RATED_POOL = 36             // melhores candidatos recentes entre os quais se sorteia (3 × limite)

export interface RatedFields<T> { id(t: T): string; name(t: T): string; rating(t: T): unknown; year(t: T): unknown; addedAt(t: T): unknown }
export function selectFeaturedRated<T>(
  items: Iterable<T>, read: RatedFields<T>,
  options: { now: number; seed: string; limit?: number; min?: number },   // limit = SHOWCASE_LIMIT, min = RATED_MIN
): { picked: T[]; eligibleCount: number }
```

Passos (puro, sem relógio global: `now` e `seed` entram por parâmetro):

1. **Elegível** = `RATED_MIN_RATING ≤ nota < RATED_MAX_RATING` (régua de `validProviderRating`) **e** ano inteiro conhecido (`1888 ≤ ano ≤ anoCorrente+1`).
   `eligibleCount` = quantos há (antes de deduplicar). `eligibleCount < min` ⇒ `picked = []` (fileira ausente, FR-003).
2. **Deduplicar versões** (FR-018): chave `titleKey(nome) + '|' + ano`; fica a de maior nota → ano → `added_at` mais recente → primeira da entrada.
   `titleKey`: minúsculas, sem acento (NFD), remove todo `[...]`, remove `(...)` cujo conteúdo é só qualidade/idioma
   (`4k uhd fhd hd sd hdr dual dublado dub legendado leg 1080p 720p 2160p`), remove essas palavras soltas, tudo que não é
   `a-z0-9` vira espaço, colapsa espaços. Nome que vira vazio usa o nome original normalizado.
3. **Recentes** = ano ≥ `anoCorrente − RECENT_YEARS` (anoCorrente = ano de `now`). Ordene por nota ↓, ano ↓, `added_at` ↓ (ausente depois) e
   tome os primeiros `RATED_POOL`. Se o pool tiver menos de `limit`, **complete (plano B)** com os demais elegíveis ordenados por
   ano ↓, nota ↓, `added_at` ↓ até `limit` (ou acabarem).
4. **Sorteio estável** (FR-017): se `pool.length > limit`, escolha os `limit` de **menor** `fnv1a32(seed + '|' + id)` (desempate por id).
   Isso é "amostragem por hash": mesma semente + mesmos dados ⇒ mesma escolha; um candidato novo só entra se tiver hash menor que algum escolhido.
5. **Ordem de exibição**: nota ↓, ano ↓, `added_at` ↓.

Semente: `` `${yyyy-mm-dd local}|${kind}|${sourceId}` `` — muda **uma vez por dia**; a lista e a seção diferem entre si. O hook calcula
`now = Date.now()` dentro do `select` estável (o `select` só reexecuta quando o índice muda, não a cada render).

O que **não** muda: `sortVodItems('rating')` e o "Ver tudo" (§2, §5) continuam ordenando a seção inteira por nota, **incluindo** 10,0 e antigos —
é a lista completa, não a vitrine. A cobertura parcial (aviso de escopo, FR-014) segue valendo.
