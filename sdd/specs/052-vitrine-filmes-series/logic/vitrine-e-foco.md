# Lógica: vitrine, foco, "Ver tudo" e navegação (feature 052)

Delimita o "como" onde o executor poderia errar. Contratos: `VodShowcaseScreen.*.contract.test.tsx`, `VodCategoryScreen.*.contract.test.tsx`, `vodShowcase.*.contract.test.ts`.

## 1. Mapa de foco da vitrine

Estado: `row: VodShowcaseRow` + um `useIdFocus` por fileira (ids estáveis). Fileiras existentes, em ordem fixa `['continue','favorites','added','categories']`, filtradas por "tem itens" (`categories` sempre).

```ts
type Entry<T> = { id: string; entry: T }

const continueEntries  = history.slice(0, SHOWCASE_LIMIT).map(i => ({ id: i.id, entry: item(i) }))
                         .concat(history.length ? [{ id: SEE_ALL_ID, entry: seeAll('history') }] : [])
const favoritesEntries = fav.slice(0, SHOWCASE_LIMIT) ... seeAll('favorites')
const addedEntries     = added /* já ≤ 12 por recentlyAdded */ ... seeAll('all-added')
const categoryEntries  = [fav-card, history-card, all-card, ...categories.map(c => card(`cat:${groupLabel(c.name)}`))]
```

- `moveRow('up'|'down')`: índice na lista de fileiras existentes; ↑ da primeira → `shell` ? sai para a topbar : nada; ↓ da última → nada. **Sem salto diagonal** (Spec §33): ao trocar de fileira, o foco vai ao cartão **lembrado** daquela fileira (`useIdFocus`); primeira visita = 1º cartão.
- `← →` dentro da fileira: `moveTo(index ± 1)` com clamp (sem wrap).
- OK: item → `onOpenItem(item.id, focusNow())`; `SEE_ALL_ID` → `onOpenTarget(seeAllTarget(row), focusNow())`; cartão de categoria → `onOpenTarget(targetOf(card), focusNow())`.
- `focusNow()` = `{ row, id }` do cartão em foco **no instante do OK** (nunca derivado de índice).
- RETURN → `onBack`. (A vitrine é raiz do destino; o `App` decide para onde volta.)

`seeAllTarget`: `continue → { kind: 'history' }`, `favorites → { kind: 'favorites' }`, `added → { kind: 'all', sort: 'added' }`.
`targetOf(card)`: `favorites|history|all` pelas três entradas fixas; categoria → `{ kind: 'category', name: <nome declarado, sem prefixo removido> }` (a exibição usa `vodGroupDisplay`; a identidade usa `groupLabel`).

### Restaurar (`restore?: VodShowcaseFocus`)

```ts
function initialRow(restore, existingRows): Row {
  if (!restore) return existingRows[0]                       // 1ª com itens, ou 'categories'
  if (existingRows.includes(restore.row)) return restore.row
  // fileira sumiu: a anterior existente na ordem fixa; senão a primeira
  for (let i = ORDER.indexOf(restore.row) - 1; i >= 0; i--) if (existingRows.includes(ORDER[i])) return ORDER[i]
  return existingRows[0]
}
// por fileira: useIdFocus(entries, restore.row === row ? restore.id : null)
// id que sumiu → mesmo índice clampado NA MESMA fileira (comportamento do useIdFocus)
```

O `row` efetivo é recalculado a cada render como na Home (`effectiveRow`): se a fileira em foco deixa de existir (ex.: o último favorito saiu), cai na anterior existente — o foco nunca some.

## 2. `recentlyAdded(items, limit = 12)`

- Filtra `added_at != null` (número finito). Item sem data **fica de fora**.
- Seleção top-N sem ordenar tudo: mantenha um buffer ordenado de tamanho `limit`; insira por data desc **estável** (empate: quem veio primeiro fica na frente). O(n log limit).
- Não muta `items`. `limit <= 0` → `[]`.
- `useRecentlyAdded`: `useQuery(['recently-added', sourceId, kind], async () => recentlyAdded((await loadSearchIndex(sourceId, kind)).entries.map(e => toItemOut(e.record, kind)))`, `enabled: sourceId !== null`, `staleTime` curto. Não chama rede. Retorna `{ data, isLoading }`.

## 3. Hero

```ts
const focused = focusedCard()  // card em foco na fileira ativa
if (focused.kind === 'item')      hero = itemHero(focused.item)     // capa, título, metadados reais (como 050), rótulo por fileira
else if (focused.kind === 'category') hero = { eyebrow: 'CATEGORIA', title: vodGroupDisplay(name), meta: count !== undefined ? `${count} títulos` : null, art: undefined }
else /* ver tudo */               hero = lastItemHero ?? categoryHero  // mantém o último; nunca placeholder rotulado
```

Rótulo do item: fileira `favorites` → `★ SEUS FAVORITOS`; `continue` → `↺ VISTOS RECENTEMENTE`; `added`/outros → `CCPLAY CINEMA` / `CCPLAY SÉRIES` por `section`. Metadados: exatamente os da 050 (ano, grupo, "Assistido"/"Continuar de mm:ss"/"Em dia"/"n/m"). **Nenhum** botão; `aria-hidden`; nada dispara ao focar.

## 4. Tela de categoria — o que muda em relação ao `VodCatalogScreen`

Entrada: `target` (D-003). Mapeamento para o que a tela já sabe fazer:

| `target` | Equivale hoje a | Notas |
| --- | --- | --- |
| `{ kind: 'category', name }` | `entered = { kind: 'category', id }` | resolver `name → category` em `useCategoryList` (`groupLabel(c.name) === name`); sem match → estado vazio "Esta categoria está vazia." com ação focável |
| `{ kind: 'favorites' }` | `enteredFavorites` | sem Ordenar; ordem própria |
| `{ kind: 'history' }` | `enteredHistory` | sem Ordenar; remoção do histórico mantida |
| `{ kind: 'all', sort? }` | `enteredAll` | busca agregada, cobertura parcial; `sort` = ordenação inicial desta abertura |

- Sem `col`/trilha: o foco de estado é sempre na grade ou na toolbar (`toolbarFocus`). Foco inicial: `restore.focusedItemId` → senão `recalledFocus(sourceId, section, entryKey)` (`vodSessionMemory`, **inalterada**) → senão o 1º item.
- `↑` na 1ª linha → toolbar (Pesquisar) → `↑` → topbar (se `shell`); `←` na 1ª coluna: hoje volta à trilha (049/025); sem trilha, **não faz nada** (RETURN é o caminho de volta — o contrato 049 amendado cobre isso); a regra de `→`/`←` por cartão e o salto de página da 049 dentro da grade ficam como estão; RETURN com busca aberta fecha a busca; senão `onBack`.
- `onOpenItem(itemId, restore)`: `restore = { focusedItemId, searchTerm, searchActive, focusedIndexHint }` (reconciliação por id; índice só como dica).
- `target.sort`: se presente e válida (`availableSortOptions` inclui), inicia a ordenação com ela **sem** chamar `setSessionSort`.

## 5. `appNav` (D-002)

```ts
{ name: 'movies' | 'series'; restore?: VodShowcaseFocus; topbarFocus?: TopbarItem }                 // vitrine
{ name: 'movies-category' | 'series-category'; target: VodTarget; restore?: VodCategoryRestore; topbarFocus?: TopbarItem }
```

- Vitrine → categoria: `dispatch({ type: 'open', screen: { name: 'movies-category', target }, from: { ...screen, restore: focus } })`.
- Categoria → detalhe: `from: { ...screen, restore: categoryRestore }` (como hoje, só muda o tipo do `restore`).
- Início "Filmes (N)": `open` de `*-category` com `target: { kind: 'favorites' }` e `from: home com foco` (RETURN volta ao Início).
- `switch-top` da categoria/vitrine para outro destino de topo: inalterado (troca sem empilhar).
- Os tipos antigos (`openFavorites`, `CategoryScreenSnapshot` com trilha, `FAVORITES_SNAPSHOT`) saem junto com a tela antiga; busca global (`searchSnapshot`) continua abrindo detalhes e **não** passa pela vitrine.

## 6. Geometria (medida, não suposta)

- Vitrine: hero (176px de referência) + fileiras; cada fileira de itens = título (`--fs-h2`) + `Rail` de 205×370; categorias = cartões de texto de altura menor. A pilha rola (bloco da fileira focada em vista, folga do anel igual à da Home).
- Categoria: `grid.height ≥ 2 × (poster 302 + ROW_EXTRA 68)` com `safe-y` atual; o E2E imprime `grade Npx; linhas em …; M colunas` (modelo: o script de 050). Se faltar: (1) junta rótulo+contagem na linha da toolbar (remove a linha de chips); (2) reduz folgas verticais; **nunca** o card < 205px nem recorte.

## Atualização (2026-10-03) — o que mudou depois do plano

Ver `spec.md` → "Emendas pós-execução" e `plan.md` D-015..D-018. Resumo para quem lê o §1 (mapa de foco): as **categorias saíram das fileiras** e viraram a **lista lateral**. Foco da vitrine hoje: lista lateral (`categories`) + fileiras de itens; ↑/↓ andam na lista ou entre fileiras (↑ do 1º item/da 1ª fileira sobe à topbar); ← no 1º cartão de uma fileira vai à lista; → da lista vai à última fileira de itens; sem fileiras com dado o foco inicial é a lista. `VodShowcaseFocus { row, id }` continua (`row` ∈ `continue | favorites | added | categories`).
