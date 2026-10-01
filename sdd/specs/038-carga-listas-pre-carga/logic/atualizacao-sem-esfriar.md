# Lógica — Atualização sem esfriar o catálogo

Cobre FR-024 a FR-030 e o lado de escrita de FR-001/FR-010/FR-026/FR-027.
Código: `lib/catalog/structureDiff.ts`, `catalogRepository.ts`,
`categoryLoader.ts`, `importPipeline.ts`.

## 1. O problema, no código de hoje

1. Toda importação (`startImport`) aloca uma geração nova, grava a estrutura
   nela (categorias **sem** `itemsFetchedAt`) e `publishGeneration` apaga, numa
   transação só, **todos** os itens e categorias da geração anterior. Depois
   de 24 h (ou "Ressincronizar"), todo o catálogo carregado vira frio.
2. Com a pré-carga, "todos os itens da geração anterior" passa a ser o
   catálogo inteiro (dezenas/centenas de milhares de linhas): essa exclusão
   numa transação só é exatamente o gargalo de gravação que congelou a TV na
   feature 010. **Não dá para manter o modelo de "geração nova a cada
   atualização" com a pré-carga ligada.**
3. `storeCategoryItems` apaga e regrava os itens de uma categoria: todo item
   ganha **id local novo**. Com renovação em segundo plano, um detalhe aberto
   (`useCatalogItem(id)`), o foco da grade (id) e o snapshot de volta
   (`CategoryScreenSnapshot`) apontariam para ids que sumiram.

## 2. Reconciliação da estrutura (`diffCategories`, puro)

```
categoryMatchKey(providerCategoryId, name) =
  providerCategoryId !== undefined ? 'p:' + providerCategoryId : 'n:' + (name ?? '')
// id do provedor casa mesmo com nome trocado; sem id (M3U), só o nome EXATO casa

diffCategories(existing, incoming):
  index existing por (kind, matchKey) — o 1º de cada chave; os repetidos vão para remove
  para cada incoming, em ordem:
    match = index.get(kind, matchKey) ainda não usado
    match ? keep.push({ id: match.id, incoming }) : add.push(incoming)
  remove = existing não usados (ids)
```

`kind` sempre faz parte da chave: o `category_id` do Xtream se repete entre
canais, filmes e séries (o contrato testa canal "10" × filme "10").

## 3. `order` × `position`

`order` de uma categoria é também o `groupOrder` dos itens dela (índice
`[sourceId+generation+kind+groupOrder]`). Mudar `order` de uma categoria
mantida obrigaria regravar todos os itens. Por isso:

- **`order` fica imutável** para uma categoria mantida; categoria nova ganha
  `order = maior order daquela seção na geração + 1 + i` (nunca colide).
- **`position`** (campo novo, sem índice) guarda a posição de exibição que a
  atualização declarou. `listCategories` ordena por `position ?? order`.
- Tudo que mostra ordem de categoria já passa por `listCategories` (trilho,
  número do canal, "Todos", busca). Conferir `catalogSearch.ts`/`globalSearch.ts`
  /`history.ts`: se algum ordena por `groupOrder` para **exibir**, passa a usar a
  ordem de `listCategories` (índice por id). `groupOrder` continua só chave.

## 4. Aplicar a atualização na geração ativa (em vez de publicar outra)

### 4.1 Quando

| Fonte antes | Caminho desta importação | O que acontece |
| --- | --- | --- |
| sem geração ativa (primeira importação) | qualquer | geração nova + `publishGeneration` (como hoje) |
| `providerImportMode: 'xtream_api'` | protocolo Xtream confirmado | **no lugar** (§4.2) |
| conteúdo guardado (`stored`) | conteúdo guardado | **no lugar** (§4.3) |
| qualquer outra combinação (troca de caminho, legado `eager`) | — | geração nova + `publishGeneration` (frio; R-006) |

O caminho só é conhecido depois de `confirmPanel`/`fetchLiveCategories`. O
pipeline decide "no lugar" nesse ponto; a geração alocada no início, se não
usada, é descartada vazia (`discardGeneration`) — ou, melhor, a alocação passa
a acontecer depois da decisão. `ImportRunRecord.generation` de uma execução "no
lugar" é a geração ativa.

**Regra da casa alterada**: o cabeçalho de `catalogRepository.ts` diz "escrita
é sempre numa geração nova". Passa a valer só para a primeira importação e a
troca de caminho; atualização de estrutura e renovação de itens escrevem na
geração ativa, sempre em transações que deixam a categoria inteira ou antiga
ou nova (nunca meia). Atualizar esse comentário na mesma task.

### 4.2 Xtream no lugar (`applyStructureRefresh`)

1. O pipeline lê as três listas de categorias **inteiras em memória antes de
   gravar qualquer coisa** (são centenas de linhas). Seção que o painel não
   serviu (`unavailableSections`) **não** entra no diff — suas categorias são
   mantidas como estão (não se apaga filmes porque `get_vod_categories` falhou).
2. Uma transação (`categories`, `channels`):
   - `keep`: `update(id, { name, position, declaredCount, renewRequestedAt: now })`;
   - `add`: `add({ sourceId, generation: ativa, kind, fetchMode: 'on_demand',
     providerCategoryId, name, order: novo slot, position, declaredCount })`;
   - `remove`: apaga a categoria, os itens do `groupOrder` dela e — se for de
     séries — os episódios das séries dela (por `seriesId`, na geração ativa).
3. `markSynced` como hoje. Falha em qualquer passo antes da transação = nada
   mudou (FR-030).

### 4.3 Conteúdo guardado (M3U) no lugar (`applyStoredRefresh`)

O arquivo precisa ser relido inteiro — não há protocolo por categoria. Então:

1. A varredura (`scanToStored`) grava como hoje: categorias e `storedEntries`
   numa geração **de varredura** `S` (nova, nunca publicada).
2. No fim, em vez de `publishGeneration`, diff entre as categorias da geração
   ativa `G` e as de `S` (chave pelo nome, `kind` incluso):
   - `keep`: a categoria de `G` recebe `storedFrom: { generation: S,
     categoryId: <id em S> }`, `declaredCount` novo, `name`, `position`,
     `renewRequestedAt: now`. **Os itens atuais dela continuam servindo.**
   - `add`: categoria nova em `G`, `fetchMode: 'stored'`, com `storedFrom`.
   - `remove`: como §4.2.
   - Apaga as **categorias** de `S` (os `storedEntries` de `S` ficam — são o
     conteúdo novo).
3. Ler/renovar uma categoria `stored` com `storedFrom` (`readStored`): lê os
   blocos de `(storedFrom.generation, storedFrom.categoryId)`, grava em `G`
   por `renewCategoryItems` (§6; episódios por substituição integral, D-011),
   apaga esses blocos e limpa `storedFrom` na mesma transação.
4. Sem `storedFrom`, `readStored` segue a regra da 014 (blocos da própria
   categoria; sem blocos e com itens = `fresh`).

## 5. `ensureCategory` (entrada e pré-carga)

```
ensureCategory(sourceId, category, { serveStale?, renew?, signal?, now, database }):
  persisted = registro gravado (a verdade; o objeto recebido é retrato — bug da 033)
  hasItems  = persisted.itemsFetchedAt !== undefined
  pending   = persisted.renewRequestedAt > persisted.itemsFetchedAt
  stale     = fetchMode==='on_demand' && !isCategoryFresh(itemsFetchedAt, now)

  eager                                  → 'fresh'
  hasItems && (pending || stale):
     renew        → obtém e grava por renewCategoryItems (dedup) → 'fetched' | 'failed'
     serveStale   → serveStale(id); 'stale-served'   // SEM rede (contrato)
     senão        → comportamento antigo (busca e espera)
  hasItems                               → 'fresh'
  !hasItems                              → obtém e grava (dedup) → 'fetched' | 'failed'
```

- **Um caminho de escrita só**: `fetchAndStore` e `readStored` passam a gravar
  por `renewCategoryItems` (numa categoria sem itens ele só acrescenta).
  `storeCategoryItems` continua exportado (testes e contrato antigos usam).
- **Armazenamento cheio**: `renewCategoryItems` lança `StorageFullError`;
  `ensureCategory` devolve `{ outcome: 'failed', reason: 'storage_full' }`
  (campo novo, opcional) em vez de lançar — a entrada continua no fluxo de erro
  de hoje e o agendador mapeia para `'storage_full'` (FR-008).
- `loadCategoryContent` (entrada, `catalogApi.ts`) **sempre** passa
  `serveStale: (id) => prefetchScheduler.prioritize(id)`.

## 6. `renewCategoryItems` (preserva id)

```
identityKey(r) =
  r.kind === 'series' && r.seriesId   → 's:' + seriesId
  r.providerStreamId                  → 'p:' + providerStreamId
  senão                               → 'n:' + originalName       // M3U; nunca URL
signature(items) = hash FNV-1a 32 bits (hex) de JSON dos campos, em ordem:
  [identityKey, name, iconUrl, year, addedAt, epgChannelId, streamExtension, directUrl]
  (o hash fica só no aparelho; nunca logado)

transação rw(channels, categories):
  existing = itens (não episódios) de [sourceId, generation, kind, groupOrder]
  cat      = categories.get(categoryId)
  if cat.itemsSignature === signature && existing.length === items.length:
     categories.update(categoryId, { itemsFetchedAt: now }) ; return { written: false }
  porChave = Map(identityKey → fila de existentes, na ordem de id)
  para cada item i (índice):
     reaproveitado = porChave.get(key).shift()
     registro = { ...item, sourceId, generation, kind, groupOrder, categoryId, categoryPosition: i }
     reaproveitado ? put({ ...registro, id: reaproveitado.id,
                           episodesFetchedAt: reaproveitado.episodesFetchedAt })
                   : add(registro)
  bulkDelete(ids existentes não reaproveitados)
  categories.update(categoryId, { itemsFetchedAt: now, itemsCount: items.length, itemsSignature })
  return { written: true }
quota → StorageFullError (isQuotaError)
```

**Leitura em ordem da fonte**: `listChannels` passa a ordenar por
`categoryPosition` (ausente = depois, pelo id) **antes** de aplicar
`offset/limit` — com ids preservados, a ordem por id deixa de ser a da fonte.
Único chamador hoje: `loadCategoryContent` (sem paginação).

## 7. Limpeza de gerações antigas, em partes

`publishGeneration` (primeira importação, troca de caminho) passa a: trocar
`activeGeneration` e apagar só as **categorias** das outras gerações
(centenas de linhas). Itens (`channels`) e `storedEntries` de gerações que não
são a ativa **e** não são apontadas por nenhum `storedFrom` são apagados por
`collectStaleGenerations(sourceId, { batchSize: 2000 })`, uma parte por vez,
chamado pelo agendador depois de cada categoria e quando não há mais nada a
fazer (mesmo portão — dep opcional `housekeeping` do agendador). Leituras sempre
filtram pela geração ativa, então o que sobra é invisível. `discardGeneration`
(importação que falhou, geração pequena) e `deleteAllForSource` (ação explícita
de excluir a lista) ficam como estão.

## 8. Favoritos, progresso e histórico (FR-029)

Nada muda: continuam por `stableId` (fonte + tipo + id estável), nunca por id
local. Com a geração preservada, **mais** coisas resolvem depois de uma
atualização (hoje um favorito de categoria não reaberta fica "não resolvido"
até a pessoa entrar nela). A reconciliação formal pós-resync continua sendo o
item 24 do backlog.
