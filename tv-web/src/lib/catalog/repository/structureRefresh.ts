/** Atualização de estrutura na geração ativa (feature 038). Parte da divisão de `catalogRepository.ts` (feature 063); a fachada reexporta. */

import { db, type CatalogDb, type CatalogFetchMode, type CategoryKind, type CategoryRecord } from '../db'
import { categoryMatchKey, diffCategories } from '../structureDiff'
import { blockRecords } from '../categoryBlocks'
import { invalidateCategoryReadModel } from './readProjection'
import { categoryChunks } from '../chunkTables'

/** Uma categoria lida numa atualização (feature 038, `logic/atualizacao-sem-esfriar.md` §4). */
export interface RefreshedCategory {
  kind: CategoryKind
  fetchMode: CatalogFetchMode
  providerCategoryId?: string
  name?: string
  /** Posição de exibição declarada nesta atualização. */
  position: number
  declaredCount?: number
  /** Só `stored`: onde está o conteúdo novo (geração de varredura). */
  storedFrom?: { generation: number; categoryId: number }
}

export interface StructureRefreshResult {
  kept: number
  added: number
  removed: number
}

/**
 * Aplica uma atualização de estrutura **na geração ativa** (feature 038,
 * D-004, `logic/atualizacao-sem-esfriar.md` §4.2/§4.3): categoria mantida
 * conserva id, `order` e itens (servidos até a renovação chegar) e ganha
 * nome/posição/contagem novos e `renewRequestedAt`; categoria nova entra fria,
 * com o próximo `order` livre da seção; categoria que saiu vai embora com os
 * itens (e, se de séries, os episódios delas). Seções fora de `kinds` (o
 * painel não as serviu) ficam intactas. Uma transação: ou tudo, ou nada
 * (FR-030).
 */
export async function applyStructureRefresh(
  sourceId: string,
  generation: number,
  kinds: readonly CategoryKind[],
  incoming: readonly RefreshedCategory[],
  now: number,
  database: CatalogDb = db,
): Promise<StructureRefreshResult> {
  return database.transaction(
    'rw',
    [database.categories, database.channels, database.categoryBlocks, database.catalogReadManifests, database.catalogReadChunks, categoryChunks(database)] as any,
    async () => {
    const existing = (await database.categories.where('sourceId').equals(sourceId).toArray()).filter(
      (record) => record.generation === generation && kinds.includes(record.kind),
    )
    const diff = diffCategories(
      existing.map((record) => ({
        id: record.id as number,
        kind: record.kind,
        matchKey: categoryMatchKey(record.providerCategoryId, record.name),
      })),
      incoming.map((category, index) => ({
        kind: category.kind,
        matchKey: categoryMatchKey(category.providerCategoryId, category.name),
        name: category.name,
        position: index,
        declaredCount: category.declaredCount,
      })),
    )
    // O diff devolve os `IncomingCategory` que recebeu — voltar ao registro completo pela posição.
    const full = (position: number) => incoming[position]

    for (const { id, incoming: next } of diff.keep) {
      const source = full(next.position)
      await database.categories.update(id, {
        name: source.name,
        position: source.position,
        declaredCount: source.declaredCount,
        renewRequestedAt: now,
        ...(source.storedFrom ? { storedFrom: source.storedFrom } : {}),
      })
    }

    const nextOrder = new Map<CategoryKind, number>()
    for (const record of existing) {
      nextOrder.set(record.kind, Math.max(nextOrder.get(record.kind) ?? -1, record.order))
    }
    for (const next of diff.add) {
      const source = full(next.position)
      const order = (nextOrder.get(source.kind) ?? -1) + 1
      nextOrder.set(source.kind, order)
      await database.categories.add({
        sourceId,
        generation,
        kind: source.kind,
        fetchMode: source.fetchMode,
        providerCategoryId: source.providerCategoryId,
        name: source.name,
        order,
        position: source.position,
        declaredCount: source.declaredCount,
        storedFrom: source.storedFrom,
      } as CategoryRecord)
    }

    for (const id of diff.remove) {
      const record = existing.find((candidate) => candidate.id === id)
      if (!record) continue
      const rows = await database.channels
        .where('[sourceId+generation+kind+groupOrder]')
        .equals([sourceId, generation, record.kind, record.order])
        .toArray()
      // Feature 039: a categoria pode estar em bloco (formato novo) ou em
      // linhas (antigo, ainda não convertida) — as duas saem.
      const block = await database.categoryBlocks.get(id)
      const items = [...rows, ...(block ? blockRecords(block) : [])]
      if (block) await database.categoryBlocks.delete(id)
      await categoryChunks(database).where('[categoryId+chunk]').between([id, -1], [id, Number.MAX_SAFE_INTEGER], true, true).delete()
      await invalidateCategoryReadModel(id, database)
      if (record.kind === 'series') {
        for (const seriesId of new Set(items.map((item) => item.seriesId).filter((value): value is string => !!value))) {
          await database.channels
            .where('[sourceId+generation+seriesId]')
            .equals([sourceId, generation, seriesId])
            .delete()
        }
        // Episódios de série M3U guardam o `groupOrder` da categoria.
        await database.channels
          .where('[sourceId+generation+kind+groupOrder]')
          .equals([sourceId, generation, 'episode', record.order])
          .delete()
      }
      await database.channels.bulkDelete(rows.map((item) => item.id as number))
      await database.categories.delete(id)
    }

    return { kept: diff.keep.length, added: diff.add.length, removed: diff.remove.length }
    },
  )
}
