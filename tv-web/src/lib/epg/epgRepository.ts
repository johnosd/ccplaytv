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
import { isQuotaError } from '../catalog/catalogRepository'
import { deleteEpgChunksExcept, readEpgChunks, writeEpgChunks } from './epgChunkStore'

/** Sinopse guardada truncada — o preview mostra ~3 linhas (data-model §2). */
const MAX_DESCRIPTION_LENGTH = 600

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
  if (keep === undefined) {
    await database.epgPrograms.where('[sourceId+generation]').between([sourceId, -Infinity], [sourceId, Infinity]).delete()
    return
  }
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
 *
 * Feature 082 (D-005): grava só o formato comprimido por canal (`epgChunkStore.ts`), no Worker do guia; ao publicar,
 * as linhas do formato antigo (`epgPrograms`) e os pedaços de outras gerações saem.
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
  await deleteEpgChunksExcept(database, sourceId, active)
  const generation = (active ?? 0) + 1

  let programCount = 0
  try {
    const byChannel = new Map<string, EpgProgramRecord[]>()
    for await (const program of programs) {
      if (!program.channelKey || !program.title) continue
      const record = toRecord(sourceId, generation, program)
      const group = byChannel.get(record.channelKey)
      if (group) group.push(record)
      else byChannel.set(record.channelKey, [record])
      programCount += 1
    }
    let storedBytes: number
    try {
      storedBytes = await writeEpgChunks(database, sourceId, generation, byChannel)
    } catch (error) {
      // Banco cheio com o guia ainda em linhas (formato anterior à 082, ~7 MB): gravar o novo antes de apagar o velho nunca
      // caberia. Apaga as linhas — o guia fica "ainda não sincronizado" por um instante, nunca vazio calado — e tenta 1×.
      if (!isQuotaError(error) || source.epgStoredBytes !== undefined) throw error
      await deleteGenerationsExcept(sourceId, undefined, database)
      await deleteEpgChunksExcept(database, sourceId, undefined)
      // Acima da cota até este `update` falha (só remoção passa): a nova tentativa abaixo é que decide.
      await database.sources.update(sourceId, { epgActiveGeneration: undefined, epgLastSyncAt: undefined }).catch(() => undefined)
      storedBytes = await writeEpgChunks(database, sourceId, generation, byChannel)
    }

    await database.transaction('rw', [database.sources, database.epgPrograms, epgChunks(database)], async () => {
      await database.sources.update(sourceId, { epgActiveGeneration: generation, epgStoredBytes: storedBytes })
      await deleteGenerationsExcept(sourceId, undefined, database)
      await deleteEpgChunksExcept(database, sourceId, generation)
    })
  } catch (error) {
    await deleteEpgChunksExcept(database, sourceId, active).catch(() => {
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
  // Feature 082: geração gravada no formato comprimido (tem `epgStoredBytes`) → só os canais pedidos, por `bulkGet`.
  const source = await database.sources.get(sourceId)
  if (source?.epgActiveGeneration !== undefined && source.epgStoredBytes !== undefined) {
    return readEpgChunks(database, sourceId, source.epgActiveGeneration, keys, range)
  }

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
  await deleteEpgChunksExcept(database, sourceId, undefined)
  await database.sources.update(sourceId, { epgActiveGeneration: undefined, epgStoredBytes: undefined })
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
  await database.transaction('rw', [database.sources, database.epgPrograms, portalTables(database).revisions, epgChunks(database)], async () => {
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
