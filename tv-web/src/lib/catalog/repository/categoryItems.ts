/** Gravação e renovação dos itens de uma categoria. Parte da divisão de `catalogRepository.ts` (feature 063); a fachada reexporta. */

import { db, type CatalogDb, type CatalogRecord, type CategoryKind, type StoredCatalogRecord } from '../db'
import { writeBlockWithin } from '../categoryBlocks'
import { prepareCategoryReadModel } from './categoryWindow'
import { KEY_MAX, KEY_MIN, StorageFullError, isQuotaError } from './shared'

/** Identifica a categoria alvo de uma substituição integral de itens. */
export interface CategoryItemsTarget {
  sourceId: string
  generation: number
  kind: CategoryKind
  categoryId: number
  /** Mesmo valor de `order` da categoria — é o que localiza os itens dela em `channels`. */
  groupOrder: number
}

/**
 * Substitui integralmente os itens de uma categoria e carimba a obtenção,
 * numa única transação (contrato §1, D-006).
 *
 * Desde a feature 039 os itens vão para o **bloco** da categoria
 * (`categoryBlocks.ts`), e as linhas antigas daquela categoria saem no mesmo
 * lock — nunca item órfão, nunca duas cópias. A posição na ordem em que o
 * provedor entregou continua sendo a base do número do canal (feature 024,
 * `logic/numero-do-canal.md` §4): é a posição no bloco.
 */
export async function storeCategoryItems(
  target: CategoryItemsTarget,
  items: CatalogRecord[],
  now: number,
  database: CatalogDb = db,
): Promise<void> {
  await renewCategoryItems(target, items, now, database)
}

/**
 * Renova os itens de uma categoria **preservando o id local** de cada item que
 * continua na fonte (feature 038, FR-027, `logic/atualizacao-sem-esfriar.md`
 * §4) — foco, detalhe aberto e snapshot de volta guardam esse id. Casa por
 * identidade (id do provedor; série pelo `seriesId`; M3U pelo nome original),
 * nunca por posição nem por URL. Item que saiu é removido, item novo ganha id
 * novo, e campos gravados por outros carregadores (`episodesFetchedAt`) são
 * mantidos. Assinatura igual à gravada = nada é escrito além do instante
 * (`written: false`).
 */
export async function renewCategoryItems(
  target: CategoryItemsTarget,
  items: CatalogRecord[],
  now: number,
  database: CatalogDb = db,
): Promise<{ written: boolean }> {
  try {
    const result = await database.transaction(
      'rw',
      [database.channels, database.categories, database.categoryBlocks, database.catalogReadManifests, database.catalogReadChunks] as any,
      async () => ({ written: await writeBlockWithin(target, items, now, database) }),
    )
    // Também tenta reparar uma projeção perdida por quota numa renovação
    // idêntica; a preparação é idempotente quando já está pronta.
    await prepareCategoryReadModel(target.sourceId, target.categoryId, database).catch(() => undefined)
    return result
  } catch (error) {
    if (isQuotaError(error)) throw new StorageFullError()
    throw error
  }
}

/** Identifica a categoria `stored` cujo conteúdo guardado está sendo lido (feature 014). */
export interface StoredCategoryTarget {
  sourceId: string
  generation: number
  kind: CategoryKind
  categoryId: number
  /** Mesmo valor de `order` da categoria — episódios da série desta categoria também têm este `groupOrder`. */
  groupOrder: number
}

/**
 * Lê uma categoria do conteúdo guardado: grava os itens (e, para uma
 * categoria de séries, os episódios) em `channels`, carimba a obtenção e
 * apaga os blocos lidos — tudo numa única transação (feature 014, D-007).
 *
 * Depois desta chamada, a categoria nunca mais é lida do conteúdo guardado
 * na mesma geração: `itemsFetchedAt` passa a existir, e é isso que
 * `ensureCategory` (`categoryLoader.ts`) usa para devolver `fresh` sem
 * tocar `storedEntries` de novo.
 */
export async function storeStoredCategory(
  target: StoredCategoryTarget,
  items: StoredCatalogRecord[],
  episodes: StoredCatalogRecord[],
  now: number,
  database: CatalogDb = db,
  /**
   * Feature 038 (`logic/atualizacao-sem-esfriar.md` §4.3): de onde vieram os
   * blocos — a geração de varredura de uma atualização (`storedFrom`).
   * Ausente = os blocos são da própria categoria (regra da 014).
   */
  chunksFrom?: { generation: number; categoryId: number },
): Promise<void> {
  try {
    await database.transaction(
      'rw',
      [database.channels, database.categories, database.storedEntries, database.categoryBlocks, database.catalogReadManifests, database.catalogReadChunks] as any,
      async () => {
        // Episódios: substituição integral (D-011 da 038) — retomada e
        // "assistido" são por `stableId`, não pelo id local do episódio.
        await database.channels
          .where('[sourceId+generation+kind+groupOrder]')
          .equals([target.sourceId, target.generation, 'episode', target.groupOrder])
          .delete()

        // Itens: bloco da categoria, com id preservado (feature 038, D-006;
        // feature 039). A posição na ordem do arquivo continua sendo
        // `categoryPosition`, base do número do canal — `logic/numero-do-canal.md` §4.
        await writeBlockWithin(
          target,
          items.map((item) => ({ ...item, sourceId: target.sourceId, generation: target.generation })),
          now,
          database,
        )

        if (episodes.length > 0) {
          await database.channels.bulkAdd(
            episodes.map((episode) => ({
              ...episode,
              sourceId: target.sourceId,
              generation: target.generation,
              kind: 'episode',
              groupOrder: target.groupOrder,
              // Episódio nunca tem categoria navegável própria (D-001, feature 012).
              categoryId: undefined,
            })),
          )
        }

        // `writeBlockWithin` já carimbou `itemsFetchedAt`/`itemsCount`; o ponteiro
        // para os blocos da atualização some junto com os blocos.
        await database.categories.update(target.categoryId, { storedFrom: undefined })

        const from = chunksFrom ?? { generation: target.generation, categoryId: target.categoryId }
        await database.storedEntries
          .where('[sourceId+generation+categoryId+chunk]')
          .between(
            [target.sourceId, from.generation, from.categoryId, KEY_MIN],
            [target.sourceId, from.generation, from.categoryId, KEY_MAX],
            true,
            true,
          )
          .delete()
      },
    )
    await prepareCategoryReadModel(target.sourceId, target.categoryId, database).catch(() => undefined)
  } catch (error) {
    if (isQuotaError(error)) throw new StorageFullError()
    throw error
  }
}
