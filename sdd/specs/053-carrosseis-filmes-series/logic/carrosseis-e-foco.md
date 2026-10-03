# Lógica: fileiras, foco, prévia por categoria e lista recolhível (feature 053)

Delimita o "como" onde o executor poderia errar. Contratos: `vodShowcaseRows.*.contract.test.ts` (§1), `vodShowcaseFocus.*.contract.test.ts` (§2), `VodShowcaseScreen.carrosseis-filmes-series.contract.test.tsx` (§3–§6). Base: `sdd/specs/052-vitrine-filmes-series/logic/vitrine-e-foco.md` (a tela hero de hoje) — esta feature a **generaliza**, não a reescreve do zero.

## 1. `buildShowcaseRows` (função pura, `vodShowcaseRows.ts`)

Entrada: `section`, `hasContinue/hasFavorites/hasAdded`, `categoryNames` (nomes declarados, ordem da fonte). Saída: `ShowcaseRowSpec[]` na ordem **fixa**:

```
continue?  → top10 (slot, sempre) → favorites? → added? → rated (slot) → because (slot) → cat:<nome> × N
```

| key | kind | title | format | seeAll | slotId |
| --- | --- | --- | --- | --- | --- |
| `continue` | items | Continue assistindo | `poster-xl` (ou `poster` se `favorites` assumiu o destaque) | `{kind:'history'}` | — |
| `top10` | slot | `Top 10 filmes da semana` / `Top 10 séries da semana` (por `section`) | `top10` | — | `vod-top10-movies` / `vod-top10-series` |
| `favorites` | items | ★ Favoritos | `poster-xl` **se não há `continue`**, senão `poster` | `{kind:'favorites'}` | — |
| `added` | items | Adicionados recentemente | `poster` | `{kind:'all', sort:'added'}` | — |
| `rated` | slot | Bem avaliados | `poster` | — | `vod-rated` |
| `because` | slot | Porque você assistiu | `poster` | — | `vod-because` |
| `cat:<groupLabel(nome)>` | category | `vodGroupDisplay(nome)` | `poster-compact` | `{kind:'category', name: groupLabel(nome)}` | — |

- **Chave e destino da categoria usam `groupLabel(nome)`** (o nome declarado normalizado); só o **título** passa por `vodGroupDisplay` (tira "Filmes |"). Nome repetido (mesmo `groupLabel`) → **só a primeira** vira fileira (chave duplicada quebraria o foco).
- Os 3 slots e as categorias **existem sempre**; as 3 fileiras de itens só com dado real (`has*`).
- `rated`/`because` são "reservadas": `seeAll: null`, `slotId` registrado em `lib/comingSoon.ts` (T010).
- `ShowcaseRowKey` é a chave de identidade da fileira (foco, restauração); nunca índice.

## 2. Foco (funções puras, `vodShowcaseFocus.ts`)

Estado: `{ rowKey, memory: Record<rowKey, {id, index}> }`. **A lista lateral não é fileira**: `null` = "foco na lista lateral" e quem decide é a tela.

- **Elegível** para foco inicial: fileira `items` com ≥ 1 item real, ou `category` com ≥ 1 item real (entradas além de `SEE_ALL_ID`). Slot **nunca** é a entrada inicial (cai num "Em breve" ao abrir seria beco estético); categoria pendente (só `SEE_ALL_ID`) também não.
- `initialShowcaseFocus(rows, entryIdsOf, restore?)`: sem `restore` → 1ª fileira elegível, 1º cartão; nenhuma elegível → `null`. Com `restore {row, id}`: fileira existe → ela, memória `{id, index: posição do id, ou 0}`; não existe → 1ª elegível (ou `null`). `restore.row === 'categories'` (lista lateral) a tela trata antes, sem chamar esta função.
- `moveShowcaseVertical`: vai à fileira vizinha **em `rows`** (slots e categorias pendentes **entram** no percurso: têm 1 cartão focável), no cartão **lembrado** daquela fileira (primeira visita = 1º cartão). Pulando fileira sem nenhuma entrada (não deve existir, mas proteja). ↑ da 1ª → `'top'`; ↓ da última → `null`.
- `moveShowcaseHorizontal`: `index ± 1` com clamp **sem wrap**; já na borda → `null` (← no 1º cartão: a tela vai à lista lateral; → no último: nada). Grava memória.
- `reconcileShowcaseFocus(state, rows, entryIdsOf)`: (a) fileira focada ainda existe → mantém; id sumiu → **mesmo índice clampado na mesma fileira** (`memory.index`); (b) fileira sumiu → 1ª elegível de `rows`, ou `null`. Memórias de outras fileiras que perderam o id seguem a regra (a) quando visitadas.
- `focusedEntryId`: id da memória da fileira focada se ainda estiver em `entryIdsOf`, senão o índice clampado, senão o 1º; fileira sem entradas → `null`.
- **Nunca derive identidade de índice** (constitution); o índice é só dica de vizinho.

### Tela: composição

```ts
const rows = buildShowcaseRows({...})                      // §1
const entryIdsOf = (key) => entriesOf(key).map(e => e.id)  // itens/ver-tudo/slot, ver §3–§4
const [side, setSide] = useState(restore?.row === 'categories' || initial === null)   // foco na lista lateral
const [focus, setFocus] = useState(initialShowcaseFocus(rows, entryIdsOf, restore))
// a cada render: focus = reconcileShowcaseFocus(focus, rows, entryIdsOf) ?? (side)
```

Teclas na tela: ↑/↓ → `moveShowcaseVertical` (`'top'` → `goToTopbar()`); ←/→ → `moveShowcaseHorizontal` (`null` em ← → lista lateral); OK → item abre detalhe, `SEE_ALL_ID` abre `row.seeAll`, **slot não abre nada** (só `ComingSoon` anuncia). `VodShowcaseFocus` devolvido = `{ row: rowKey, id }` do cartão **no instante do OK** (para `row = side list` continua `'categories'`).

## 3. Entradas de cada fileira (`entriesOf`)

- `items` (continue/favorites/added): como na 052 — até `SHOWCASE_LIMIT` itens + `SEE_ALL_ID` quando houver itens.
- `slot`: **uma só entrada** `SLOT_ENTRY_ID`; renderiza `.vod-slot-card` (`aria-disabled="true"`, `is-soft-disabled`, "Em breve" + mensagem de `getComingSoon(slotId)`) seguido de cartões fantasma **decorativos** (`aria-hidden`, não focáveis) no formato final da fileira (10 no `top10` com o número grande, 6 nas demais). Os números 1–10 são só layout, nunca dado.
- `category`: da `CategoryPreview` da janela (§4): `ready` → itens (até `PREVIEW_LIMIT`=12) + `SEE_ALL_ID`; `pending`/`empty`/fora da janela → só `SEE_ALL_ID` (cabeçalho com "Ver tudo" focável), com `aria-busy` e esqueleto enquanto `pending`. **Nunca inventa cartão.**

## 4. Prévia por categoria, só do aparelho (`useCategoryPreviews`)

- **Janela**: fileiras de categoria de `focusRowIndex − 1` a `focusRowIndex + 3` (a fileira focada ± o que cabe na tela). Só elas são consultadas — o carrossel é "obtido ao se aproximar", **nunca ao focar um card** e sem rede nova.
- `useCategoryPreviews(sourceId, categories)` → `useQueries` com chave `['category-preview', sourceId, category.id]`; `queryFn`: `getActiveCategoryBlock(sourceId, category.id)`; com bloco → `status: items.length ? 'ready' : 'empty'`, `items = block.items.slice(0, PREVIEW_LIMIT).map(blockItemOut(...))`; sem bloco → `listChannels(..., 0, PREVIEW_LIMIT, kind)` (formato antigo); sem nada → `pending`. **Proibido** `ensureCategory`, `fetch` e qualquer escrita.
- Categoria `pending` na janela → `prioritizeCategory(category.id)` (debounce 300 ms, como `useCategoryFocusPrefetch`; a pré-carga 038 já limita concorrência). Quando a categoria chega, `createPrefetchInvalidator` invalida a prévia (T008: acrescentar a chave) e o carrossel preenche sozinho.
- `usePrefetchHint(kind, focusedCategoryId)` e `useCategoryFocusPrefetch` da 052/E-5 **continuam**, agora aplicados à categoria da fileira focada **e** à da lista lateral.

## 5. Lista lateral recolhível

- Estado `collapsed` por seção, lido de `vodShowcasePrefs.ts` (`localStorage`, chave por seção, **try/catch** em toda leitura/escrita; ausência/erro = expandida). A tela renderiza `.vod-side-panel` + `is-collapsed`.
- Teclas: com o foco na lista lateral, **← alterna** (expandida → recolhe; recolhida → expande); → vai às fileiras (como hoje); o foco permanece na mesma entrada. ← no 1º cartão de uma fileira vai à lista lateral (como hoje).
- Recolhida: `SideCategoryNav` recebe `collapsed` (opt-in; Live/Configurações não passam) → classe `side-category-nav--collapsed`; as entradas e o texto **continuam no DOM** (o rótulo some só por CSS/`sr-only`), o tile mostra a inicial/ícone (★, ↺, ∞/"T", inicial do nome). Largura via token (≈ 96 px).
- Dica sem foco: o cabeçalho do painel mostra "◀ Recolher" / "▶" (texto/ícone decorativo, não focável).

## 6. Fileiras verticais virtualizadas

- Com centenas de categorias, o contêiner `.vod-showcase-rows` usa `useVirtualizer` **vertical** com altura **fixa por formato** (`ROW_HEIGHT[format]` = título + trilho; sem medição) e `useVirtualFocusSync({ focusedIndex: rowIndex, scrollToIndex })` para manter a fileira focada montada e à vista.
- Cada fileira usa `Rail` com `itemWidth/itemHeight` do formato (`vodRowFormats.ts`, **uma** tabela de números; o CSS lê as mesmas medidas por variáveis inline `--vod-card-w`/`--vod-card-h`, sem literal duplicado).
- Medidas iniciais (a validar no E2E em 1920×1080 e 2200×1000; se faltar altura, comprimir o hero antes de encolher card): `poster-xl` item 324×440 (card 300), `poster` 284×383 (card 260, o de hoje), `poster-compact` 224×300 (card 200), `top10` 360×300 (número 140 + pôster 200), `wide` 424×240 (card 400, backdrop).
- `wide`: **só** quando **todos** os itens mostrados da fileira `continue` têm backdrop já guardado no cache de metadata (`titleMetadata.backdropUrl`, leitura local, **sem consulta nova**); senão `poster-xl`. Hoje isso quase nunca vale — é o desenho correto até existir backdrop em lote (fora de escopo).

## 7. Hero

Igual à 052 (card focado → capa/título/metadados reais; categoria da lista lateral → nome e contagem). Cartão `SEE_ALL_ID` mantém o último item da fileira; **slot** focado mostra o hero do último item focado (nunca placeholder rotulado, nunca "Top 10" inventado). O hero compacta se a nova pilha precisar de altura.
