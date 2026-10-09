/** SÃ©ries e episÃ³dios: registro da sÃ©rie, episÃ³dios e carimbo de obtenÃ§Ã£o. Parte da divisÃ£o de `catalogRepository.ts` (feature 063); a fachada reexporta. */

import { db, type CatalogDb, type CatalogRecord } from '../db'
import { blockRecord, blocksOfKind, categoryIdOfBlockItem } from '../categoryBlocks'
import { FavoritesScanComplete, StorageFullError, activeGenerationOf, isQuotaError, query } from './shared'
import { buildStableId } from '../userStateRepository'
import { storeSeriesWatchMembers } from './seriesWatchRepository'

/** Identifica a série alvo de uma substituição integral de episódios (feature 012). */
export interface SeriesEpisodesTarget {
  sourceId: string
  generation: number
  seriesId: string
  /** Id local do registro `kind:'series'` — recebe o carimbo `episodesFetchedAt`. */
  seriesRecordId: number
}

/**
 * O registro `kind:'series'` de uma série pelo `seriesId`, na geração ativa
 * (feature 039, §5): linhas pelo índice; senão, blocos de séries um por vez.
 */
export async function findSeriesRecord(
  sourceId: string,
  seriesId: string,
  database: CatalogDb = db,
): Promise<CatalogRecord | undefined> {
  const generation = await activeGenerationOf(sourceId, database)
  if (generation === undefined) return undefined
  return findSeriesIn(database, sourceId, generation, seriesId)
}

async function findSeriesIn(
  database: CatalogDb,
  sourceId: string,
  generation: number,
  seriesId: string,
): Promise<CatalogRecord | undefined> {
  const row = await database.channels
    .where('[sourceId+generation+seriesId]')
    .equals([sourceId, generation, seriesId])
    .and((candidate) => candidate.kind === 'series')
    .first()
  if (row) return row
  let found: CatalogRecord | undefined
  try {
    await blocksOfKind(database, sourceId, generation, 'series').each((block) => {
      const index = block.items.findIndex((item) => item.seriesId === seriesId)
      if (index >= 0) {
        found = blockRecord(block, block.items[index], index)
        throw new FavoritesScanComplete()
      }
    })
  } catch (error) {
    if (!(error instanceof FavoritesScanComplete)) throw error
  }
  return found
}

/**
 * Vários registros `kind:'series'` por `seriesId` (feature 039, T019): linhas
 * pelo índice, uma consulta por série; o que faltar, numa passada só pelos
 * blocos de séries, parando quando todas forem achadas. Mesmo resultado de
 * `findSeriesIn` para cada id.
 */
export async function findSeriesManyIn(
  database: CatalogDb,
  sourceId: string,
  generation: number,
  seriesIds: ReadonlySet<string>,
): Promise<Map<string, CatalogRecord>> {
  const found = new Map<string, CatalogRecord>()
  for (const seriesId of seriesIds) {
    const row = await database.channels
      .where('[sourceId+generation+seriesId]')
      .equals([sourceId, generation, seriesId])
      .and((candidate) => candidate.kind === 'series')
      .first()
    if (row) found.set(seriesId, row)
  }
  if (found.size === seriesIds.size) return found
  try {
    await blocksOfKind(database, sourceId, generation, 'series').each((block) => {
      block.items.forEach((item, index) => {
        if (item.seriesId && seriesIds.has(item.seriesId) && !found.has(item.seriesId)) {
          found.set(item.seriesId, blockRecord(block, item, index))
        }
      })
      if (found.size === seriesIds.size) throw new FavoritesScanComplete()
    })
  } catch (error) {
    if (!(error instanceof FavoritesScanComplete)) throw error
  }
  return found
}

/**
 * Episódios de uma série, na geração ativa (feature 012). Filtra
 * `kind:'episode'` mesmo lendo pelo índice `[sourceId+generation+seriesId]`
 * que a própria série também compartilha (D-002) — sem isso o registro da
 * série apareceria misturado na lista de episódios.
 */
export async function listEpisodes(
  sourceId: string,
  seriesId: string,
  database: CatalogDb = db,
): Promise<CatalogRecord[]> {
  const generation = await activeGenerationOf(sourceId, database)
  if (generation === undefined) return []
  const records = await database.channels
    .where('[sourceId+generation+seriesId]')
    .equals([sourceId, generation, seriesId])
    .toArray()
  return records.filter((record) => record.kind === 'episode')
}

/**
 * Todos os episódios já conhecidos de uma fonte, de qualquer série
 * (feature 019, D-007/D-008) — usa o mesmo índice `[sourceId+generation+
 * kind+groupOrder]` de `listChannels`/`countChannels`, sem grupo
 * específico (`query()` com `groupOrder` ausente cobre `KEY_MIN`..`KEY_MAX`
 * — todos). Nunca dispara `ensureSeriesEpisodes`: só lê o que já está
 * gravado, mesmo padrão de "nunca busca ao focar/renderizar" (`logic/
 * agregacao-serie.md`).
 */
export async function listAllEpisodes(
  sourceId: string,
  database: CatalogDb = db,
): Promise<CatalogRecord[]> {
  const generation = await activeGenerationOf(sourceId, database)
  if (generation === undefined) return []
  return query(database, sourceId, generation, undefined, 'episode').toArray()
}

/**
 * Substitui integralmente os episódios de uma série e carimba a obtenção,
 * numa única transação (feature 012, D-002, espelho de `storeCategoryItems`).
 *
 * Apaga só `kind:'episode'` com o mesmo `seriesId` — o registro da própria
 * série (mesmo `seriesId`, `kind:'series'`) nunca é tocado pela exclusão,
 * só recebe o carimbo de `episodesFetchedAt`.
 */
export async function storeSeriesEpisodes(
  target: SeriesEpisodesTarget,
  episodes: CatalogRecord[],
  now: number,
  database: CatalogDb = db,
): Promise<void> {
  try {
    await database.transaction('rw', database.channels, database.categories, async () => {
      const existing = await database.channels
        .where('[sourceId+generation+seriesId]')
        .equals([target.sourceId, target.generation, target.seriesId])
        .toArray()
      const staleEpisodeIds = existing
        .filter((record) => record.kind === 'episode')
        .map((record) => record.id as number)
      if (staleEpisodeIds.length > 0) await database.channels.bulkDelete(staleEpisodeIds)

      if (episodes.length > 0) {
        await database.channels.bulkAdd(
          episodes.map((item) => ({
            ...item,
            sourceId: target.sourceId,
            generation: target.generation,
            kind: 'episode',
            seriesId: target.seriesId,
          })),
        )
      }

      // Feature 039 (§7): série em bloco (id negativo) recebe o carimbo no
      // registro da categoria (`seriesEpisodesFetchedAt`), nunca regravando o
      // bloco — que pode ter milhares de séries. `getChannel` junta os dois.
      const categoryId = categoryIdOfBlockItem(target.seriesRecordId)
      if (categoryId === undefined) {
        await database.channels.update(target.seriesRecordId, { episodesFetchedAt: now })
      } else {
        const category = await database.categories.get(categoryId)
        if (category) {
          await database.categories.update(categoryId, {
            seriesEpisodesFetchedAt: { ...category.seriesEpisodesFetchedAt, [target.seriesId]: now },
          })
        }
      }
    })
  } catch (error) {
    if (isQuotaError(error)) throw new StorageFullError()
    throw error
  }
  const stableIds: string[] = []
  for (const episode of episodes) {
    try {
      stableIds.push(buildStableId({
        sourceId: target.sourceId,
        kind: 'episode',
        providerStreamId: episode.providerStreamId,
        seriesId: target.seriesId,
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        originalName: episode.originalName,
      }))
    } catch {
      // Episódio sem identidade estável continua no catálogo, mas não entra no selo.
    }
  }
  await storeSeriesWatchMembers({ sourceId: target.sourceId, generation: target.generation, seriesId: target.seriesId }, stableIds, database)
}
