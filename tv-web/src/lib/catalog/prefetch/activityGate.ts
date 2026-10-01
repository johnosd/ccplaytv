/**
 * Portão de atividade da pré-carga (feature 038, FR-003/FR-004,
 * `logic/agendador-pre-carga.md` §3).
 *
 * Junta, num lugar só, tudo que impede a pré-carga de **começar** uma
 * categoria: tecla recente, player (ou trailer) aberto, app oculto, sem rede.
 * Não sabe nada de categoria nem de catálogo — quem lê é o agendador.
 */

export type ActivityBlockReason = 'key' | 'playback' | 'hidden' | 'offline'

export interface ActivityGate {
  /** Uma tecla chegou neste instante. */
  noteKey(now: number): void
  /**
   * Uma camada de reprodução abriu (PlayerLayer, TrailerLayer). Devolve a
   * função que a fecha — contador, não booleano, para duas camadas não se
   * anularem.
   */
  acquirePlayback(): () => void
  setHidden(hidden: boolean): void
  setOnline(online: boolean): void
  /** Motivo de bloqueio agora, ou `undefined` se a pré-carga pode começar. */
  blockReason(now: number, idleAfterKeyMs: number): ActivityBlockReason | undefined
  /** Instante (epoch ms) em que o bloqueio por tecla acaba — `undefined` se nenhuma tecla foi vista. */
  keyIdleAt(idleAfterKeyMs: number): number | undefined
  /** Avisa quando player/visibilidade/rede mudam (tecla não avisa — o agendador consulta). */
  subscribe(listener: () => void): () => void
}

export function createActivityGate(): ActivityGate {
  let lastKeyAt: number | undefined
  let playbackHolds = 0
  let hidden = false
  let online = true
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const listener of [...listeners]) listener()
  }

  return {
    noteKey(now) {
      lastKeyAt = now
    },
    acquirePlayback() {
      playbackHolds += 1
      notify()
      let released = false
      return () => {
        if (released) return
        released = true
        playbackHolds -= 1
        notify()
      }
    },
    setHidden(value) {
      if (hidden === value) return
      hidden = value
      notify()
    },
    setOnline(value) {
      if (online === value) return
      online = value
      notify()
    },
    blockReason(now, idleAfterKeyMs) {
      if (playbackHolds > 0) return 'playback'
      if (hidden) return 'hidden'
      if (!online) return 'offline'
      if (lastKeyAt !== undefined && now - lastKeyAt < idleAfterKeyMs) return 'key'
      return undefined
    },
    keyIdleAt(idleAfterKeyMs) {
      return lastKeyAt === undefined ? undefined : lastKeyAt + idleAfterKeyMs
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
