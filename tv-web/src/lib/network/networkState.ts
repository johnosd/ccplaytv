/**
 * Estado de rede e lifecycle (feature 042, `logic/rede-e-lifecycle.md` §1).
 * O redutor é puro; o store compartilhado (um só para o app inteiro) liga os
 * eventos do navegador a ele. Em memória, nunca persistido.
 *
 * Fonte ÚNICA (T048): `useOnlineStatus`, o banner, a topbar e a verificação
 * de conexão leem e escrevem aqui — antes cada hook tinha a própria cópia.
 */

import { useSyncExternalStore } from 'react'

export type NetworkPhase = 'online' | 'offline' | 'verifying' | 'suspended' | 'resumed'

export interface NetworkState {
  /** Último sinal de conectividade (`navigator.onLine` ou resultado real). */
  online: boolean
  phase: NetworkPhase
}

export type NetworkEvent =
  | { type: 'online' }
  | { type: 'offline' }
  | { type: 'verify-start' }
  | { type: 'verify-done'; ok: boolean }
  | { type: 'hidden' }
  | { type: 'visible' }

export function initialNetworkState(online: boolean): NetworkState {
  return { online, phase: online ? 'online' : 'offline' }
}

function settled(online: boolean): NetworkState {
  return { online, phase: online ? 'online' : 'offline' }
}

export function reduceNetworkState(state: NetworkState, event: NetworkEvent): NetworkState {
  switch (event.type) {
    case 'online':
      // Um evento só diz "o navegador acha que voltou": o redutor confia nele
      // (quem quer a confirmação real dispara `verify-start`).
      return state.phase === 'suspended' ? { ...state, online: true } : settled(true)
    case 'offline':
      return state.phase === 'suspended' ? { ...state, online: false } : settled(false)
    case 'verify-start':
      return { ...state, phase: 'verifying' }
    case 'verify-done':
      // O resultado real da requisição prevalece sobre `navigator.onLine`.
      return settled(event.ok)
    case 'hidden':
      return { ...state, phase: 'suspended' }
    case 'visible':
      return state.phase === 'suspended' ? { ...state, phase: 'resumed' } : state
  }
}

export function isAppHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

// ---- store compartilhado -------------------------------------------------

let current: NetworkState = initialNetworkState(typeof navigator === 'undefined' ? true : navigator.onLine)
const listeners = new Set<() => void>()

/** Aplica um evento ao estado de rede do app todo e avisa quem assina (só se algo mudou). */
export function dispatchNetwork(event: NetworkEvent): void {
  const next = reduceNetworkState(current, event)
  if (next.online === current.online && next.phase === current.phase) return
  current = next
  for (const listener of [...listeners]) listener()
}

/**
 * Estado atual. Sem nenhum consumidor montado (primeira leitura de uma tela, ou uma
 * TV que voltou de standby sem emitir o evento), `navigator.onLine` vence, como o
 * `useState(() => navigator.onLine)` de antes. Com consumidores montados, os eventos
 * e a verificação (`connectionCheck`) governam. Idempotente: duas leituras seguidas
 * devolvem o mesmo objeto.
 */
export function getNetworkState(): NetworkState {
  if (
    listeners.size === 0 &&
    (current.phase === 'online' || current.phase === 'offline') &&
    typeof navigator !== 'undefined' &&
    current.online !== navigator.onLine
  ) {
    current = settled(navigator.onLine)
  }
  return current
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => dispatchNetwork({ type: 'online' }))
  window.addEventListener('offline', () => dispatchNetwork({ type: 'offline' }))
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () =>
    dispatchNetwork({ type: document.visibilityState === 'hidden' ? 'hidden' : 'visible' }),
  )
}

export function useNetworkState(): NetworkState {
  return useSyncExternalStore(subscribe, getNetworkState, getNetworkState)
}
