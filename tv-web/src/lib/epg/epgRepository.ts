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

/** Programas por `bulkAdd`: amortiza a transação sem segurar o arquivo na memória (data-model §2). */
const WRITE_BATCH_SIZE = 2_000

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
    let batch: EpgProgramRecord[] = []
    for await (const program of programs) {
      if (!program.channelKey || !program.title) continue
      batch.push(toRecord(sourceId, generation, program))
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
  await database.sources.update(sourceId, {
    epgManualUrl: trimmed || undefined,
    epgLastErrorKind: undefined,
    epgLastErrorAt: undefined,
  })
}

/** Deslocamento manual, inteiro, entre −12 e +12 (FR-016). Não baixa nada (FR-020). */
export async function setEpgOffsetHours(sourceId: string, hours: number, database: CatalogDb = db): Promise<void> {
  const rounded = Number.isFinite(hours) ? Math.round(hours) : 0
  const clamped = Math.max(-EPG_MAX_OFFSET_HOURS, Math.min(EPG_MAX_OFFSET_HOURS, rounded))
  await database.sources.update(sourceId, { epgOffsetHours: clamped === 0 ? undefined : clamped })
}

/**
 * Ativa/desativa o EPG da fonte (FR-021). Desativar apaga a programação e a
 * marca de sincronização — reativar começa "nunca sincronizado".
 */
export async function setEpgEnabled(sourceId: string, enabled: boolean, database: CatalogDb = db): Promise<void> {
  if (enabled) {
    await database.sources.update(sourceId, { epgDisabled: undefined })
    return
  }
  await database.sources.update(sourceId, {
    epgDisabled: true,
    epgLastSyncAt: undefined,
    epgLastErrorKind: undefined,
    epgLastErrorAt: undefined,
  })
  await deleteEpgForSource(sourceId, database)
}
