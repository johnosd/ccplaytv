/// <reference lib="webworker" />

/**
 * Entrada do Web Worker da carga por seção (feature 038, R0-3). Fino, como
 * `epgWorker.ts`: recebe o pedido, chama `loadSection` e avisa cada categoria
 * gravada. A thread da interface fica livre para o controle remoto enquanto a
 * seção (até ~12 MB) é baixada, lida e gravada aqui.
 *
 * A credencial nunca atravessa a mensagem: `loadSection` lê do IndexedDB
 * dentro do próprio Worker. Erro atravessa só pelo nome (ADR-010).
 */

import type { CategoryKind } from './db'
import { loadSection, type SectionLoadOutcome } from './sectionLoader'

export type SectionWorkerRequest =
  | { type: 'load'; sourceId: string; kind: CategoryKind; categoryIds: number[] }
  /** Portão de atividade fechou (tecla, player, app oculto): não grava a próxima categoria. */
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'cancel' }

export type SectionWorkerResponse =
  | { type: 'category'; categoryId: number }
  | { type: 'done'; outcome: SectionLoadOutcome }
  | { type: 'error'; name: string }

const scope = self as unknown as DedicatedWorkerGlobalScope
const controller = new AbortController()
let paused = false
let resumeWaiters: Array<() => void> = []

function waitUntilAllowed(): Promise<void> {
  if (!paused) return Promise.resolve()
  return new Promise((resolve) => resumeWaiters.push(resolve))
}

function release(): void {
  const waiters = resumeWaiters
  resumeWaiters = []
  for (const resolve of waiters) resolve()
}

scope.onmessage = async (event: MessageEvent<SectionWorkerRequest>) => {
  const message = event.data
  if (message.type === 'pause') {
    paused = true
    return
  }
  if (message.type === 'resume') {
    paused = false
    release()
    return
  }
  if (message.type === 'cancel') {
    controller.abort()
    paused = false
    release()
    return
  }

  try {
    const result = await loadSection(message.sourceId, message.kind, message.categoryIds, {
      signal: controller.signal,
      waitUntilAllowed,
      onCategory: (categoryId) => scope.postMessage({ type: 'category', categoryId } satisfies SectionWorkerResponse),
    })
    scope.postMessage({ type: 'done', outcome: result.outcome } satisfies SectionWorkerResponse)
  } catch (error) {
    scope.postMessage({ type: 'error', name: error instanceof Error ? error.name : 'Error' } satisfies SectionWorkerResponse)
  }
}
