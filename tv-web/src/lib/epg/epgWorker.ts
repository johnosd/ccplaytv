/// <reference lib="webworker" />

/**
 * Entrada do Web Worker de EPG (feature 030, D-005). Deliberadamente **fino**,
 * como `importWorker.ts`: recebe a mensagem, chama `syncEpg` e devolve o
 * resultado. Toda a lógica continua em funções fora daqui — o que permite
 * testá-la em jsdom (sem Worker) e cair para a thread principal se o Worker
 * não subir no pacote Tizen (plano B, R-002 da feature 005).
 *
 * Por que Worker: ler e gravar um XMLTV de dezenas de MB na thread da
 * interface travaria o controle remoto (FR-003, SC-002).
 */

import { syncEpg, type SyncEpgResult } from './epgSync'

export interface EpgSyncRequest {
  type: 'sync'
  sourceId: string
}

export type EpgWorkerResponse =
  | { type: 'done'; result: SyncEpgResult }
  /** Só o nome do erro atravessa: a mensagem crua pode embutir endereço com credencial (ADR-010). */
  | { type: 'error'; name: string }

const scope = self as unknown as DedicatedWorkerGlobalScope

scope.onmessage = async (event: MessageEvent<EpgSyncRequest>) => {
  const message = event.data
  if (message.type !== 'sync') return

  try {
    const result = await syncEpg(message.sourceId)
    scope.postMessage({ type: 'done', result } satisfies EpgWorkerResponse)
  } catch (error) {
    scope.postMessage({
      type: 'error',
      name: error instanceof Error ? error.name : 'Error',
    } satisfies EpgWorkerResponse)
  }
}
