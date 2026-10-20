# Lógica: trabalho em fatias sem mudar o resultado (feature 084)

Regra-mãe: **o resultado é idêntico ao de hoje; só a forma de executar muda.** Toda fatia cede a vez à interface e
respeita o `AbortSignal`. Nenhuma tarefa passa de ~8 ms de trabalho medido no desktop (na TV, ~6–10× isso, ainda abaixo
de 100 ms).

## 1. Relógio de fatias (`src/lib/slices.ts`, novo)

```ts
export interface SliceOptions { signal?: AbortSignal; yieldToMain?: () => Promise<void>; budgetMs?: number }

// Cede quando o orçamento da fatia acabou. Antes e depois de ceder, confere o sinal.
export function createSliceClock(options: SliceOptions): {
  /** Cede se passou do orçamento; `force` cede sempre (ex.: fim de um bloco do catálogo). */
  maybeYield(force?: boolean): Promise<void>
  /** Lança `DOMException('…', 'AbortError')` se o sinal já foi abortado. */
  check(): void
}
// padrão: yieldToMain de `lib/metadata/discoveryRules.ts` (MessageChannel, sem o atraso de 4 ms do setTimeout); budgetMs 8.
// Depois de `await yieldToMain()`, chama `check()` de novo: abortar durante a cessão NÃO pode deixar o trabalho seguir.

export async function mapInSlices<T, R>(items: readonly T[], fn: (item: T) => R, clock): Promise<R[]>
// laço simples; a cada item, `clock.maybeYield()` só olha o relógio a cada ~256 itens (performance.now custa).

export async function stableSortInSlices<T>(items: readonly T[], compare: (a: T, b: T) => number, clock): Promise<T[]>
```

**`stableSortInSlices` DEVE ser estável e devolver exatamente `[...items].sort(compare)`.** `Array.prototype.sort` é
estável no alvo, e uma ordenação estável com o mesmo comparador consistente produz uma ordem única. Por isso um merge
sort estável dá o mesmo resultado. Implementação sugerida: merge sort de baixo para cima, com execuções iniciais de 32
por inserção estável, e merge que, **em empate (`compare === 0`), pega sempre da esquerda**. Cede entre fatias de
comparações. Nunca use `sort` nativo em pedaços e depois "junte": sem o merge estável a ordem muda.

## 2. Índice de busca em fatias (`loadSearchIndex`, `catalogSearch.ts`)

Mesmas regras de `listAllOfKind` (`repository/kindReads.ts:28`), na mesma ordem:

```text
generation = activeGenerationOf(sourceId); se nada → índice vazio, cobertura das categorias visíveis
access = getCategoryAccess(sourceId)
blocks = blocksOfKind(...).filter(não excluído).sort(groupOrder)      // mesma ordenação estável de hoje
rows   = query(...linhas do formato antigo...).filter(!access.isExcludedRecord)
para cada bloco, EM SEQUÊNCIA (não Promise.all: o paralelo junta tudo numa leva só):
    clock.check()
    registros = bloco.format === 2 ? await readHeaderChunks(db, bloco) : blockRecords(bloco)   // regra da 082
    compactos += await mapInSlices(registros, compactSearchRecord, clock)
    await clock.maybeYield(true)            // ≥ 1 cessão por bloco (o contrato conta ≥ 3 com 3 blocos/linhas visíveis)
se houver linhas antigas: compactar em fatias; mesclar com a MESMA regra de hoje
    (`[...records, ...rows].sort(groupOrder)`, estável) — use stableSortInSlices.
entries = em fatias, uma `LazySearchIndexEntry` por registro;
    se options.normalize: em fatias, aquece AS DUAS caches do nome normalizado:
      (a) o `normalizedName` da entrada; (b) o `WeakMap normalizedByItem` do registro (é por ele que
      `searchWithinItems`/`searchGlobal` filtram a cada tecla). Exponha um `warmNormalizedName(item, nameOf)`.
cobertura = listVisibleCategories (como hoje).
```

- **Cancelamento** (FR-008): a montagem cancelada rejeita com `AbortError` e **não cede mais vezes** (o contrato exige
  exatamente 1 cessão quando o sinal é abortado dentro da 1ª). Confira o sinal antes de ler o próximo bloco e logo
  depois de cada cessão.
- `listAllOfKind` continua existindo e o contrato o usa como referência. **Ajuste feito no execute (R-009)**: ganhou o 4º parâmetro opcional `clock` (sem ele o comportamento é o de antes), porque a fachada de `catalogRepository` não pode ganhar export novo (contrato 063); com `clock` lê um bloco por vez e, no formato 2, um pedaço de 500 itens por vez (`iterateHeaderChunks`).
- Cuidado: **nunca** leia `block.items` de um bloco `format === 2` (regra da 082 no CLAUDE.md).

## 3. "Todos": itens e ordenação

- `useAggregatedItems` (`catalogApi.ts`): a conversão `toItemOut` de todo o índice hoje roda num `useMemo` síncrono (43
  mil objetos numa tarefa). Mova para o `queryFn`, por um módulo novo `features/catalog/aggregatedIndex.ts`
  (`loadAggregatedItems(sourceId, kind, toItem, { signal })` → `{ items, coveredCategories, totalCategories }`), que usa
  `loadSearchIndex` + `mapInSlices` + aquecimento do nome normalizado **dos itens** em fatias (a busca dentro de "Todos"
  filtra os itens, não os registros). `toItemOut` fica onde está e é passado como parâmetro, porque importar de
  `catalogApi` criaria ciclo.
- `sortVodItemsInSlices` (`vodSort.ts`): **um único `comparatorFor(option)`**, usado também por `sortVodItems`, para as
  duas nunca divergirem. A versão em fatias é `stableSortInSlices(items, comparatorFor(option), clock)`; `source`
  devolve uma cópia.
- `VodCategoryScreen` está no teto de linhas (949). A filtragem + `availableSortOptions` + `effectiveSortOption` + ordenação
  saem para um hook novo `features/vod/useVodListItems.ts`:
  - lista com até `SYNC_SORT_MAX` (2 000) itens: síncrona, como hoje (sem piscar o carregando);
  - acima: `sortVodItemsInSlices` com um `AbortController` por entrada (mudou a lista, a opção ou o termo → aborta a
    anterior);
  - enquanto ordena, mantém o resultado anterior **da mesma entrada** (`entryKey`), senão `[]` com `pending: true`, que
    soma ao estado de carregando da tela (tem elemento focável, FR-009);
  - o foco continua por id (`focusedItemId` + `locateOrNeighbor`), sem mudança (FR-010).
- A busca por termo dentro de "Todos" (`searchWithinItems`) continua síncrona. Com os nomes já aquecidos, filtrar ~43 mil
  custa ~15 ms na TV.

## 4. Remontagem limitada durante a pré-carga (`prefetchApi.ts`, FR-006)

No `flush` de `createPrefetchInvalidator`:
- **Chaves do índice**: `['global-search-index', sourceId]` e `['catalog-search-index', sourceId, kind]` (exatamente 3
  elementos). Marque como velhas **sem reler** (`refetchType: 'none'`). Depois, por chave:
  - se a última remontagem dessa chave foi há ≥ `refreshMs` → `refetchQueries({ queryKey, exact: true, type: 'active' })`
    agora (borda de entrada: o 1º lote remonta na hora);
  - senão, agenda **uma** remontagem para `última + refreshMs`. Lotes no meio da janela só confirmam que há algo novo; se
    nada novo chegou desde a última remontagem, o fim da janela não remonta.
- **Demais chaves** sob `catalog-search-index` (vitrine: `[…, kind, 'showcase', …]`) seguem como hoje: invalidar
  normalmente. Use `predicate` para separar.
- `dispose()` cancela os timers pendentes.
- **Não mexa** em `categoryAccessApi.ts` nem em `App.tsx`: esconder/bloquear categoria (FR-007) e o fim de uma
  sincronização continuam invalidando na hora.
- Os testes existentes (`prefetchApi.test.ts`, contrato da 065) usam um lote só e esperam 1 releitura: a borda de entrada
  os mantém verdes.
