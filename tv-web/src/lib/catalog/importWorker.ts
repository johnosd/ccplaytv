/// <reference lib="webworker" />

/**
 * Entrada do Web Worker de importação (D-003, research.md R4).
 *
 * É deliberadamente **fino**: não interpreta, não classifica, não decide
 * nada. Só recebe mensagem, chama o pipeline e devolve o que ele já
 * produz. Toda a lógica continua em funções puras fora daqui — é o que
 * permite testá-la em jsdom, onde não existe Worker de verdade, e é o que
 * torna viável o plano B de rodar na thread principal se o empacotamento
 * do Worker falhar no pacote Tizen (R-002).
 *
 * Por que Worker: um import pode levar até 2 minutos, e um laço sobre
 * centenas de milhares de entradas na thread de interface bloquearia o
 * desenho e o tratamento de tecla — o beco sem saída que a constitution
 * proíbe (SC-005).
 */

import { startImport, type ImportHandle } from './importPipeline'
import type { ImportRunRecord } from './db'

export interface StartMessage {
  type: 'start'
  sourceId: string
  batchSize?: number
}

export interface CancelMessage {
  type: 'cancel'
}

export type WorkerRequest = StartMessage | CancelMessage

export type WorkerResponse =
  | { type: 'started'; runId: string }
  | { type: 'progress'; run: ImportRunRecord }
  | { type: 'done'; run: ImportRunRecord }
  | { type: 'error'; name: string }

const scope = self as unknown as DedicatedWorkerGlobalScope
let handle: ImportHandle | undefined

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data

  if (message.type === 'cancel') {
    handle?.cancel()
    return
  }

  if (message.type !== 'start') return

  try {
    handle = await startImport(message.sourceId, {
      batchSize: message.batchSize,
      onProgress: (run) => scope.postMessage({ type: 'progress', run } satisfies WorkerResponse),
    })
    scope.postMessage({ type: 'started', runId: handle.runId } satisfies WorkerResponse)
    const run = await handle.completion
    scope.postMessage({ type: 'done', run } satisfies WorkerResponse)
  } catch (error) {
    // **Só o nome do erro atravessa.** A mensagem crua costuma embutir a
    // URL completa, com credencial — e o que atravessa daqui acaba em tela
    // ou em diagnóstico (FR-009). Situações que a pessoa pode resolver já
    // vêm categorizadas dentro do próprio registro da execução.
    scope.postMessage({
      type: 'error',
      name: error instanceof Error ? error.name : 'Error',
    } satisfies WorkerResponse)
  }
}
