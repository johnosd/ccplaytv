import { updateSourceConfiguration } from '../catalog/sourceRevision'
import { portalTables } from '../portal/portalTables'
/**
 * Programação guardada no aparelho, por fonte (feature 030,
 * `data-model.md` §2/§3).
 *
 * Substituição por geração: a programação nova é gravada inteira numa
 * geração própria e só então vira a ativa — uma sincronização que falha no
 * meio nunca apaga a anterior (FR-005/SC-006).
 */
import { db, type CatalogDb, type EpgErrorKind, type EpgProgramRecord } from '../catalog/db'
import { EPG_MAX_OFFSET_HOURS, epgStatusOf, isValidEpgUrl } from './epgStatus'
import type { EpgProgram, EpgProgramInput, EpgStatus, EpgWindow } from './types'
import { epgChunks } from '../catalog/chunkTables'

/**
 * Programas por `bulkAdd`: 5 mil reduz trocas de transação no XMLTV grande,
 * mantendo o mesmo limite que a importação de catálogo já usa para não reter
 * o arquivo inteiro na memória.
 */
const WRITE_BATCH_SIZE = 5_000

/** Sinopse guardada truncada — o preview mostra ~3 linhas (data-model §2). */
const MAX_DESCRIPTION_LENGTH = 600
async function gzipJson(value: unknown): Promise<Uint8Array> {
  const compressor = new CompressionStream('gzip')
  const writer = compressor.writable.getWriter()
  // Chromium pode manter o writer bloqueado se a saída só começar a ser
  // consumida depois do `close()`. Inicie a leitura antes de escrever para
  // que o backpressure do stream seja drenado durante a gravação.
  const output = new Response(compressor.readable).arrayBuffer()
  await writer.write(new TextEncoder().encode(JSON.stringify(value)))
  await writer.close()
  return new Uint8Array(await output)
}
async function gunzipJson(bytes: Uint8Array): Promise<unknown> {
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const decompressor = new DecompressionStream('gzip')
  const writer = decompressor.writable.getWriter()
  const output = new Response(decompressor.readable).text()
  await writer.write(new Uint8Array(copy)); await writer.close()
  return JSON.parse(await output)
}

/** Endereço manual recusado. A mensagem nunca ecoa o endereço (ADR-010). */
export class InvalidEpgUrlError extends Error {
  constructor() {
    super('Endereço de EPG inválido.')
    this.name = 'InvalidEpgUrlError'
  }
}

function toRecord(sourceId: string, generation: number, program: EpgProgramInput): EpgProgramRecord {
  const description = program.description?.trim()
  return {
    sourceId,
    generation,
    channelKey: program.channelKey,
    start: program.start,
    end: program.end,
    title: program.title,
    description: description ? description.slice(0, MAX_DESCRIPTION_LENGTH) : undefined,
  }
}

/** Apaga as linhas de uma fonte cuja geração não é `keep` (`undefined` = todas). */
async function deleteGenerationsExcept(sourceId: string, keep: number | undefined, database: CatalogDb): Promise<void> {
  await database.epgPrograms
    .where('[sourceId+generation]')
    .between([sourceId, -Infinity], [sourceId, Infinity])
    .filter((row) => row.generation !== keep)
    .delete()
}

/**
 * Grava uma programação completa como nova geração e a publica, apagando a
 * anterior só depois. Aceita fluxo (a leitura do XMLTV não materializa o
 * arquivo inteiro). Falha no meio: apaga só a geração parcial e relança —
 * a ativa continua intacta.
 */
export async function writeEpgPrograms(
  sourceId: string,
  programs: Iterable<EpgProgramInput> | AsyncIterable<EpgProgramInput>,
  database: CatalogDb = db,
): Promise<{ programCount: number }> {
  const source = await database.sources.get(sourceId)
  if (!source) return { programCount: 0 }

  const active = source.epgActiveGeneration
  // Sobra de um app fechado no meio de uma gravação anterior: nunca mistura
  // com a geração nova.
  await deleteGenerationsExcept(sourceId, active, database)
  const generation = (active ?? 0) + 1

  let programCount = 0
  try {
    const grouped = new Map<string, EpgProgramRecord[]>()
    let batch: EpgProgramRecord[] = []
    for await (const program of programs) {
      if (!program.channelKey || !program.title) continue
      batch.push(toRecord(sourceId, generation, program))
      const current = batch[batch.length - 1]
      const group = grouped.get(current.channelKey) ?? []
      group.push(current); grouped.set(current.channelKey, group)
      if (batch.length >= WRITE_BATCH_SIZE) {
        await database.epgPrograms.bulkAdd(batch)
        programCount += batch.length
        batch = []
      }
    }
    if (batch.length > 0) {
      await database.epgPrograms.bulkAdd(batch)
      programCount += batch.length
    }
    const chunks = []
    for (const [channelKey, rows] of grouped) {
      rows.sort((a, b) => a.start - b.start)
      chunks.push({ sourceId, generation, channelKey, from: rows[0].start, to: rows[rows.length - 1].end, count: rows.length, bytes: await gzipJson(rows) })
    }
    await epgChunks(database).where('[sourceId+generation]').equals([sourceId, generation]).delete()
    await epgChunks(database).bulkPut(chunks)
    await database.sources.update(sourceId, { epgStoredBytes: chunks.reduce((sum, row) => sum + row.bytes.byteLength, 0) })

    await database.transaction('rw', database.sources, database.epgPrograms, async () => {
      await database.sources.update(sourceId, { epgActiveGeneration: generation })
      await deleteGenerationsExcept(sourceId, generation, database)
    })
  } catch (error) {
    await deleteGenerationsExcept(sourceId, active, database).catch(() => {
      // Descarte da geração parcial é melhor-esforço: o erro que trouxe até
      // aqui (quota, leitura) é o que importa para quem chamou.
    })
    throw error
  }
  return { programCount }
}

/**
 * Programas da geração ativa, por id de canal do XMLTV, que se sobrepõem a
 * `range`, ordenados por início. Canal sem nada fica fora do mapa.
 * **Nunca toca rede** (FR-029).
 */
export async function listProgramsForChannels(
  sourceId: string,
  channelKeys: readonly string[],
  range: EpgWindow,
  database: CatalogDb = db,
): Promise<Map<string, EpgProgram[]>> {
  const result = new Map<string, EpgProgram[]>()
  const keys = [...new Set(channelKeys.filter((key) => key !== ''))]
  if (keys.length === 0) return result

  await database.transaction('r', database.sources, database.epgPrograms, async () => {
    const generation = (await database.sources.get(sourceId))?.epgActiveGeneration
    if (generation === undefined) return

    for (const key of keys) {
      const rows = await database.epgPrograms
        .where('[sourceId+generation+channelKey+start]')
        .between([sourceId, generation, key, -Infinity], [sourceId, generation, key, range.to], true, false)
        .filter((row) => row.end > range.from)
        .toArray()
      if (rows.length === 0) continue
      result.set(
        key,
        rows.map((row) => ({
          channelKey: row.channelKey,
          start: row.start,
          end: row.end,
          title: row.title,
          description: row.description,
        })),
      )
    }
  })
  const generation = (await database.sources.get(sourceId))?.epgActiveGeneration
  if (generation !== undefined) {
    const compressed = await epgChunks(database).where('[sourceId+generation]').equals([sourceId, generation]).toArray()
    for (const chunk of compressed) {
      const rows = (await gunzipJson(chunk.bytes)) as EpgProgramRecord[]
      const filtered = rows.filter((row) => row.end > range.from && row.start < range.to)
      if (filtered.length) result.set(chunk.channelKey, filtered.map((row) => ({ channelKey: row.channelKey, start: row.start, end: row.end, title: row.title, description: row.description })))
    }
  }
  return result
}

/** Estado persistido do EPG da fonte (FR-015). `undefined` se a fonte não existe. */
export async function getEpgStatus(sourceId: string, database: CatalogDb = db): Promise<EpgStatus | undefined> {
  const record = await database.sources.get(sourceId)
  return record ? epgStatusOf(record) : undefined
}

/** Apaga toda a programação da fonte, de todas as gerações (FR-012/FR-021). */
export async function deleteEpgForSource(sourceId: string, database: CatalogDb = db): Promise<void> {
  await deleteGenerationsExcept(sourceId, undefined, database)
  await epgChunks(database).where('sourceId').equals(sourceId).delete()
  await database.sources.update(sourceId, { epgActiveGeneration: undefined })
}

/** Registra sincronização bem-sucedida: avança a marca e limpa o erro anterior (FR-005). */
export async function recordEpgSuccess(sourceId: string, at: number, database: CatalogDb = db): Promise<void> {
  await database.sources.update(sourceId, {
    epgLastSyncAt: at,
    epgLastErrorKind: undefined,
    epgLastErrorAt: undefined,
  })
}

/** Registra falha por categoria — **não** avança `epgLastSyncAt` nem toca a programação (FR-005). */
export async function recordEpgFailure(
  sourceId: string,
  kind: EpgErrorKind,
  at: number,
  database: CatalogDb = db,
): Promise<void> {
  await database.sources.update(sourceId, { epgLastErrorKind: kind, epgLastErrorAt: at })
}

/**
 * Grava (ou limpa, com `undefined`/vazio) o endereço XMLTV manual. Valida
 * antes (FR-018) e nunca ecoa o endereço no erro. Trocar o endereço zera o
 * erro anterior — era de outro endereço.
 */
export async function setEpgManualUrl(
  sourceId: string,
  url: string | undefined,
  database: CatalogDb = db,
): Promise<void> {
  const trimmed = url?.trim()
  if (trimmed && !isValidEpgUrl(trimmed)) throw new InvalidEpgUrlError()
  await updateSourceConfiguration(sourceId, {
    epgManualUrl: trimmed || undefined,
    epgLastErrorKind: undefined,
    epgLastErrorAt: undefined,
  }, database)
}

/** Deslocamento manual, inteiro, entre −12 e +12 (FR-016). Não baixa nada (FR-020). */
export async function setEpgOffsetHours(sourceId: string, hours: number, database: CatalogDb = db): Promise<void> {
  const rounded = Number.isFinite(hours) ? Math.round(hours) : 0
  const clamped = Math.max(-EPG_MAX_OFFSET_HOURS, Math.min(EPG_MAX_OFFSET_HOURS, rounded))
  await updateSourceConfiguration(sourceId, { epgOffsetHours: clamped === 0 ? undefined : clamped }, database)
}

/**
 * Ativa/desativa o EPG da fonte (FR-021). Desativar apaga a programação e a
 * marca de sincronização — reativar começa "nunca sincronizado".
 */
export async function setEpgEnabled(sourceId: string, enabled: boolean, database: CatalogDb = db): Promise<void> {
  await database.transaction('rw', [database.sources, database.epgPrograms, portalTables(database).revisions, epgChunks(database)] as any, async () => {
    if (enabled) {
      await updateSourceConfiguration(sourceId, { epgDisabled: undefined }, database)
      return
    }
    const updated = await updateSourceConfiguration(sourceId, {
      epgDisabled: true,
      epgLastSyncAt: undefined,
      epgLastErrorKind: undefined,
      epgLastErrorAt: undefined,
    }, database)
    if (updated) await deleteEpgForSource(sourceId, database)
  })
}
