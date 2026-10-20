/**
 * Guia comprimido por canal (feature 082, `logic/formato-comprimido.md` §6, D-005): os programas de cada canal na janela
 * vão num registro só de `epgChunks`, em gzip. Medido na TV: o guia real (10 122 programas, 104 canais) grava em ~1,0 s
 * no Worker do guia, contra 10,2 s em linhas, e ocupa ~0,6 MB contra ~7 MB.
 *
 * Regras: comprimir e descomprimir fora de transação; gravar em lotes de no máximo `EPG_CHUNK_BATCH` canais por
 * transação (R-013: transação grande foi abortada por inatividade na TV).
 */
import type { CatalogDb, EpgProgramRecord } from '../catalog/db'
import { epgChunks, type EpgChunkRecord } from '../catalog/chunkTables'
import { gunzipText, gzipText } from '../catalog/blockCodec'
import type { EpgProgram, EpgWindow } from './types'

/** Canais por transação (R-013). */
export const EPG_CHUNK_BATCH = 200

/** Programa enxuto: `[início, fim, título, sinopse?]` (o canal e a fonte já estão no registro). */
type CompactProgram = [number, number, string, string?]

/** Comprime os programas de cada canal (fora de transação) e grava a geração em lotes. Devolve os bytes gravados. */
export async function writeEpgChunks(
  database: CatalogDb,
  sourceId: string,
  generation: number,
  byChannel: ReadonlyMap<string, EpgProgramRecord[]>,
): Promise<number> {
  let bytes = 0
  let batch: EpgChunkRecord[] = []
  const flush = async () => {
    if (batch.length === 0) return
    await epgChunks(database).bulkPut(batch)
    batch = []
  }
  for (const [channelKey, rows] of byChannel) {
    if (rows.length === 0) continue
    rows.sort((a, b) => a.start - b.start)
    const compact = rows.map((row): CompactProgram => row.description === undefined
      ? [row.start, row.end, row.title] : [row.start, row.end, row.title, row.description])
    const encoded = await gzipText(JSON.stringify(compact))
    bytes += encoded.byteLength
    batch.push({ sourceId, generation, channelKey, from: rows[0].start, to: Math.max(...rows.map((row) => row.end)),
      count: rows.length, bytes: encoded })
    if (batch.length >= EPG_CHUNK_BATCH) await flush()
  }
  await flush()
  return bytes
}

/**
 * Programas dos canais pedidos que se sobrepõem a `range`, ordenados por início: `bulkGet` só desses canais e
 * descompressão depois da leitura. Canal sem nada fica fora do mapa.
 */
export async function readEpgChunks(
  database: CatalogDb,
  sourceId: string,
  generation: number,
  channelKeys: readonly string[],
  range: EpgWindow,
): Promise<Map<string, EpgProgram[]>> {
  const result = new Map<string, EpgProgram[]>()
  const rows = await epgChunks(database).bulkGet(channelKeys.map((key) => [sourceId, generation, key] as [string, number, string]))
  for (const row of rows) {
    if (!row || row.to <= range.from || row.from >= range.to) continue
    const programs = (JSON.parse(await gunzipText(row.bytes)) as CompactProgram[])
      .filter(([start, end]) => end > range.from && start < range.to)
      .map(([start, end, title, description]): EpgProgram => ({ channelKey: row.channelKey, start, end, title, description }))
    if (programs.length > 0) result.set(row.channelKey, programs)
  }
  return result
}

/** Apaga os pedaços do guia de uma fonte cuja geração não é `keep` (`undefined` = todas). Pelas chaves do índice. */
export async function deleteEpgChunksExcept(database: CatalogDb, sourceId: string, keep: number | undefined): Promise<void> {
  const index = epgChunks(database).where('[sourceId+generation]')
  if (keep === undefined) {
    await index.between([sourceId, -Infinity], [sourceId, Infinity], true, true).delete()
    return
  }
  await index.between([sourceId, -Infinity], [sourceId, keep], true, false).delete()
  await index.between([sourceId, keep], [sourceId, Infinity], false, true).delete()
}
