# Lógica: importação M3U estrutura-primeiro

Fixa o "como" das três peças com mais chance de decisão ruim no
`sdd-execute`. Pseudocódigo em TypeScript; nomes são sugestão, o
comportamento não.

## 1. Reconhecer URL de painel (`tv-web/src/lib/catalog/m3uPanelUrl.ts`)

```ts
export interface PanelCredential { dns: string; username: string; password: string }

/** `undefined` = não é URL de painel (D-001). Nunca lança; nunca loga a URL. */
export function parsePanelUrl(raw: string): PanelCredential | undefined {
  let url: URL
  try { url = new URL(raw.trim()) } catch { return undefined }
  if (!url.pathname.endsWith('/get.php')) return undefined
  const username = url.searchParams.get('username') ?? ''
  const password = url.searchParams.get('password') ?? ''
  if (!username || !password) return undefined
  const base = `${url.protocol}//${url.host}${url.pathname.slice(0, -'/get.php'.length)}`
  try {
    return { dns: normalizeServerAddress(base), username, password }
  } catch {
    return undefined
  }
}
```

`readCredential` (`sourceRepository.ts`), para `type: 'm3u_url'`:

```ts
if (record.type === 'm3u_url') {
  const panel = record.m3uUrl ? parsePanelUrl(record.m3uUrl) : undefined
  return panel ? { ...panel, allowedFormats: record.providerAllowedFormats } : undefined
}
```

## 2. Roteamento da importação (`importPipeline.ts`, dentro de `execute()`)

```ts
if (source.type === 'provider_credentials') {
  // igual a hoje, exceto: no catch de ProviderIncompatibleError,
  //   mode = 'legacy_m3u'; limitedReason = 'protocol_unavailable'
  //   await scanToStored(legacyM3uUrl(...), { refine: true })   // US3; antes da US3: consumeM3u
} else {
  const panel = parsePanelUrl(source.m3uUrl)
  if (!panel) {
    mode = undefined; limitedReason = undefined
    await scanToStored(source.m3uUrl, { refine: false })         // US3; antes: consumeM3u
  } else {
    const route = await confirmPanel(panel)                      // D-002
    if (route.kind === 'xtream') {
      mode = 'xtream_api'; allowedFormats = route.allowedFormats
      await ingestProviderStructure(panel)  // mesma função que o ramo de provedor usa
    } else {
      mode = 'legacy_m3u'; limitedReason = route.reason
      await scanToStored(source.m3uUrl, { refine: true })
    }
  }
}
```

`confirmPanel`:

```ts
async function confirmPanel(panel): Promise<
  | { kind: 'xtream'; allowedFormats?: string[] }
  | { kind: 'limited'; reason: LimitedReason }
> {
  let status: AccountStatus
  try {
    status = await resolveAccountStatus(panel.dns, panel.username, panel.password)
  } catch (error) {
    if (error instanceof ProviderError) {
      if (error.kind === 'invalid_credentials') throw error          // falha a importação
      if (error.kind === 'network_failure') return { kind: 'limited', reason: 'panel_unreachable' }
      return { kind: 'limited', reason: 'protocol_unavailable' }     // direct_connection_refused
    }
    if (error instanceof ProviderIncompatibleError) return { kind: 'limited', reason: 'protocol_unavailable' }
    throw error
  }
  if (status.expired) throw new ProviderError('subscription_expired', 'Assinatura expirada.')
  if (!status.authorized) throw new ProviderError('invalid_credentials', 'Acesso negado.')
  return { kind: 'xtream', allowedFormats: status.allowedFormats }
}
```

`ingestProviderStructure` é o bloco atual de `fetchLiveCategories` +
`ingestCategoriesOptional` extraído para uma função que recebe a
credencial. Se `fetchLiveCategories` lançar `ProviderIncompatibleError`,
o chamador cai no conteúdo guardado com `protocol_unavailable`, igual à
fonte de provedor.

**Mensagens de erro**: nenhuma mensagem nova interpola URL, usuário ou
senha. As que existem (`'Assinatura expirada.'`, `'Acesso negado.'`) já são
fixas.

## 3. Varredura para o conteúdo guardado (`scanToStored`)

Substitui `consumeM3u` na US3. Mesmo `fetch`, mesmos erros de rede
(`probeFailureKind`, 401/403, `InvalidPlaylistError`), mesmo
`parseM3uLines`, `classifyWithGroupOrder`, `refineFromUrl` e
`createSeriesGrouper`. A diferença é o destino.

```ts
const STORED_FLUSH_THRESHOLD = 5_000

const buffers = new Map<number, StoredCatalogRecord[]>()   // categoryId → registros
const chunkIndex = new Map<number, number>()               // categoryId → próximo bloco
const counts = new Map<number, number>()                   // categoryId → declaredCount
let buffered = 0

function push(categoryId: number, record: StoredCatalogRecord, countsAsItem: boolean) {
  buffers.get(categoryId)?.push(record) ?? buffers.set(categoryId, [record])
  if (countsAsItem) counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1)
  buffered += 1
}

async function flush() {
  if (buffered === 0) return
  const rows = [...buffers].filter(([, r]) => r.length > 0).map(([categoryId, records]) => {
    const chunk = chunkIndex.get(categoryId) ?? 0
    chunkIndex.set(categoryId, chunk + 1)
    return { sourceId, generation, categoryId, chunk, records }
  })
  buffers.clear(); buffered = 0
  await storeEntryChunks(rows, database)   // StorageFullError sobe (D-009)
  if (cancelled) throw new ImportCancelledError()
  await persist()
}

for await (const entry of parseM3uLines(linesFromResponse(response.body), tally)) {
  if (cancelled) throw new ImportCancelledError()
  run.entriesRead += 1
  const refined = maybeRefine(classifyWithGroupOrder(entry, groupOrders))

  if (refined.kind === 'unclassified') { run.discardedByType += 1; continue }

  if (refined.kind === 'episode') {
    const { episode, series } = seriesGrouper.assign(refined)
    // a categoria da série existe desde a primeira vez que a série apareceu
    const seriesCategoryId = await categoryIdFor('series', series?.group ?? episode.group)
    if (series) push(seriesCategoryId, toStored(series), true)
    push(seriesCategoryId, toStored(episode), false)   // episódio não conta (D-011)
  } else {
    const categoryId = await categoryIdFor(refined.kind, refined.group)
    push(categoryId, toStored(refined), true)
  }
  if (buffered >= STORED_FLUSH_THRESHOLD) await flush()
}
await flush()
for (const [categoryId, count] of counts) await setDeclaredCount(categoryId, count)
```

Notas:

- `categoryIdFor` é o de hoje com `fetchMode: 'stored'` no lugar de
  `'eager'`. A categoria de uma série sintética usa o grupo do episódio,
  que é o mesmo grupo da chave do agrupador (`m3uSeriesGrouping.ts:48`).
  **Conferir** na implementação que `series.group === episode.group` sempre;
  se não, o episódio segue a categoria de `series.group` guardada no
  primeiro `assign` da chave.
- Nada vai para `channels`. `run.channelsStored` conta registros guardados
  (itens + episódios), para a tela de progresso ter um número real;
  `run.unit` fica `'items'`.
- `toStored` = `toRecord` de hoje sem `sourceId`/`generation`/`categoryId`.
  `directUrl` segue a regra atual: guardado só quando `source.type ===
  'm3u_url'` e o caminho não é `refine` (keepUrl de hoje).
- Categoria com `count === 0` (todas as entradas do grupo descartadas)
  não é criada: `categoryIdFor` só é chamado depois do descarte, como hoje.

`fail()`: no caminho do conteúdo guardado, `StorageFullError` →
`discardSilently()` + `errorKind = 'storage_full'`, sem publicar (D-009).
Marcar a execução com uma flag `storedPath = true` para o `fail()` saber.

## 4. Leitura de uma categoria `stored` (`categoryLoader.ts`)

```ts
export async function ensureCategory(sourceId, category, options) {
  if (category.fetchMode === 'eager') return { outcome: 'fresh' }
  if (category.fetchMode === 'stored') {
    if (category.itemsFetchedAt !== undefined) return { outcome: 'fresh' }  // D-007
    return dedup(category.id, () => readStored(sourceId, category, database, now))
  }
  // on_demand: igual a hoje
}

async function readStored(sourceId, category, database, now): Promise<EnsureCategoryResult> {
  const generation = await activeGeneration(sourceId, database)
  if (generation === undefined) return { outcome: 'failed' }
  const chunks = await readEntryChunks(sourceId, generation, category.id, database) // ordem de chunk
  if (chunks.length === 0) return { outcome: 'source_missing' }                     // D-008
  const records = chunks.flatMap((c) => c.records)
  const items = records.filter((r) => r.kind !== 'episode')
  const episodes = records.filter((r) => r.kind === 'episode')
  try {
    await storeStoredCategory(
      { sourceId, generation, kind: category.kind, categoryId: category.id, groupOrder: category.order },
      items, episodes, now, database,
    )
    return { outcome: 'fetched' }
  } catch {
    return { outcome: 'failed' }   // nunca a mensagem crua
  }
}
```

`storeStoredCategory` (`catalogRepository.ts`), uma transação sobre
`channels`, `categories` e `storedEntries`:

1. apaga itens `[sourceId+generation+kind+groupOrder]` da categoria (como
   `storeCategoryItems`);
2. `bulkAdd` dos itens com `sourceId`, `generation`, `kind`, `groupOrder` e
   `categoryId` da categoria;
3. `bulkAdd` dos episódios com `sourceId`, `generation`, `kind: 'episode'`,
   `categoryId` indefinido, `seriesId`/`groupOrder` como vieram;
4. `categories.update(id, { itemsFetchedAt: now, itemsCount: items.length })`;
5. apaga os blocos da categoria.

Quota → `StorageFullError`, que `readStored` devolve como `'failed'` (a
categoria continua na lista, FR-009 da 010).

`seriesLoader.ensureSeriesEpisodes`: tratar `stored` como `eager`
(`fresh`, sem rede). Os episódios entram junto com a categoria da série,
que é aberta antes do detalhe.

## 5. Contagem no hub (`catalogApi.ts`, `sectionCount`)

```ts
const contribution =
  category.fetchMode === 'eager' ? category.count
  : category.fetchMode === 'stored'
    ? (category.itemsFetchedAt !== undefined ? category.count : category.declaredCount)
    : category.declaredCount
```
