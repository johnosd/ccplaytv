import { describe, expect, it, vi } from 'vitest'
import {
  canTransition,
  createPlayerSession,
  FULLSCREEN_REGION,
  type PlayerAdapter,
  type PlayerAdapterCallbacks,
  type PlayerState,
} from './PlayerService'

/** Adaptador falso: permite dirigir a máquina de estados sem motor real. */
function fakeAdapter() {
  let captured: PlayerAdapterCallbacks | null = null
  const opened: { url: string }[] = []
  let closeCount = 0

  const factory = (callbacks: PlayerAdapterCallbacks): PlayerAdapter => {
    captured = callbacks
    return {
      name: 'fake',
      rendersOnHardwarePlane: false,
      open: (url) => {
        opened.push({ url })
      },
      close: () => {
        closeCount += 1
      },
    }
  }

  return {
    factory,
    opened,
    get closeCount() {
      return closeCount
    },
    emitState: (state: PlayerState) => captured?.onStateChange(state),
    emitError: (message = 'falhou') => captured?.onError({ code: null, message }),
  }
}

function track(session: ReturnType<typeof createPlayerSession>): PlayerState[] {
  const seen: PlayerState[] = [session.state]
  session.subscribe(() => seen.push(session.state))
  return seen
}

describe('PlayerService', () => {
  it('abre a sessão já em preparing e percorre até playing', () => {
    const adapter = fakeAdapter()
    const session = createPlayerSession('http://exemplo.invalid/x.ts', FULLSCREEN_REGION, {
      createAdapter: adapter.factory,
    })
    const seen = track(session)

    expect(session.state).toBe('preparing')
    expect(adapter.opened).toHaveLength(1)

    adapter.emitState('buffering')
    adapter.emitState('playing')

    expect(seen).toEqual(['preparing', 'buffering', 'playing'])
    expect(session.error).toBeNull()
  })

  it('carregamento não encobre falha: erro vira estado próprio, não buffering', () => {
    const adapter = fakeAdapter()
    const session = createPlayerSession('http://exemplo.invalid/x.ts', FULLSCREEN_REGION, {
      createAdapter: adapter.factory,
    })

    adapter.emitState('buffering')
    adapter.emitError('canal fora do ar')

    expect(session.state).toBe('error')
    expect(session.error?.message).toBe('canal fora do ar')
  })

  it('close() encerra a partir de qualquer estado e chama o adaptador', () => {
    for (const drive of [
      () => {},
      (a: ReturnType<typeof fakeAdapter>) => a.emitState('buffering'),
      (a: ReturnType<typeof fakeAdapter>) => {
        a.emitState('buffering')
        a.emitState('playing')
      },
      (a: ReturnType<typeof fakeAdapter>) => a.emitError(),
    ]) {
      const adapter = fakeAdapter()
      const session = createPlayerSession('http://exemplo.invalid/x.ts', FULLSCREEN_REGION, {
        createAdapter: adapter.factory,
      })
      drive(adapter)
      session.close()

      expect(session.state).toBe('closed')
      expect(adapter.closeCount).toBe(1)
    }
  })

  it('ignora callback atrasado do motor depois de fechada', () => {
    // Cenário real: o usuário aperta Voltar durante o preparing e o motor
    // ainda dispara "playing" da mídia anterior (guia Samsung 06, P05).
    const adapter = fakeAdapter()
    const session = createPlayerSession('http://exemplo.invalid/x.ts', FULLSCREEN_REGION, {
      createAdapter: adapter.factory,
    })

    session.close()
    adapter.emitState('playing')
    adapter.emitError('tardio')

    expect(session.state).toBe('closed')
    expect(session.error).toBeNull()
  })

  it('close() é idempotente — não fecha o motor duas vezes', () => {
    const adapter = fakeAdapter()
    const session = createPlayerSession('http://exemplo.invalid/x.ts', FULLSCREEN_REGION, {
      createAdapter: adapter.factory,
    })

    session.close()
    session.close()

    expect(adapter.closeCount).toBe(1)
  })

  it('falha ao abrir vira erro sanitizado, sem vazar a exceção original', () => {
    const session = createPlayerSession('http://exemplo.invalid/x.ts', FULLSCREEN_REGION, {
      createAdapter: () => ({
        name: 'explode',
        rendersOnHardwarePlane: false,
        open: () => {
          // Exceção do tipo que motores reais lançam: embute a URL.
          throw new Error('falha em http://usuario:senha@exemplo.invalid/x.ts')
        },
        close: vi.fn(),
      }),
    })

    expect(session.state).toBe('error')
    expect(session.error?.message).toBe('Não foi possível iniciar a reprodução.')
    expect(session.error?.message).not.toContain('senha')
    expect(session.error?.message).not.toContain('exemplo.invalid')
  })

  describe('canTransition', () => {
    it('não permite ressuscitar uma sessão encerrada', () => {
      expect(canTransition('closed', 'playing')).toBe(false)
      expect(canTransition('closed', 'preparing')).toBe(false)
    })

    it('não permite voltar de erro direto para reprodução', () => {
      // Retentativa cria uma sessão nova, com URL nova — não reusa esta.
      expect(canTransition('error', 'playing')).toBe(false)
      expect(canTransition('error', 'closed')).toBe(true)
    })
  })
})
