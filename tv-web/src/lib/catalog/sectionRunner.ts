/**
 * Executa a carga por seção num Web Worker (feature 038, R0-3), com o mesmo
 * plano B do `importRunner`/`epgRunner`: se o Worker não subir (não entrou no
 * pacote Tizen, por exemplo), roda na thread principal — mais lento, mas
 * funcional.
 *
 * O portão de atividade (tecla, player, app oculto, rede) é consultado aqui e
 * repassado ao Worker como pausa/retomada: a seção já baixada espera, e
 * nenhuma categoria é gravada enquanto a pessoa usa o controle ou assiste.
 */

import type { CategoryKind } from './db'
import { loadSection, type SectionLoadOutcome } from './sectionLoader'
import type { SectionWorkerRequest, SectionWorkerResponse } from './sectionWorker'

export interface RunSectionOptions {
  /** `true` enquanto o portão estiver fechado. */
  isBlocked: () => boolean
  onCategory?: (categoryId: number) => void
  signal?: AbortSignal
  /** Força a thread principal (testes e plano B). */
  mainThread?: boolean
}

/** Intervalo de conferência do portão durante a carga. */
const GATE_POLL_MS = 250

function createWorker(): Worker | undefined {
  if (typeof Worker === 'undefined') return undefined
  try {
    // `import.meta.url` faz o empacotador emitir `assets/sectionWorker.js`
    // (listado em `CCPlayTv/tizen_web_project.yaml`).
    return new Worker(new URL('./sectionWorker.ts', import.meta.url), { type: 'module' })
  } catch {
    return undefined
  }
}

function runOnMainThread(
  sourceId: string,
  kind: CategoryKind,
  categoryIds: number[],
  options: RunSectionOptions,
): Promise<SectionLoadOutcome> {
  const waitUntilAllowed = async () => {
    while (options.isBlocked() && !options.signal?.aborted) {
      await new Promise((resolve) => setTimeout(resolve, GATE_POLL_MS))
    }
  }
  return loadSection(sourceId, kind, categoryIds, {
    signal: options.signal,
    onCategory: options.onCategory,
    waitUntilAllowed,
  })
    .then((result) => result.outcome)
    .catch((): SectionLoadOutcome => 'failed')
}

export function runSectionLoad(
  sourceId: string,
  kind: CategoryKind,
  categoryIds: number[],
  options: RunSectionOptions,
): Promise<SectionLoadOutcome> {
  const worker = options.mainThread ? undefined : createWorker()
  if (!worker) return runOnMainThread(sourceId, kind, categoryIds, options)

  return new Promise<SectionLoadOutcome>((resolve) => {
    let settled = false
    let sentPause = false
    let heardFromWorker = false

    const finish = (outcome: SectionLoadOutcome) => {
      if (settled) return
      settled = true
      clearInterval(gateTimer)
      options.signal?.removeEventListener('abort', onAbort)
      worker.terminate()
      resolve(outcome)
    }

    const post = (message: SectionWorkerRequest) => worker.postMessage(message)

    const gateTimer = setInterval(() => {
      const blocked = options.isBlocked()
      if (blocked !== sentPause) {
        sentPause = blocked
        post({ type: blocked ? 'pause' : 'resume' })
      }
    }, GATE_POLL_MS)

    const onAbort = () => {
      post({ type: 'cancel' })
      finish('failed')
    }
    options.signal?.addEventListener('abort', onAbort)

    worker.onmessage = (event: MessageEvent<SectionWorkerResponse>) => {
      heardFromWorker = true
      const message = event.data
      if (message.type === 'category') options.onCategory?.(message.categoryId)
      else if (message.type === 'done') finish(message.outcome)
      else finish('failed')
    }
    worker.onerror = () => {
      // O Worker nem chegou a rodar (fora do pacote?) — plano B na thread principal.
      if (settled || heardFromWorker) {
        finish('failed')
        return
      }
      settled = true
      clearInterval(gateTimer)
      options.signal?.removeEventListener('abort', onAbort)
      worker.terminate()
      void runOnMainThread(sourceId, kind, categoryIds, options).then(resolve)
    }

    if (options.isBlocked()) {
      sentPause = true
      post({ type: 'pause' })
    }
    post({ type: 'load', sourceId, kind, categoryIds })
  })
}
