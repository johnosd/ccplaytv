/**
 * Uma sincronização de EPG, ponta a ponta (feature 030, `logic/sincronizacao-epg.md`):
 * resolve o endereço (FR-001) → baixa (gzip ou não, FR-002) → lê em fluxo
 * (FR-003) → grava como nova geração (FR-004) → registra o estado.
 *
 * Roda no Worker de EPG (ou na thread principal, se o Worker não subir —
 * mesmo plano B do `importRunner.ts`). **Não** faz single-flight: isso é do
 * executor na thread principal (`epgRunner.ts`, FR-010), que é quem sabe o
 * que está em andamento.
 *
 * **Nada aqui registra o erro cru** (nem `logger`, nem `console`): a mensagem
 * de um `fetch` que falhou embute o endereço, que pode ter credencial ou
 * token (ADR-010). Só a categoria (`EpgErrorKind`) sobrevive.
 */
import { db, type CatalogDb, type EpgErrorKind } from '../catalog/db'
import { isQuotaError } from '../catalog/catalogRepository'
import { isAbortError } from '../catalog/xtreamConnector'
import { deleteEpgForSource, recordEpgFailure, recordEpgSuccess, writeEpgPrograms } from './epgRepository'
import { EpgFailure, requireXmltvRoot, textChunks } from './epgFetch'
import { resolveEpgUrl } from './epgStatus'
import { parseXmltv } from './xmltvParser'

const HOUR_MS = 3_600_000

/** Janela guardada (D-004): 12 h antes, 48 h depois, alargada pelo deslocamento. */
const BEFORE_HOURS = 12
const AFTER_HOURS = 48

export interface SyncEpgOptions {
  database?: CatalogDb
  /** Instante injetado — define a janela guardada (FR-004). */
  now?: () => number
  /** Injetável para teste; padrão `fetch` global. */
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}

export interface SyncEpgResult {
  /** `skipped` = sem endereço configurado, EPG desativado ou fonte inexistente. */
  outcome: 'synced' | 'failed' | 'skipped'
  errorKind?: EpgErrorKind
  programCount?: number
}

function categorize(error: unknown): EpgErrorKind {
  if (error instanceof EpgFailure) return error.kind
  if (isQuotaError(error)) return 'storage_full'
  return 'unreadable'
}

export async function syncEpg(sourceId: string, options: SyncEpgOptions = {}): Promise<SyncEpgResult> {
  const database = options.database ?? db
  const now = options.now ?? (() => Date.now())
  const doFetch: typeof fetch = options.fetchImpl ?? ((input, init) => fetch(input, init))

  const record = await database.sources.get(sourceId)
  if (!record || record.epgDisabled) return { outcome: 'skipped' }
  const target = resolveEpgUrl(record)
  if (!target) return { outcome: 'skipped' }

  const syncAt = now()
  const offsetHours = Math.abs(record.epgOffsetHours ?? 0)
  const window = {
    from: syncAt - (BEFORE_HOURS + offsetHours) * HOUR_MS,
    to: syncAt + (AFTER_HOURS + offsetHours) * HOUR_MS,
  }

  try {
    let response: Response
    try {
      response = await doFetch(target.url, options.signal ? { signal: options.signal } : undefined)
    } catch (error) {
      if (isAbortError(error)) throw error
      throw new EpgFailure('network')
    }
    if (response.status === 401 || response.status === 403) throw new EpgFailure('refused')
    if (!response.ok || !response.body) throw new EpgFailure('network')

    const chunks = requireXmltvRoot(textChunks(response.body))
    const { programCount } = await writeEpgPrograms(sourceId, parseXmltv(chunks, window), database)

    // Fonte removida ou EPG desativado enquanto rodava (FR-011): o resultado
    // é descartado — nada fica gravado para uma fonte que não quer mais isso.
    const fresh = await database.sources.get(sourceId)
    if (!fresh || fresh.epgDisabled) {
      await deleteEpgForSource(sourceId, database)
      return { outcome: 'skipped' }
    }

    await recordEpgSuccess(sourceId, syncAt, database)
    return { outcome: 'synced', programCount }
  } catch (error) {
    if (isAbortError(error)) throw error
    const errorKind = categorize(error)
    // Só a categoria é registrada; a fonte pode ter sumido no meio.
    if (await database.sources.get(sourceId)) await recordEpgFailure(sourceId, errorKind, now(), database)
    return { outcome: 'failed', errorKind }
  }
}
