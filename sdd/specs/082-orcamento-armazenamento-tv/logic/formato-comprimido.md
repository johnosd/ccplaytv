# Lógica: formato comprimido em pedaços (feature 082)

Fecha o "como" de US1/US2 (FR-001 a FR-007). Base medida: `evidencias/sonda2-capacidades-tv-2026-10-18.md`. Esboço:
`tv-web/src/lib/catalog/blockCodec.ts`. Contrato: `storageBudget.orcamento-armazenamento.contract.test.ts` → "grava a
categoria comprimida e lê igual pela lista e pela janela".

## 1. Por que este desenho (números da TV)

| Decisão | Medido |
| --- | --- |
| gzip (`CompressionStream`) | A TV não comprime o que grava. A categoria de 11 347 filmes ocupa 3,62 MB como objetos e 0,61 MB em gzip. `deflate-raw` deu o mesmo |
| Pedaços de **500** itens | 1º pedaço em 12,7–13,8 ms. Com 250 itens seria 6,6 ms, com +1 % de bytes e mais registros; com 1 000, 18,5 ms |
| Sem descompressão dentro de transação | `await` fora do IndexedDB encerra a transação do Dexie |
| Codificar em Worker ou pedaço a pedaço | Comprimir na thread principal: pior quadro de 250 ms. No Worker: 60 fps |
| Mandar bytes ao Worker, não objetos | Clone de 11 mil objetos: 195 ms. `ArrayBuffer` transferido: 1,4 ms |
| Substituir a projeção 065 | Ela era 18,7 MB dos ~44 MB da lista real, e os pedaços já dão a leitura em janela |
| Guia por canal | 20 mil linhas: 14,5 s para gravar e 14 MB. Por canal em gzip: ~0,6 MB para a lista toda |

## 2. Modelo (ver `data-model.md`)

- **`categoryBlocks`** continua com uma linha por categoria, mesma chave e mesmo índice. No **formato 2** ela vira um
  **cabeçalho**, sem `items`:
  - `format: 2`, `count`, `chunkCount`, `storedBytes`;
  - `shared: { group?, providerCategoryId? }`;
  - `revision` (troca a cada gravação).
- **`categoryChunks`** (tabela nova, Dexie com versão nova):
  - chave `[categoryId+chunk]`, índice `[sourceId+generation]`;
  - campos `{ categoryId, sourceId, generation, chunk, start, count, bytes: Uint8Array }`;
  - `chunk` = 0..n-1 para os itens e `-1` para o **índice de identidade** (ids, chaves de identidade e
    `episodesFetchedAt` na ordem da fonte), comprimido do mesmo jeito.
- **`epgChunks`** (tabela nova): chave `[sourceId+generation+channelKey]`, com
  `{ sourceId, generation, channelKey, from, to, count, bytes }`.
- O formato antigo continua legível até ser convertido:
  - `categoryBlocks` sem `format` e com `items`;
  - `catalogReadManifests`/`catalogReadChunks`;
  - `epgPrograms`.

## 3. Codec (`blockCodec.ts`)

```ts
encodeBlockChunks(items: BlockItem[], shared): Promise<EncodedChunk[]>   // pedaços de BLOCK_CHUNK_ITEMS
decodeBlockChunk({ bytes }, shared): Promise<BlockItem[]>                 // devolve os itens completos
encodeIdentityIndex(items: BlockItem[]): Promise<Uint8Array>             // ids + chaves + episodesFetchedAt
decodeIdentityIndex(bytes): Promise<{ ids: number[]; keys: string[]; episodesFetchedAt: (number | null)[] }>
```

- **Enxuto**:
  - tira `group` e `providerCategoryId` quando iguais a `shared`;
  - tira `originalName` quando igual a `name`;
  - tira chaves `undefined`.

  Na decodificação devolve **o mesmo objeto** de hoje: `originalName = name` quando ausente, e `group`/
  `providerCategoryId` vindos de `shared`.
- `gzip` por `CompressionStream` lendo de `new Blob([texto]).stream()` (funciona no navegador, no Worker e no Node 22
  dos testes).
- **Ceder a vez**: na thread da interface, `encode`/`decode` de vários pedaços cedem entre pedaços com
  `scheduler.postTask(…, { priority: 'background' })`. `scheduler.yield` **não existe** na TV; sem `postTask`, usar
  `setTimeout(0)`. Dentro de um Worker, não precisa ceder.

## 4. Gravar (`writeBlockWithin` → `writeCompressedBlock`)

O fluxo de hoje lê o bloco antigo **dentro** da transação para reaproveitar ids. Com pedaços comprimidos, fica em
**duas fases**:

1. **Antes da transação** (pode descomprimir):
   - lê o cabeçalho e o índice de identidade antigos (`chunk -1`), se existirem, e guarda a `revision`;
   - se `category.itemsSignature === assinatura nova` e as contagens batem, **não regrava** (o caminho comum da
     renovação) e só carimba `itemsFetchedAt`;
   - calcula os ids (mesma regra de hoje, `blockItemId` determinístico) e monta os `BlockItem`;
   - codifica os pedaços e o índice.
2. **Na transação `rw`** (sem `await` de nada que não seja o banco):
   - confere se a `revision` do cabeçalho é a lida na fase 1. Se mudou, aborta essa tentativa e refaz a fase 1, no
     máximo 2 vezes;
   - apaga os pedaços antigos da categoria (`[categoryId+MIN]..[categoryId+MAX]`) e grava os novos e o cabeçalho
     (`revision` nova, `storedBytes` = Σ bytes + o cabeçalho);
   - apaga as linhas antigas (`channels`) e a projeção 065 da categoria, se houver;
   - atualiza `categories` (`itemsFetchedAt`, `itemsCount`, `itemsSignature`, `storedBytes`).

Onde roda:
- **seção e importação**: a fase 1 roda dentro do Worker que já baixa e grava (`sectionWorker`, `importWorker`);
- **entrada sob demanda e conversão** (`categoryLoader`, `prefetch/index.ts`): roda na thread da interface, pedaço a
  pedaço, cedendo a vez.

Nenhum caminho manda objetos entre threads: cada Worker grava o banco direto (IndexedDB existe no Worker).

## 5. Ler

- `readBlockChunks(database, categoryId, start, end)` lê os pedaços que cobrem `[start, end)` com `bulkGet` das chaves
  certas e decodifica **depois** da leitura. É a base de:
  - `readCategoryWindow`: janela. Não chama `categoryBlocks.get`; usa `categories.itemsCount` e os pedaços. O contrato da
    065 continua valendo;
  - `listChannels`/`readKindPage`/`kindCursor`: pedaço a pedaço;
  - `getChannel(id)`: calcula a posição pelo índice de identidade (cache), lê só o pedaço dela;
  - `resolveStableIdsIn` e `series.ts` (procurar por `seriesId`/`providerStreamId`): decodificam pedaço a pedaço e param
    ao achar;
  - "Todos", busca e derivados: iteram pedaços, sem montar tudo.
- **Fallback**: com cabeçalho sem `format`, lê `items` como hoje, e as projeções da 065 continuam servindo a janela até
  a conversão.
- **Cache com teto** (FR-005): `blockMemo` passa a guardar **pedaços** decodificados, num LRU por número de itens. O
  teto é de **30 000 itens (~14 MiB)**: medido ~460 B de heap por item com `sonda-tv/medir-heap-itens.mjs`, e a TV tem
  364 MB de heap. É invalidado pela `revision` do cabeçalho. Nunca guarda dentro de transação, como hoje.
- **Regra para leitores existentes que leem bloco dentro de `database.transaction('r', …)`** (inventário em T010):
  - a parte de banco fica na transação: cabeçalho, pedaços em bytes, linhas antigas;
  - a decodificação vai para depois do `await` da transação.

## 6. Guia (`epgRepository.ts`)

- `writeEpgPrograms` (no `epgWorker`):
  - agrupa os programas por `channelKey`, já na janela −12 h/+48 h de hoje;
  - ordena por `start` e comprime cada canal no Worker;
  - faz `bulkPut` em `epgChunks` da geração nova, em lotes (como hoje), e grava `sources.epgStoredBytes`.
- `listProgramsForChannels(sourceId, channelKeys, from, to)`:
  - faz `bulkGet` dos canais pedidos na geração ativa;
  - decodifica e filtra por tempo, devolvendo o mesmo `EpgProgram[]`;
  - se a geração ativa ainda for de linhas (formato antigo), lê `epgPrograms` como hoje.
- **Conversão** do guia: não há. A próxima sincronização (12 h, ou o Atualizar) já grava no formato novo, e a troca de
  geração existente apaga as linhas antigas.

## 7. Conversão em segundo plano (FR-006)

Fica no `housekeeping` da pré-carga, depois de `convertLegacyCategories` (linhas → bloco) e antes de
`prepareMissingReadModels`. Esta passa a ser apenas "apagar projeções de categorias já no formato 2".

```
converteUma(sourceId):
  categoria = 1ª da geração ativa cujo cabeçalho NÃO é format 2 e tem items
  se não houver → apaga 1 lote de projeções 065 órfãs; devolve "acabou?"
  writeCompressedBlock(alvo, blockRecords(cabeçalhoAntigo), itemsFetchedAt preservado)   // §4, mesma regra de ids
  devolve true (há mais)
```

- Uma categoria por chamada, retomável e idempotente: o formato 2 já gravado é pulado.
- Avisa `onConverted`, porque a tela pode ter o conteúdo em cache. Os ids não mudam, mas invalidar é barato.
- Ordem: primeiro as categorias da **lista ativa** com mais itens, que dão mais espaço por conversão.

## 8. O que não muda

- `blockItemId`, `identityKey` e `itemsSignature` (contrato da 055) não mudam: a assinatura continua calculada sobre
  `CatalogRecord`.
- A fachada `catalogRepository.ts` continua exportando a mesma lista (contrato da 063). O codec e os leitores novos
  ficam em módulos irmãos e são importados direto.
- `storedEntries` (o M3U guardado) não muda.
