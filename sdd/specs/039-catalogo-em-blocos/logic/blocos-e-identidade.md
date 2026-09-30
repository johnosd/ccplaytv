# Lógica — Blocos por categoria, identidade e leitura com reserva

Cobre FR-001 a FR-014. Código: `tv-web/src/lib/catalog/categoryBlocks.ts` (novo)
e `catalogRepository.ts` (as funções públicas mantêm nome e assinatura).

## 1. Por que manter a API do repositório

Todo o app lê itens por `catalogRepository.ts` (`listChannels`, `countChannels`,
`getChannel`, `listAllOfKind`, `resolveFavorites`, `resolveContinueWatching`) e
por `homeHero.ts` (uma consulta direta a `channels`). **Dez testes travados de
outras features** (017/025/026/032/033/035/036) gravam itens direto em
`database.channels.add(...)` e depois chamam essas funções. Então:

- os nomes e assinaturas públicas **não mudam**;
- o formato antigo (linhas em `channels`) **continua legível** como reserva —
  é ao mesmo tempo o que mantém esses testes verdes e o que garante FR-009
  durante a conversão;
- **toda escrita nova** de itens de categoria vai para bloco.

## 2. O bloco

Tabela nova `categoryBlocks` (Dexie **v14**), chave primária `categoryId` (o id
local da categoria já é único no banco inteiro), índice
`[sourceId+generation+kind]`.

```ts
interface CategoryBlockRecord {
  categoryId: number
  sourceId: string
  generation: number
  kind: 'channel' | 'movie' | 'series'
  groupOrder: number              // = category.order (imutável, D-005 da 038)
  items: BlockItem[]              // na ordem da fonte
}
type BlockItem = Omit<CatalogRecord, 'sourceId' | 'generation' | 'kind' | 'groupOrder' | 'categoryId' | 'categoryPosition'> & { id: number }
```

Ler = `categoryBlocks.get(categoryId)` e "reidratar" cada item em
`CatalogRecord` completo (`sourceId`, `generation`, `kind`, `groupOrder`,
`categoryId`, `categoryPosition = índice`). Uma leitura só, independente do
tamanho da categoria (medido: 11 mil itens em 0,12–0,19 s com CPU 4×).

`itemsFetchedAt`, `itemsCount`, `itemsSignature` continuam no registro da
**categoria** (não mudam de lugar — a pré-carga e o trilho já os leem ali).

## 3. Identidade e id numérico

- **Identidade** (a mesma de `renewWithin` da 038): série → `s:<seriesId>`;
  item do provedor → `p:<providerStreamId>`; M3U → `n:<originalName>`. Nunca
  URL nem posição.
- **Id**: `id = -(categoryId * 2^32 + slot)`, `slot = fnv1a32(identity)`.
  Negativo → nunca colide com as linhas antigas (autoincremento, positivas).
  `categoryId < 2^20` ⇒ `|id| < 2^52` (inteiro seguro).
- **Colisão de slot no mesmo bloco** (hash igual, ou M3U com dois itens de
  mesmo nome): o segundo avança `slot + 1, +2…` até um livre, na ordem da
  fonte. Na renovação, item que já existia **reaproveita o id que tinha**
  (casando por identidade, fila por ordem como na 038) antes de calcular slot
  novo — assim o id não muda por causa de uma colisão nova.
- `categoryIdOfBlockItem(id)` = `id < 0 ? Math.floor(-id / 2^32) : undefined`.
- `CatalogItemOut.id` continua `String(record.id)` ("-4294967297"): as telas
  tratam como texto opaco; `Number(itemId)` em `catalogApi` continua valendo.

## 4. Escrita (substitui o corpo de `renewWithin`)

```
writeBlock(target, items, now):                  // transação rw(categoryBlocks, categories, channels)
  category = categories.get(target.categoryId); if !category → return false   // saiu numa atualização
  signature = itemsSignature(items)
  old = categoryBlocks.get(categoryId)
  if category.itemsSignature === signature && old && old.items.length === items.length:
     categories.update(itemsFetchedAt: now); return false
  oldByIdentity = fila por identidade dos itens de `old` (se houver) OU das linhas
                  antigas daquela categoria (conversão implícita, §6)
  taken = Set; novos = []
  para cada item (índice i):
     prev = oldByIdentity.get(identity).shift()
     id = prev?.id se prev e (prev.id < 0) senão blockItemId(categoryId, identity, taken)
     taken.add(id)
     novos.push({ ...campos do item, id, episodesFetchedAt: prev?.episodesFetchedAt })
  categoryBlocks.put({ categoryId, sourceId, generation, kind, groupOrder, items: novos })
  apaga as linhas antigas (kind do item, não episódio) daquela categoria, se existirem
  categories.update(itemsFetchedAt, itemsCount, itemsSignature)
  return true
quota → StorageFullError
```

- `renewCategoryItems`, `storeCategoryItems` e `storeStoredCategory` (itens)
  passam a usar `writeBlock`. Episódios de M3U continuam linhas (FR-004).
- `storeBatch` (caminho `eager` legado, só testes antigos) **não muda**.

## 5. Leitura com reserva

| Função | Bloco existe | Senão |
| --- | --- | --- |
| `listChannels(sourceId, groupOrder, …, kind)` | acha a categoria (geração ativa, `order = groupOrder`, `kind`) → bloco | linhas como hoje |
| `countChannels(…groupOrder, kind)` | `block.items.length` | contagem de linhas |
| `countChannels` sem `groupOrder` | soma blocos + linhas (sem duplicar categoria) | — |
| `getChannel(id)` | `id < 0` → bloco da categoria, item por `id`; confere geração ativa | `channels.get(id)` |
| `listAllOfKind(kind)` | todos os blocos do tipo (geração ativa) **+** linhas das categorias sem bloco | — |
| `resolveFavorites` | por id: bloco a bloco (um por vez, para quando achar todos); por nome idem | linhas como hoje, **depois** dos blocos, para as partes não resolvidas |
| `resolveContinueWatching`/série-pai (`homeHero`) | `findSeriesRecord(seriesId)`: linhas (índice) → senão blocos de séries | — |
| `listEpisodes`/`listAllEpisodes` | sem mudança (episódios são linhas) | — |

- Categoria **sem** bloco **e com** linhas = formato antigo (antes da conversão).
- Nunca duas cópias do mesmo item: uma categoria é **ou** bloco **ou** linhas
  (escrever o bloco apaga as linhas daquela categoria na mesma transação).
- **Memória (FR-013)**: varreduras (`resolveFavorites`, `findSeriesRecord`)
  leem **um bloco por vez** e descartam; só `listAllOfKind` (usado por
  "Todos"/busca/Semelhantes, que já mostram tudo daquele tipo) junta um tipo
  inteiro — nunca os três tipos juntos.

## 6. Conversão (`convertLegacyCategories`)

```
convertLegacyCategories(sourceId, { maxCategories = 1 }):
  categorias da geração ativa, kind ∈ {channel, movie, series}, fetchMode ≠ 'eager'?
    → para cada uma sem bloco e com ≥ 1 linha (não episódio) naquele [kind, groupOrder]:
        lê as linhas (ordem por categoryPosition/id), writeBlock(itens, now = itemsFetchedAt existente)
        (writeBlock apaga as linhas na mesma transação)
        conta 1; para quando atingir maxCategories
  return ainda sobrou alguma
```

- **Não muda** `itemsFetchedAt` (a categoria não fica "renovada" por ter sido
  convertida) — por isso recebe o instante existente.
- Categorias `eager` (M3U legado, sem categoria navegável própria por linha
  antiga) também convertem — têm `order`/`kind` iguais.
- Rodada pela pré-carga como `housekeeping` (mesmo portão), **antes** da
  limpeza de gerações; converte 1 categoria por chamada.
- Ids mudam na conversão (positivo → negativo). Favoritos/progresso/histórico
  são por `stableId` e não percebem (FR-011). Um detalhe aberto no exato
  momento da conversão pode perder o item na próxima leitura — R-003.

## 7. Episódios e a marca da série

- `storeSeriesEpisodes(target)`: grava episódios como hoje (linhas) e carimba
  `episodesFetchedAt` **no item-série**: `seriesRecordId > 0` → linha (como
  hoje); `< 0` → reescreve o item dentro do bloco (um `put` do bloco — uma vez
  por abertura de série, barato).
- `writeBlock` preserva `episodesFetchedAt` do item anterior (§4).
- `seriesLoader.ensureSeriesEpisodes(seriesRecordId)` não muda: usa
  `getChannel`, que já entende os dois.

## 8. Gerações e limpeza

- `publishGeneration`: além das categorias antigas, apaga os **blocos** das
  outras gerações (um registro por categoria — barato).
- `applyStructureRefresh`: categoria removida → apaga o bloco dela (e as
  linhas, se ainda for formato antigo) e os episódios das séries dela.
- `collectStaleGenerations`: também apaga blocos de gerações não protegidas.
- `deleteAllForSource`: apaga os blocos da fonte.
- `discardGeneration`: apaga os blocos daquela geração.
