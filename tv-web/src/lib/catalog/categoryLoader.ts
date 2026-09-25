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
import { activeGeneration, storeCategoryItems, storeStoredCategory, type CatalogCategory } from './catalogRepository'
import { readEntryChunks } from './storedEntries'
import { isCategoryFresh } from './freshness'
import { readCredential } from './sourceRepository'
import {
  fetchLiveStreams,
  fetchSeries,
  fetchVodStreams,
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
}

export interface EnsureCategoryOptions {
  database?: CatalogDb
  now?: () => number
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
): Promise<MappedChannel[]> {
  if (!category.providerCategoryId) return []

  const categoryMap = new Map<string, LiveCategory>([
    [category.providerCategoryId, { id: category.providerCategoryId, name: category.name ?? '', order: category.order }],
  ])

  if (kind === 'channel') {
    const raw = await fetchLiveStreams(dns, username, password, category.providerCategoryId)
    return raw
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => mapLiveEntry(item, categoryMap, noUrl))
      .filter((item): item is MappedChannel => item !== undefined)
  }
  if (kind === 'movie') {
    const raw = await fetchVodStreams(dns, username, password, category.providerCategoryId)
    return raw
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => mapVodEntry(item, categoryMap, noUrl))
      .filter((item): item is MappedChannel => item !== undefined)
  }
  const raw = await fetchSeries(dns, username, password, category.providerCategoryId)
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => mapSeriesEntry(item, categoryMap))
    .filter((item): item is MappedChannel => item !== undefined)
}

function toItemRecord(
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
    // Feature 015: capa declarada pela fonte (nunca para canal — mapLiveEntry não a preenche).
    iconUrl: channel.iconUrl,
  }
}

async function fetchAndStore(
  sourceId: string,
  category: CatalogCategory,
  wasNeverFetched: boolean,
  database: CatalogDb,
  now: number,
): Promise<EnsureCategoryResult> {
  const credential = await readCredential(sourceId, database)
  if (!credential) return { outcome: wasNeverFetched ? 'failed' : 'stale-served' }

  const generation = await activeGeneration(sourceId, database)
  if (generation === undefined) return { outcome: wasNeverFetched ? 'failed' : 'stale-served' }

  try {
    const items = await fetchMappedItems(
      category.kind,
      credential.dns,
      credential.username,
      credential.password,
      category,
    )
    await storeCategoryItems(
      { sourceId, generation, kind: category.kind, categoryId: category.id, groupOrder: category.order },
      items.map((item) => toItemRecord(item, sourceId, generation, category)),
      now,
      database,
    )
    return { outcome: 'fetched' }
  } catch {
    // Erro sai como categoria, nunca como mensagem de rede (regra 5): o
    // que aconteceu já não importa aqui, só que não deu certo. Falha nunca
    // remove a categoria nem invalida as demais (regra 3) — o disco, se
    // tiver algo, continua servindo (regra 4).
    return { outcome: wasNeverFetched ? 'failed' : 'stale-served' }
  }
}

/**
 * Lê uma categoria `stored` do conteúdo guardado (feature 014, D-007).
 *
 * Nunca toca rede — o arquivo já foi baixado na importação. Sem blocos
 * guardados (aparelho limpou armazenamento, ou algo apagou a geração pela
 * metade), devolve `source_missing`: diferente de `failed`, "Tentar de
 * novo" não resolve isso, só ressincronizar a fonte (D-008).
 */
async function readStored(
  sourceId: string,
  category: CatalogCategory,
  database: CatalogDb,
  now: number,
): Promise<EnsureCategoryResult> {
  const generation = await activeGeneration(sourceId, database)
  if (generation === undefined) return { outcome: 'failed' }

  const chunks = await readEntryChunks(sourceId, generation, category.id, database)
  if (chunks.length === 0) return { outcome: 'source_missing' }

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
    )
    return { outcome: 'fetched' }
  } catch {
    // Erro sai como categoria, nunca mensagem crua (regra 5) — mesmo padrão
    // de `fetchAndStore`. Falha aqui não some com os blocos: uma quota
    // cheia deixa `storedEntries` intacto para a pessoa tentar de novo.
    return { outcome: 'failed' }
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
 */
export async function ensureCategory(
  sourceId: string,
  category: CatalogCategory,
  options: EnsureCategoryOptions = {},
): Promise<EnsureCategoryResult> {
  const database = options.database ?? db
  const now = options.now?.() ?? Date.now()

  if (category.fetchMode === 'eager') return { outcome: 'fresh' }

  if (category.fetchMode === 'stored') {
    // Diferente de `on_demand`, sem validade por idade: o conteúdo vem de
    // um arquivo que não muda — reler produziria o mesmo resultado, então
    // só a geração (ressincronização) invalida (D-007/FR-011).
    if (category.itemsFetchedAt !== undefined) return { outcome: 'fresh' }
    return dedup(category.id, () => readStored(sourceId, category, database, now))
  }

  if (isCategoryFresh(category.itemsFetchedAt, now)) return { outcome: 'fresh' }
  const wasNeverFetched = category.itemsFetchedAt === undefined
  return dedup(category.id, () => fetchAndStore(sourceId, category, wasNeverFetched, database, now))
}
