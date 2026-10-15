/** Ciclo de vida das gerações: gravar lote, alocar, publicar, coletar e descartar. Parte da divisão de `catalogRepository.ts` (feature 063); a fachada reexporta. */

import { db, type CatalogDb, type CatalogRecord } from '../db'
import { KIND_MAX, KIND_MIN, blockKeysOutsideGeneration, blocksOfGeneration, blocksOfSource } from '../categoryBlocks'
import {
  KEY_MAX,
  KEY_MIN,
  StorageFullError,
  activeGenerationOf,
  allCategoryGenerations,
  allGenerations,
  allStoredEntriesGenerations,
  isQuotaError,
  query,
} from './shared'
import { clearStagedItems } from './staging'
import {
  invalidateGenerationReadModels,
  invalidateReadModelsOutsideGeneration,
  invalidateSourceReadModels,
} from './readProjection'
import { prepareCategoryReadModel } from './categoryWindow'
import { deleteSeriesWatchForGeneration, deleteSeriesWatchForSource } from './seriesWatchRepository'

/**
 * Grava um lote na geração em construção.
 *
 * Em transação: um lote entra inteiro ou não entra. Falta de espaço sobe
 * como `StorageFullError` para o pipeline poder registrar truncamento em
 * vez de fingir que gravou.
 */
export async function storeBatch(
  channels: CatalogRecord[],
  database: CatalogDb = db,
): Promise<void> {
  if (channels.length === 0) return
  try {
    await database.transaction('rw', database.channels, async () => {
      await database.channels.bulkAdd(channels)
    })
  } catch (error) {
    if (isQuotaError(error)) throw new StorageFullError()
    throw error
  }
}

/**
 * Escolhe o número da próxima geração.
 *
 * Olha o maior número já presente, não só o ativo: uma importação anterior
 * que falhou no meio pode ter deixado linhas de uma geração mais alta, e
 * reaproveitar esse número misturaria catálogo velho com novo.
 */
export async function allocateGeneration(
  sourceId: string,
  database: CatalogDb = db,
): Promise<number> {
  const source = await database.sources.get(sourceId)
  const highestStored = await allGenerations(database, sourceId).reverse().first()
  return Math.max(source?.activeGeneration ?? 0, highestStored?.generation ?? 0) + 1
}

/**
 * Publica a geração recém-escrita: troca o ponteiro da fonte **e só então**
 * descarta as anteriores (D-004).
 *
 * A ordem é o ponto. Descartar primeiro deixaria a pessoa sem catálogo
 * durante a troca; e se a publicação falhasse ali no meio, sem catálogo
 * nenhum.
 */
export async function publishGeneration(
  sourceId: string,
  generation: number,
  database: CatalogDb = db,
): Promise<void> {
  await database.transaction(
    'rw',
    [database.sources, database.channels, database.categories, database.storedEntries, database.categoryBlocks, database.catalogReadManifests, database.catalogReadChunks] as any,
    async () => {
      await database.sources.update(sourceId, { activeGeneration: generation, updatedAt: Date.now() })
      // Blocos de outras gerações (feature 039, §8): pelas chaves do índice,
      // nunca lendo os blocos (um filtro `.and()` leria todos, inclusive os novos).
      const staleBlocks = await blockKeysOutsideGeneration(database, sourceId, generation)
      if (staleBlocks.length > 0) await database.categoryBlocks.bulkDelete(staleBlocks)
      await invalidateReadModelsOutsideGeneration(sourceId, generation, database)
      // Estrutura da geração anterior sai junto (feature 010) — nunca
      // `userStates`, que não tem noção de geração (D-002 do plan.md). É
      // pequena (centenas de linhas).
      await allCategoryGenerations(database, sourceId)
        .and((category) => category.generation !== generation)
        .delete()
      // Itens e conteúdo guardado da geração anterior NÃO saem aqui (feature
      // 038, D-008): com o catálogo pré-carregado, apagá-los nesta transação
      // seria o gargalo que congelou a TV na 010. Ficam invisíveis (toda
      // leitura filtra pela geração ativa) e a pré-carga os apaga em partes
      // (`collectStaleGenerations`).
    },
  )
  // A geração era escrita enquanto ainda estava invisível; agora que o
  // ponteiro mudou, prepare suas categorias antes de sinalizar disponibilidade.
  const categories = await database.categories.where('sourceId').equals(sourceId).filter((category) => category.generation === generation).toArray()
  for (const category of categories) await prepareCategoryReadModel(sourceId, category.id as number, database).catch(() => undefined)
}

/**
 * Apaga, **uma parte por vez**, itens e blocos guardados de gerações que não
 * servem mais (feature 038, D-008, `logic/atualizacao-sem-esfriar.md` §7) — o
 * que `publishGeneration` deixou de apagar numa transação só (com o catálogo
 * pré-carregado, essa transação congelaria a TV). Nunca toca: a geração ativa,
 * gerações apontadas por `storedFrom` (conteúdo novo ainda não lido) e
 * gerações de importação em andamento. Usa só faixas do índice
 * `[sourceId+generation]` entre as protegidas — nunca varre a geração ativa.
 *
 * @returns `true` se ainda sobrou algo para apagar.
 */
export async function collectStaleGenerations(
  sourceId: string,
  options: { batchSize?: number } = {},
  database: CatalogDb = db,
): Promise<boolean> {
  const batchSize = options.batchSize ?? 2000
  const active = await activeGenerationOf(sourceId, database)
  if (active === undefined) return false

  const protectedGenerations = new Set<number>([active])
  const categories = await allCategoryGenerations(database, sourceId).toArray()
  for (const category of categories) {
    if (category.generation === active && category.storedFrom) protectedGenerations.add(category.storedFrom.generation)
  }
  const runs = await database.importRuns.where('[sourceId+status]').equals([sourceId, 'running']).toArray()
  for (const run of runs) protectedGenerations.add(run.generation)

  // Projeções de gerações que já não podem ser lidas não devem sobreviver ao
  // descarte incremental do canônico. Elas são pequenas, mas podem apontar
  // para categorias removidas; limpar aqui também cobre esse caso.
  const readManifests = await database.catalogReadManifests.where('sourceId').equals(sourceId).toArray()
  const staleReadGenerations = new Set(
    readManifests.map((manifest) => manifest.generation).filter((generation) => !protectedGenerations.has(generation)),
  )

  const sorted = [...protectedGenerations].sort((a, b) => a - b)
  const ranges: Array<[number, number]> = []
  let low = KEY_MIN
  for (const generation of sorted) {
    if (generation - 1 >= low) ranges.push([low, generation - 1])
    low = generation + 1
  }
  ranges.push([low, KEY_MAX])

  let deleted = 0
  for (const [from, to] of ranges) {
    if (deleted >= batchSize) break
    const channelKeys = await database.channels
      .where('[sourceId+generation]')
      .between([sourceId, from], [sourceId, to], true, true)
      .limit(batchSize - deleted)
      .primaryKeys()
    if (channelKeys.length > 0) await database.channels.bulkDelete(channelKeys)
    deleted += channelKeys.length
    if (deleted >= batchSize) break
    const entryKeys = await database.storedEntries
      .where('[sourceId+generation]')
      .between([sourceId, from], [sourceId, to], true, true)
      .limit(batchSize - deleted)
      .primaryKeys()
    if (entryKeys.length > 0) await database.storedEntries.bulkDelete(entryKeys)
    deleted += entryKeys.length
    if (deleted >= batchSize) break
    // Blocos (feature 039, §8): cada um conta como um registro.
    const blockKeys = await database.categoryBlocks
      .where('[sourceId+generation+kind]')
      .between([sourceId, from, KIND_MIN], [sourceId, to, KIND_MAX], true, true)
      .limit(batchSize - deleted)
      .primaryKeys()
    if (blockKeys.length > 0) await database.categoryBlocks.bulkDelete(blockKeys)
    deleted += blockKeys.length
  }
  if (staleReadGenerations.size > 0) {
    for (const generation of staleReadGenerations) {
      if (!protectedGenerations.has(generation)) await invalidateGenerationReadModels(sourceId, generation, database)
    }
  }
  // Blocos de uma varredura que já não é apontada: o `storedFrom` limpo pela
  // renovação libera a geração de varredura inteira para a próxima parte.
  return deleted >= batchSize
}

/** Limpa uma importação que não chegou ao fim, sem tocar na geração ativa. */
export async function discardGeneration(
  sourceId: string,
  generation: number,
  database: CatalogDb = db,
): Promise<void> {
  const active = await activeGenerationOf(sourceId, database)
  if (active === generation) {
    // Guarda contra apagar o catálogo que está no ar por um número errado
    // vindo de uma execução antiga.
    throw new Error('Geração ativa não pode ser descartada.')
  }
  await query(database, sourceId, generation).delete()
  await allCategoryGenerations(database, sourceId)
    .and((category) => category.generation === generation)
    .delete()
  await allStoredEntriesGenerations(database, sourceId)
    .and((entry) => entry.generation === generation)
    .delete()
  await blocksOfGeneration(database, sourceId, generation).delete()
  await invalidateGenerationReadModels(sourceId, generation, database)
  await deleteSeriesWatchForGeneration(sourceId, generation, database)
}

/** Remove todo o catálogo de uma fonte, de todas as gerações. */
export async function deleteAllForSource(
  sourceId: string,
  database: CatalogDb = db,
): Promise<void> {
  await allGenerations(database, sourceId).delete()
  await allCategoryGenerations(database, sourceId).delete()
  await allStoredEntriesGenerations(database, sourceId).delete()
  await blocksOfSource(database, sourceId).delete()
  await invalidateSourceReadModels(sourceId, database)
  await deleteSeriesWatchForSource(sourceId, database)
  await clearStagedItems(sourceId, undefined, database)
}
