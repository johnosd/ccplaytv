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
import { makeRoomFor } from '../catalog/storageBudget'
import { guideStoredBytes } from '../catalog/storageLedger'
import { EpgFailure, requireXmltvRoot, textChunks } from './epgFetch'
import { resolveEpgUrl } from './epgStatus'
import { parseXmltv } from './xmltvParser'

/** Guia sem histórico no orçamento (feature 082): ~1 MB. */
const EPG_ESTIMATE_BYTES = 1024 * 1024

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
  /** Sem receber nada por este tempo, o download é abortado e vira falha `network` (bug "Sincronizando" eterno). */
  stallMs?: number
  /** Marcas de progresso (só rótulo fixo + ms desde o início): o build de medição as manda ao coletor. */
  onPhase?: (phase: EpgPhase, ms: number) => void
}

/** `sent` = pedido enviado ao Worker; `start` = o Worker o recebeu; `config` = fonte e endereço lidos (antes do download); `headers` = resposta recebida; `room` = orçamento ok; `read` = download + leitura do XML acabaram; `written` = gravado. */
export type EpgPhase = 'sent' | 'start' | 'config' | 'headers' | 'room' | 'read' | 'written'

/** O download parado há tanto tempo não volta (rede da TV, servidor que não fecha o corpo). Largo de propósito: o guia real é lento. */
export const EPG_STALL_MS = 60_000

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

  const startedAt = performance.now()
  const phase = (name: EpgPhase) => options.onPhase?.(name, Math.round(performance.now() - startedAt))
  const guard = new AbortController()
  const onOuterAbort = () => guard.abort()
  options.signal?.addEventListener('abort', onOuterAbort)
  if (options.signal?.aborted) guard.abort()
  let stalled = false
  let stallTimer: ReturnType<typeof setTimeout> | undefined
  let rejectStalled: (reason: unknown) => void = () => undefined
  // Rejeita quando o download para: a leitura do corpo não depende de o `fetch` propagar o aborto até o leitor.
  const stalledSignal = new Promise<never>((_resolve, reject) => { rejectStalled = reject })
  stalledSignal.catch(() => undefined)
  const arm = () => {
    clearTimeout(stallTimer)
    stallTimer = setTimeout(() => {
      stalled = true
      guard.abort()
      rejectStalled(new DOMException('Download parado.', 'AbortError'))
    }, options.stallMs ?? EPG_STALL_MS)
  }
  const disarm = () => clearTimeout(stallTimer)
  async function* stallGuarded(chunks: AsyncIterable<string>): AsyncGenerator<string> {
    const iterator = chunks[Symbol.asyncIterator]()
    for (;;) {
      const next = await Promise.race([iterator.next(), stalledSignal])
      if (next.done) break
      arm()
      yield next.value
    }
    disarm()
  }

  phase('config')
  const syncAt = now()
  const offsetHours = Math.abs(record.epgOffsetHours ?? 0)
  const window = {
    from: syncAt - (BEFORE_HOURS + offsetHours) * HOUR_MS,
    to: syncAt + (AFTER_HOURS + offsetHours) * HOUR_MS,
  }

  try {
    let response: Response
    try {
      arm()
      response = await doFetch(target.url, { signal: guard.signal })
    } catch (error) {
      if (isAbortError(error)) throw error
      throw new EpgFailure('network')
    }
    if (response.status === 401 || response.status === 403) throw new EpgFailure('refused')
    if (!response.ok || !response.body) throw new EpgFailure('network')

    phase('headers')
    arm()
    const chunks = stallGuarded(requireXmltvRoot(textChunks(response.body)))
    // Feature 082: o guia novo substitui o atual — o que ele apaga ao publicar sai da conta (num banco cheio de linhas
    // antigas, sem isso o próprio guia velho barraria o novo). Sem histórico, ~1 MB (o real comprimido mede ~0,6 MB).
    const current = await guideStoredBytes(database, record)
    const room = await makeRoomFor(sourceId, (record.epgStoredBytes ?? EPG_ESTIMATE_BYTES) - current.bytes, { database, mode: 'prefetch' })
    if (!room.fits) return { outcome: 'failed', errorKind: 'storage_full' }
    phase('room')
    async function* observed() {
      yield* parseXmltv(chunks, window)
      phase('read')
    }
    const { programCount } = await writeEpgPrograms(sourceId, observed(), database)
    phase('written')

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
    if (isAbortError(error) && !stalled) throw error
    const errorKind = stalled ? 'network' : categorize(error)
    // Só a categoria é registrada; a fonte pode ter sumido no meio.
    if (await database.sources.get(sourceId)) await recordEpgFailure(sourceId, errorKind, now(), database)
    return { outcome: 'failed', errorKind }
  } finally {
    disarm()
    options.signal?.removeEventListener('abort', onOuterAbort)
  }
}
