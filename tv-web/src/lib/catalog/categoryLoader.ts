/**
 * Obtenção sob demanda dos itens de uma categoria (`contracts/
 * catalog-on-demand.md` §2, feature 010).
 *
 * Ponto único de entrada das telas para "quero ver o que tem aqui dentro".
 * Decide sozinho se serve do disco ou busca — a tela nunca precisa saber
 * se a fonte é `on_demand` ou `eager`.
 *
 * Regras invioláveis desta superfície (contrato §2):
 *
 * 1. Só é chamada na **entrada** da categoria (SELECT), nunca ao mover o
 *    foco sobre ela — quem decide isso é a tela, não este módulo.
 * 2. Chamadas concorrentes para a mesma categoria compartilham **uma**
 *    obtenção só (`inFlight`).
 * 3. Falha nunca remove a categoria nem invalida as demais.
 * 4. Vencida com disco disponível serve o disco primeiro — o catálogo
 *    antigo não desaparece enquanto o novo não chega.
 * 5. Erro sai como categoria (`failed`/`stale-served`), nunca como
 *    mensagem de rede — a mensagem crua carrega a URL com credencial.
 */

import { db, type CatalogDb, type CatalogRecord, type CategoryKind } from './db'
import {
  activeGeneration,
  countChannels,
  renewCategoryItems,
  StorageFullError,
  storeStoredCategory,
  type CatalogCategory,
} from './catalogRepository'
import { readEntryChunks } from './storedEntries'
import { isCategoryFresh } from './freshness'
import { markEntry } from '../perf/entryTiming'
import { readCredential } from './sourceRepository'
import {
  fetchLiveStreams,
  fetchSeries,
  fetchVodStreams,
  isAbortError,
  mapLiveEntry,
  mapSeriesEntry,
  mapVodEntry,
  type LiveCategory,
  type MappedChannel,
} from './xtreamConnector'

export type CategoryFetchOutcome =
  | 'fresh'
  | 'fetched'
  | 'stale-served'
  | 'failed'
  /** Categoria `stored` sem nenhum bloco guardado (feature 014, D-008) — "Tentar de novo" não resolve, só ressincronizar. */
  | 'source_missing'

export interface EnsureCategoryResult {
  outcome: CategoryFetchOutcome
  /** Feature 038 (FR-008): a gravação parou por falta de espaço no aparelho. */
  reason?: 'storage_full'
}

export interface EnsureCategoryOptions {
  database?: CatalogDb
  now?: () => number
  /**
   * Sinal de cancelamento para a busca de rede desta chamada (bug
   * `prefetch-concorrente-categoria-sem-cancelamento-requisicao`) — só o
   * caminho `on_demand` (`fetchAndStore`) o usa; `stored`/`eager` nunca
   * tocam rede. Abortado, a busca lança em vez de virar `failed`/
   * `stale-served` (ver `fetchAndStore`).
   */
  signal?: AbortSignal
  /**
   * Feature 038 (FR-024/FR-026): quando informado, uma categoria que já tem
   * itens no aparelho mas está vencida (> 24 h) ou com renovação pendente
   * (`renewRequestedAt` > `itemsFetchedAt`) é servida do disco **na hora**
   * (`stale-served`), sem tocar a rede — e este callback recebe o id para a
   * renovação acontecer em segundo plano (agendador). Sem ele, o
   * comportamento é o de antes (busca e espera).
   */
  serveStale?: (categoryId: number) => void
  /**
   * Feature 038 (pré-carga, FR-025): obtém de novo mesmo com itens no
   * aparelho, quando vencida ou com renovação pendente. Tem precedência sobre
   * `serveStale`.
   */
  renew?: boolean
}

/**
 * Buscas em andamento, por id local de categoria. Entrar, sair e entrar de
 * novo na mesma categoria antes da primeira busca terminar reaproveita a
 * mesma promessa — nunca dispara nem grava duas vezes (contrato §2, regra
 * 2).
 */
const inFlight = new Map<number, Promise<EnsureCategoryResult>>()

/** Sem URL de propósito: fonte de provedor nunca guarda URL de reprodução — ela é montada na hora, a partir do identificador (`playbackUrl.ts`). */
const noUrl = (): undefined => undefined

async function fetchMappedItems(
  kind: CategoryKind,
  dns: string,
  username: string,
  password: string,
  category: CatalogCategory,
  signal?: AbortSignal,
): Promise<MappedChannel[]> {
  if (!category.providerCategoryId) return []

  const categoryMap = new Map<string, LiveCategory>([
    [category.providerCategoryId, { id: category.providerCategoryId, name: category.name ?? '', order: category.order }],
  ])

  if (kind === 'channel') {
    const raw = await fetchLiveStreams(dns, username, password, category.providerCategoryId, signal)
    return raw
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => mapLiveEntry(item, categoryMap, noUrl))
      .filter((item): item is MappedChannel => item !== undefined)
  }
  if (kind === 'movie') {
    const raw = await fetchVodStreams(dns, username, password, category.providerCategoryId, signal)
    return raw
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => mapVodEntry(item, categoryMap, noUrl))
      .filter((item): item is MappedChannel => item !== undefined)
  }
  const raw = await fetchSeries(dns, username, password, category.providerCategoryId, signal)
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => mapSeriesEntry(item, categoryMap))
    .filter((item): item is MappedChannel => item !== undefined)
}

/** Um item mapeado do provedor como registro do catálogo — mesmo formato na carga por categoria e por seção (feature 038). */
export function toItemRecord(
  channel: MappedChannel,
  sourceId: string,
  generation: number,
  category: CatalogCategory,
): CatalogRecord {
  return {
    sourceId,
    generation,
    kind: channel.kind,
    name: channel.name,
    originalName: channel.originalName,
    group: channel.group,
    groupOrder: category.order,
    categoryId: category.id,
    providerStreamId: channel.providerStreamId,
    providerCategoryId: channel.providerCategoryId,
    seriesId: channel.seriesId,
    seasonNumber: channel.seasonNumber,
    episodeNumber: channel.episodeNumber,
    streamExtension: channel.streamExtension,
    // Provedor nunca guarda URL — ver `noUrl` acima.
    directUrl: undefined,
    // Feature 015/024: capa/logo declarado pela fonte (também canal desde a 024 — mapLiveEntry preenche).
    iconUrl: channel.iconUrl,
    // Feature 030: id de EPG só no canal (FR-006/FR-008).
    epgChannelId: channel.kind === 'channel' ? channel.epgChannelId : undefined,
    // Feature 025: ano/inclusão declarados pela fonte (filme/série do provedor).
    year: channel.year,
    addedAt: channel.addedAt,
  }
}

/** Falha de gravação por falta de espaço vira dado, nunca exceção (feature 038, FR-008). */
function failureOf(error: unknown, hadItems: boolean): EnsureCategoryResult {
  const outcome: CategoryFetchOutcome = hadItems ? 'stale-served' : 'failed'
  return error instanceof StorageFullError ? { outcome, reason: 'storage_full' } : { outcome }
}

async function fetchAndStore(
  sourceId: string,
  category: CatalogCategory,
  hadItems: boolean,
  database: CatalogDb,
  now: number,
  signal?: AbortSignal,
): Promise<EnsureCategoryResult> {
  const credential = await readCredential(sourceId, database)
  if (!credential) return { outcome: hadItems ? 'stale-served' : 'failed' }

  const generation = await activeGeneration(sourceId, database)
  if (generation === undefined) return { outcome: hadItems ? 'stale-served' : 'failed' }

  try {
    markEntry(category.id, category.kind, 'request')
    const items = await fetchMappedItems(
      category.kind,
      credential.dns,
      credential.username,
      credential.password,
      category,
      signal,
    )
    markEntry(category.id, category.kind, 'mapped', items.length)
    // Feature 038 (D-006): um caminho de escrita só — preserva o id local de
    // quem continua na fonte e não regrava uma lista idêntica.
    await renewCategoryItems(
      { sourceId, generation, kind: category.kind, categoryId: category.id, groupOrder: category.order },
      items.map((item) => toItemRecord(item, sourceId, generation, category)),
      now,
      database,
    )
    markEntry(category.id, category.kind, 'written')
    return { outcome: 'fetched' }
  } catch (error) {
    // Cancelamento deliberado (bug
    // `prefetch-concorrente-categoria-sem-cancelamento-requisicao`): quem
    // chamou já não quer mais este resultado — nunca vira `failed`/
    // `stale-served` (isso sobrescreveria um conteúdo bom já servido, ou
    // marcaria a categoria como quebrada por engano). Deixa propagar.
    if (isAbortError(error)) throw error
    // Qualquer outro erro sai como categoria, nunca como mensagem de rede
    // (regra 5): o que aconteceu já não importa aqui, só que não deu
    // certo. Falha nunca remove a categoria nem invalida as demais (regra
    // 3) — o disco, se tiver algo, continua servindo (regra 4).
    return failureOf(error, hadItems)
  }
}

/**
 * Lê uma categoria `stored` do conteúdo guardado (feature 014, D-007).
 *
 * Nunca toca rede — o arquivo já foi baixado na importação. Sem blocos
 * guardados, a categoria pode já ter sido lida antes nesta mesma geração
 * (os blocos são consumidos na primeira leitura, D-007) — a tela que
 * chamou pode ter um `category` desatualizado (sem `itemsFetchedAt`) por
 * causa de um remount com o cache do React Query (`staleTime` padrão),
 * ex.: voltar de uma tela de detalhe. Achado no gate final da feature 018:
 * sem essa checagem, reentrar assim mostrava "conteúdo não está mais no
 * aparelho" mesmo com os itens certos já em `channels`. Só quando também
 * não há nada em `channels` é que de fato falta o arquivo (aparelho
 * limpou armazenamento, ou algo apagou a geração pela metade) — aí sim
 * `source_missing`: diferente de `failed`, "Tentar de novo" não resolve
 * isso, só ressincronizar a fonte (D-008).
 *
 * Feature 038 (`logic/atualizacao-sem-esfriar.md` §4.3): depois de uma
 * atualização, o conteúdo novo de uma categoria mantida está nos blocos da
 * geração de varredura (`storedFrom`); é de lá que se lê, e a gravação
 * preserva o id de quem continua.
 */
async function readStored(
  sourceId: string,
  category: CatalogCategory,
  storedFrom: { generation: number; categoryId: number } | undefined,
  database: CatalogDb,
  now: number,
): Promise<EnsureCategoryResult> {
  const generation = await activeGeneration(sourceId, database)
  if (generation === undefined) return { outcome: 'failed' }

  const from = storedFrom ?? { generation, categoryId: category.id }
  const chunks = await readEntryChunks(sourceId, from.generation, from.categoryId, database)
  if (chunks.length === 0) {
    const alreadyStored = await countChannels(sourceId, category.order, category.kind, database)
    return { outcome: alreadyStored > 0 ? 'fresh' : 'source_missing' }
  }

  const records = chunks.flatMap((chunk) => chunk.records)
  const items = records.filter((record) => record.kind !== 'episode')
  const episodes = records.filter((record) => record.kind === 'episode')

  try {
    await storeStoredCategory(
      { sourceId, generation, kind: category.kind, categoryId: category.id, groupOrder: category.order },
      items,
      episodes,
      now,
      database,
      storedFrom,
    )
    return { outcome: 'fetched' }
  } catch (error) {
    // Erro sai como categoria, nunca mensagem crua (regra 5) — mesmo padrão
    // de `fetchAndStore`. Falha aqui não some com os blocos: uma quota
    // cheia deixa `storedEntries` intacto para a pessoa tentar de novo.
    const failed = failureOf(error, false)
    return storedFrom ? { ...failed, outcome: 'stale-served' } : failed
  }
}

/** Compartilha uma única busca em andamento por categoria (contrato §2, regra 2). */
function dedup(categoryId: number, run: () => Promise<EnsureCategoryResult>): Promise<EnsureCategoryResult> {
  const existing = inFlight.get(categoryId)
  if (existing) return existing
  const promise = run().finally(() => inFlight.delete(categoryId))
  inFlight.set(categoryId, promise)
  return promise
}

/**
 * Garante que uma categoria tem itens utilizáveis, buscando se preciso.
 *
 * Chamar para uma categoria `eager` nunca toca a rede — os itens já vieram
 * inteiros na importação, e não há `providerCategoryId` por onde
 * perguntar. `stored` (feature 014) também nunca toca rede — lê do
 * conteúdo guardado uma única vez por geração (D-007). É o que permite a
 * tela chamar esta operação sempre, sem saber de que tipo é a fonte.
 *
 * Feature 038 (`logic/atualizacao-sem-esfriar.md` §5): uma categoria com
 * itens no aparelho que está vencida (`on_demand` > 24 h) ou com renovação
 * pendente (`renewRequestedAt` > `itemsFetchedAt`) é **renovada** com
 * `renew`, **servida do disco na hora** com `serveStale` (entrada da tela) ou,
 * sem nenhum dos dois, buscada e esperada como antes.
 */
export async function ensureCategory(
  sourceId: string,
  category: CatalogCategory,
  options: EnsureCategoryOptions = {},
): Promise<EnsureCategoryResult> {
  const database = options.database ?? db
  const now = options.now?.() ?? Date.now()

  if (category.fetchMode === 'eager') return { outcome: 'fresh' }

  // O `category` recebido é um retrato: a lista de categorias das telas nunca é
  // relida depois de uma obtenção (`useCategoryList`), então o retrato pode não
  // ter o `itemsFetchedAt` que o disco já tem. Voltar do detalhe para a grade
  // refazia o `get_vod_streams` por causa disso, e os ids dos canais mudavam
  // debaixo dos cards (bug `catalogo-refaz-busca-ao-voltar-do-detalhe`, achado
  // pelo E2E da feature 033). A verdade é o registro gravado; o retrato só vale
  // quando o registro não existe (categoria ainda não persistida) ou é mais velho.
  const record = await database.categories.get(category.id)
  const persisted = record?.itemsFetchedAt
  const itemsFetchedAt =
    persisted !== undefined && category.itemsFetchedAt !== undefined
      ? Math.max(persisted, category.itemsFetchedAt)
      : (persisted ?? category.itemsFetchedAt)
  const renewRequestedAt = record?.renewRequestedAt ?? category.renewRequestedAt
  const hasItems = itemsFetchedAt !== undefined
  const renewPending = hasItems && renewRequestedAt !== undefined && renewRequestedAt > itemsFetchedAt
  // `stored` não vence por idade: o conteúdo vem de um arquivo que não muda —
  // reler produziria o mesmo resultado (D-007/FR-011 da 014). Só uma
  // atualização (renovação pendente) o torna velho.
  const stale =
    hasItems && (renewPending || (category.fetchMode === 'on_demand' && !isCategoryFresh(itemsFetchedAt, now)))

  if (hasItems && !stale) return { outcome: 'fresh' }

  if (stale && !options.renew && options.serveStale) {
    options.serveStale(category.id)
    return { outcome: 'stale-served' }
  }

  if (category.fetchMode === 'stored') {
    return dedup(category.id, () => readStored(sourceId, category, record?.storedFrom, database, now))
  }
  return dedup(category.id, () => fetchAndStore(sourceId, category, hasItems, database, now, options.signal))
}
