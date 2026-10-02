/**
 * "Tentar de novo" do aviso de conexão (feature 042, D-007, `logic/rede-e-
 * lifecycle.md` §2). A ação mora na topbar (único lugar que o controle remoto
 * alcança); o texto, no banner. Os dois compartilham este estado pequeno.
 *
 * A verificação relê o sinal do aparelho (`verifyNetwork()` sem origem — a
 * origem do provedor está atrás de uma porta restrita, R-009) e republica o
 * resultado como evento `online`/`offline`, para todo ouvinte (`useOnlineStatus`)
 * se recalcular — o caso de uma TV que volta de standby sem o evento.
 */

import { useSyncExternalStore } from 'react'
import { dispatchNetwork } from './networkState'
import { verifyNetwork } from './verifyNetwork'

export type ConnectionCheckStatus = 'idle' | 'verifying' | 'failed'

let status: ConnectionCheckStatus = 'idle'
let inFlight: Promise<boolean> | null = null
const listeners = new Set<() => void>()

function setStatus(next: ConnectionCheckStatus): void {
  if (status === next) return
  status = next
  for (const listener of [...listeners]) listener()
}

if (typeof window !== 'undefined') {
  // Voltou a conexão por qualquer caminho: a próxima queda começa limpa.
  window.addEventListener('online', () => setStatus('idle'))
}

export function getConnectionCheckStatus(): ConnectionCheckStatus {
  return status
}

export function subscribeConnectionCheck(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Single-flight (SC-006): um clique repetido enquanto verifica devolve a mesma verificação. */
export function runConnectionCheck(): Promise<boolean> {
  if (inFlight) return inFlight
  setStatus('verifying')
  dispatchNetwork({ type: 'verify-start' })
  inFlight = verifyNetwork()
    .then((ok) => {
      setStatus(ok ? 'idle' : 'failed')
      // O resultado vira o estado de rede de TODO o app (store compartilhado) e,
      // como evento, chega também a quem só ouve a janela (a pré-carga).
      dispatchNetwork({ type: 'verify-done', ok })
      window.dispatchEvent(new Event(ok ? 'online' : 'offline'))
      return ok
    })
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

export function useConnectionCheckStatus(): ConnectionCheckStatus {
  return useSyncExternalStore(subscribeConnectionCheck, getConnectionCheckStatus, getConnectionCheckStatus)
}
