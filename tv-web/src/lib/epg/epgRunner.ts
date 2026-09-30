/**
 * Executor de sincronização de EPG na thread principal (feature 030,
 * `logic/sincronizacao-epg.md` §4).
 *
 * É quem sabe o que está em andamento: **uma sincronização por fonte**
 * (FR-010 — um pedido enquanto outra roda reaproveita a que já roda), o
 * estado "Sincronizando EPG" (nunca persistido: um registro "sincronizando"
 * deixado por um app fechado no meio mentiria para sempre) e o aviso de fim
 * para quem precisa invalidar consultas.
 *
 * O trabalho pesado roda num Worker próprio; se ele não puder ser criado, cai
 * para a thread principal — mais lento, mas funcional (mesmo plano B de
 * `importRunner.ts`, R-002 da feature 005).
 */

import type { EpgWorkerResponse } from './epgWorker'
import { syncEpg, type SyncEpgResult } from './epgSync'

type FinishedListener = (sourceId: string, result: SyncEpgResult) => void

const inFlight = new Map<string, Promise<SyncEpgResult>>()
const syncingListeners = new Set<() => void>()
const finishedListeners = new Set<FinishedListener>()

const FAILED_UNREADABLE: SyncEpgResult = { outcome: 'failed', errorKind: 'unreadable' }

function createWorker(): Worker | undefined {
  if (typeof Worker === 'undefined') return undefined
  try {
    // A URL relativa com `import.meta.url` é o que faz o empacotador emitir o
    // Worker como arquivo próprio (`assets/epgWorker.js`, que o pacote Tizen
    // precisa listar — R-005).
    return new Worker(new URL('./epgWorker.ts', import.meta.url), { type: 'module' })
  } catch {
    return undefined
  }
}

function runInWorker(sourceId: string): Promise<SyncEpgResult> {
  const worker = createWorker()
  if (!worker) return syncEpg(sourceId).catch(() => FAILED_UNREADABLE)

  return new Promise<SyncEpgResult>((resolve) => {
    let settled = false
    const settle = (result: SyncEpgResult) => {
      if (settled) return
      settled = true
      worker.terminate()
      resolve(result)
    }

    worker.onmessage = (event: MessageEvent<EpgWorkerResponse>) => {
      const message = event.data
      if (message.type === 'done') settle(message.result)
      else settle(FAILED_UNREADABLE)
    }
    worker.onerror = () => {
      // O Worker nem chegou a rodar — provavelmente não entrou no pacote.
      // Cair para a thread principal torna isso recuperável em campo.
      if (settled) return
      settled = true
      worker.terminate()
      void syncEpg(sourceId)
        .catch(() => FAILED_UNREADABLE)
        .then(resolve)
    }
    worker.postMessage({ type: 'sync', sourceId })
  })
}

function notifySyncing(): void {
  for (const listener of [...syncingListeners]) listener()
}

/**
 * Pede uma sincronização. Nunca rejeita: falha é um resultado
 * (`outcome: 'failed'`), já registrado no estado da fonte.
 */
export function requestEpgSync(sourceId: string): Promise<SyncEpgResult> {
  const existing = inFlight.get(sourceId)
  if (existing) return existing

  const promise = runInWorker(sourceId).then((result) => {
    inFlight.delete(sourceId)
    notifySyncing()
    for (const listener of [...finishedListeners]) listener(sourceId, result)
    return result
  })
  inFlight.set(sourceId, promise)
  notifySyncing()
  return promise
}

export function isEpgSyncing(sourceId: string): boolean {
  return inFlight.has(sourceId)
}

/** Para `useSyncExternalStore`: avisa quando alguma fonte começa ou termina de sincronizar. */
export function subscribeEpgSyncing(listener: () => void): () => void {
  syncingListeners.add(listener)
  return () => {
    syncingListeners.delete(listener)
  }
}

/** Avisa o fim de cada sincronização (a raiz do app invalida `['epg']` e `['sources']`, D-009). */
export function onEpgSyncFinished(listener: FinishedListener): () => void {
  finishedListeners.add(listener)
  return () => {
    finishedListeners.delete(listener)
  }
}
