/**
 * Só para testes: tudo o que está gravado de uma fonte (ou de todas), nos
 * dois formatos — linhas de `channels` (episódios, formato antigo) e itens de
 * bloco (`categoryBlocks`, feature 039). Testes que conferem o que a
 * importação/leitura gravou olham por aqui, não pela tabela `channels` crua,
 * porque desde a 039 os itens de categoria vivem em blocos.
 */

import { blockRecords } from '../lib/catalog/categoryBlocks'
import type { CatalogDb, CatalogRecord } from '../lib/catalog/db'
import { readBlockChunks } from '../lib/catalog/blockChunks'

export async function storedItems(database: CatalogDb, sourceId?: string): Promise<CatalogRecord[]> {
  const rows = sourceId
    ? await database.channels.where('sourceId').equals(sourceId).toArray()
    : await database.channels.toArray()
  const blocks = (await database.categoryBlocks.toArray()).filter(
    (block) => sourceId === undefined || block.sourceId === sourceId,
  )
  const compressed = (await Promise.all(blocks.filter((block) => block.format === 2).map((block) => readBlockChunks(database, block.categoryId)))).flat()
  return [...rows, ...blocks.filter((block) => block.format !== 2).flatMap(blockRecords), ...compressed]
}
