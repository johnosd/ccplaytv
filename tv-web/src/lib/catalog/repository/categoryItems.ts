/** Gravação e renovação dos itens de uma categoria. Parte da divisão de `catalogRepository.ts` (feature 063); a fachada reexporta. */

import { db, type CatalogDb, type CatalogRecord, type CategoryKind, type StoredCatalogRecord } from '../db'
import { BlockRevisionConflict, blockWriteTables, commitBlockWrite, prepareBlockWrite, writeCompressedBlock,
  type BlockWriteOptions } from '../blockWrite'
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
  /**
   * Feature 082: chamado com os bytes já codificados, antes da transação (`makeRoomFor`); `false` = sem espaço
   * (`StorageFullError`, nada gravado).
   */
  room?: (needBytes: number) => Promise<boolean>,
  /**
   * Feature 086 (FR-003): quem carrega uma seção inteira junta os candidatos das categorias e grava uma vez no fim.
   * Sem isto, cada categoria grava os seus na hora — o certo quando é uma categoria só.
   */
  collectCandidates?: BlockWriteOptions['collectCandidates'],
): Promise<{ written: boolean }> {
  try {
    // Feature 082: formato comprimido em pedaços, em duas fases (`blockWrite.ts`) — sem 2ª cópia (projeção 065).
    const result = await writeCompressedBlock(target, items, now, database, { room, collectCandidates })
    if (result.storageFull) throw new StorageFullError()
    return { written: result.written }
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
  const records = items.map((item) => ({ ...item, sourceId: target.sourceId, generation: target.generation }))
  try {
    for (let attempt = 0; ; attempt += 1) {
      // Fase 1 fora da transação (feature 082): compressão nunca dentro dela.
      const prepared = await prepareBlockWrite(target, records, database)
      if (prepared === 'missing') return
      try {
        await database.transaction('rw', [...blockWriteTables(database), database.storedEntries], async () => {
          // Episódios: substituição integral (D-011 da 038) — retomada e
          // "assistido" são por `stableId`, não pelo id local do episódio.
          await database.channels
            .where('[sourceId+generation+kind+groupOrder]')
            .equals([target.sourceId, target.generation, 'episode', target.groupOrder])
            .delete()

          // Itens: formato comprimido, com id preservado (features 038/039/082). A posição na ordem do arquivo
          // continua sendo a base do número do canal — `logic/numero-do-canal.md` §4.
          if (prepared === 'unchanged') await database.categories.update(target.categoryId, { itemsFetchedAt: now })
          else await commitBlockWrite(prepared, now, database)

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

          // O ponteiro para os blocos da atualização some junto com os blocos.
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
        })
        return
      } catch (error) {
        if (error instanceof BlockRevisionConflict && attempt < 2) continue
        throw error
      }
    }
  } catch (error) {
    if (isQuotaError(error)) throw new StorageFullError()
    throw error
  }
}
