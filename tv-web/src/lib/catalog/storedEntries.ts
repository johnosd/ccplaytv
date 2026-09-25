/**
 * Blocos do conteúdo M3U guardado no aparelho (feature 014, D-004/D-005,
 * `data-model.md` §3).
 *
 * Existe só no caminho do arquivo guardado (`fetchMode: 'stored'`): a
 * importação guarda o conteúdo já classificado e separado por categoria —
 * nunca o texto bruto — em blocos, por causa do teto de memória em buffer
 * durante a varredura. `categoryLoader.ts` lê os blocos de uma categoria
 * ao entrar nela; `catalogRepository.ts` é quem apaga os blocos lidos
 * (dentro da mesma transação que grava os itens em `channels` — D-007), e
 * quem descarta blocos de uma geração inteira (publicação/descarte/remoção
 * de fonte). Fora esses dois arquivos, nada mais toca `storedEntries`.
 */

import { db, type CatalogDb, type StoredCatalogRecord, type StoredEntriesRecord } from './db'
import { isQuotaError, StorageFullError } from './catalogRepository'

const KEY_MIN = -1
const KEY_MAX = Number.MAX_SAFE_INTEGER

export interface EntryChunkInput {
  sourceId: string
  generation: number
  categoryId: number
  chunk: number
  records: StoredCatalogRecord[]
}

function chunkRange(sourceId: string, generation: number, categoryId: number) {
  return [
    [sourceId, generation, categoryId, KEY_MIN],
    [sourceId, generation, categoryId, KEY_MAX],
  ] as const
}

/**
 * Grava um ou mais blocos, numa única transação (tudo entra ou nada
 * entra). Falta de espaço sobe como `StorageFullError`, para a varredura
 * (`importPipeline.ts`) poder falhar a importação em vez de fingir que
 * gravou (D-009) — diferente de `storeBatch`, aqui não há publicação
 * parcial: um bloco perdido no meio deixaria uma categoria com itens
 * incompletos e sem como saber disso depois.
 */
export async function storeEntryChunks(
  chunks: EntryChunkInput[],
  database: CatalogDb = db,
): Promise<void> {
  if (chunks.length === 0) return
  try {
    await database.transaction('rw', database.storedEntries, async () => {
      await database.storedEntries.bulkAdd(chunks as StoredEntriesRecord[])
    })
  } catch (error) {
    if (isQuotaError(error)) throw new StorageFullError()
    throw error
  }
}

/** Os blocos de uma categoria, na ordem em que foram gravados (D-007). */
export async function readEntryChunks(
  sourceId: string,
  generation: number,
  categoryId: number,
  database: CatalogDb = db,
): Promise<StoredEntriesRecord[]> {
  const [low, high] = chunkRange(sourceId, generation, categoryId)
  const rows = await database.storedEntries
    .where('[sourceId+generation+categoryId+chunk]')
    .between(low, high, true, true)
    .toArray()
  return rows.sort((a, b) => a.chunk - b.chunk)
}

/** Quantos blocos uma categoria tem guardados agora — usada só para diagnóstico/teste. */
export async function countEntryChunks(
  sourceId: string,
  generation: number,
  categoryId: number,
  database: CatalogDb = db,
): Promise<number> {
  const [low, high] = chunkRange(sourceId, generation, categoryId)
  return database.storedEntries.where('[sourceId+generation+categoryId+chunk]').between(low, high, true, true).count()
}
