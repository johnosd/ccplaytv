import { describe, expect, it, vi } from 'vitest'
import {
  canTransition,
  createPlayerSession,
  FULLSCREEN_REGION,
  type PlayerAdapter,
  type PlayerAdapterCallbacks,
  type PlayerState,
} from './PlayerService'
import type { PlayerCapabilities } from './capabilities'

const FULL: PlayerCapabilities = {
  canPause: true,
  canSeek: true,
  reportsPosition: true,
  reportsDuration: true,
}

const NONE: PlayerCapabilities = {
  canPause: false,
  canSeek: false,
  reportsPosition: false,
  reportsDuration: false,
}

/** Adaptador falso: permite dirigir a máquina de estados sem motor real. */
function fakeAdapter(capabilities: PlayerCapabilities = FULL) {
  let captured: PlayerAdapterCallbacks | null = null
  const opened: { url: string }[] = []
  let closeCount = 0
  const seekCalls: number[] = []
  const jumpCalls: number[] = []
  let pendingSettle: (() => void) | null = null
  let pauseCount = 0
  let resumeCount = 0

  const factory = (callbacks: PlayerAdapterCallbacks): PlayerAdapter => {
    captured = callbacks
    return {
      name: 'fake',
      rendersOnHardwarePlane: false,
      capabilities,
      open: (url) => {
        opened.push({ url })
      },
      close: () => {
        closeCount += 1
      },
      pause: () => {
        pauseCount += 1
      },
      resume: () => {
        resumeCount += 1
      },
      seekTo: (positionMs, onSettled) => {
        seekCalls.push(positionMs)
        pendingSettle = onSettled
      },
      jumpBy: (deltaMs, onSettled) => {
        jumpCalls.push(deltaMs)
        pendingSettle = onSettled
      },
    }
  }

  return {
    factory,
    opened,
    seekCalls,
    jumpCalls,
    get closeCount() {
      return closeCount
    },
    get pauseCount() {
      return pauseCount
    },
    get resumeCount() {
      return resumeCount
    },
    emitState: (state: PlayerState) => captured?.onStateChange(state),
    emitError: (message = 'falhou') => captured?.onError({ code: null, message }),
    emitProgress: (positionMs: number, durationMs?: number) =>
      captured?.onProgress?.({ positionMs, durationMs }),
    emitCompleted: () => captured?.onCompleted?.(),
    /** Simula o callback assíncrono do motor (sucesso OU falha) voltando. */
    settleSeek: () => {
      const settle = pendingSettle
      pendingSettle = null
      settle?.()
    },
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
    const session = createPlayerSession('http://exemplo.invalid/x.ts', FULLSCREEN_REGION, 'movie', {
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
    const session = createPlayerSession('http://exemplo.invalid/x.ts', FULLSCREEN_REGION, 'movie', {
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
      const session = createPlayerSession('http://exemplo.invalid/x.ts', FULLSCREEN_REGION, 'movie', {
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
    const session = createPlayerSession('http://exemplo.invalid/x.ts', FULLSCREEN_REGION, 'movie', {
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
    const session = createPlayerSession('http://exemplo.invalid/x.ts', FULLSCREEN_REGION, 'movie', {
      createAdapter: adapter.factory,
    })

    session.close()
    session.close()

    expect(adapter.closeCount).toBe(1)
  })

  it('falha ao abrir vira erro sanitizado, sem vazar a exceção original', () => {
    const session = createPlayerSession('http://exemplo.invalid/x.ts', FULLSCREEN_REGION, 'movie', {
      createAdapter: () => ({
        name: 'explode',
        rendersOnHardwarePlane: false,
        capabilities: FULL,
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

    // T005 — transições novas (paused/completed) e as proibidas.
    it('permite as transições novas de pausa e conclusão', () => {
      expect(canTransition('playing', 'paused')).toBe(true)
      expect(canTransition('buffering', 'paused')).toBe(true)
      expect(canTransition('paused', 'playing')).toBe(true)
      expect(canTransition('paused', 'buffering')).toBe(true)
      expect(canTransition('playing', 'completed')).toBe(true)
    })

    it('não permite ressuscitar uma sessão concluída nem pausada', () => {
      // completed é terminal exceto por closed — mesma proteção que error já tem.
      expect(canTransition('completed', 'playing')).toBe(false)
      expect(canTransition('completed', 'buffering')).toBe(false)
      expect(canTransition('completed', 'closed')).toBe(true)
    })

    it('erro a partir de pausado continua permitido, mas não o inverso', () => {
      expect(canTransition('paused', 'error')).toBe(true)
      expect(canTransition('error', 'paused')).toBe(false)
    })
  })

  // T006 — tradução de fim de mídia por capacidade (D-008).
  describe('tradução de onCompleted', () => {
    it('filme: onCompleted vira o estado completed', () => {
      const adapter = fakeAdapter()
      const session = createPlayerSession('http://exemplo.invalid/x.ts', FULLSCREEN_REGION, 'movie', {
        createAdapter: adapter.factory,
      })
      adapter.emitState('buffering')
      adapter.emitState('playing')

      adapter.emitCompleted()

      expect(session.state).toBe('completed')
      expect(session.error).toBeNull()
    })

    it('canal ao vivo: onCompleted vira erro, preservando a mensagem atual', () => {
      const adapter = fakeAdapter(NONE)
      const session = createPlayerSession('http://exemplo.invalid/x.ts', FULLSCREEN_REGION, 'channel', {
        createAdapter: adapter.factory,
      })
      adapter.emitState('buffering')
      adapter.emitState('playing')

      adapter.emitCompleted()

      expect(session.state).toBe('error')
      expect(session.error?.message).toBe('A transmissão foi interrompida.')
    })
  })

  // T007 — porta single-flight de saltos, com grampeamento aos limites reais.
  describe('jumpBy / seekTo — porta single-flight', () => {
    it('três jumpBy em voo produzem UMA chamada ao adaptador — as outras duas são descartadas (R-019)', () => {
      // Achado na TV física: acumular deltas enquanto em voo produzia um
      // salto do tamanho da soma quando o motor finalmente respondia — uma
      // fila de saltos enormes que parecia o app congelado. Corrigido para
      // descartar: no máximo um salto de 10s em voo por vez.
      const adapter = fakeAdapter()
      const session = createPlayerSession('http://exemplo.invalid/x.ts', FULLSCREEN_REGION, 'movie', {
        createAdapter: adapter.factory,
      })
      adapter.emitProgress(60_000, 600_000) // 1min de 10min — sem risco de clamp

      session.jumpBy(10_000) // dispara na hora: 1ª chamada ao adaptador
      session.jumpBy(10_000) // em voo: descartado
      session.jumpBy(10_000) // em voo: descartado

      expect(adapter.jumpCalls).toEqual([10_000])

      adapter.settleSeek() // libera a porta — nada pendente pra disparar

      expect(adapter.jumpCalls).toEqual([10_000]) // continua uma só chamada

      // Com a porta livre, um novo toque agora dispara normalmente.
      session.jumpBy(10_000)
      expect(adapter.jumpCalls).toEqual([10_000, 10_000])
    })

    it('callback de FALHA também libera a porta (não trava saltos seguintes)', () => {
      const adapter = fakeAdapter()
      const session = createPlayerSession('http://exemplo.invalid/x.ts', FULLSCREEN_REGION, 'movie', {
        createAdapter: adapter.factory,
      })
      adapter.emitProgress(60_000, 600_000)

      session.jumpBy(10_000)
      adapter.settleSeek() // adaptador não distingue sucesso/erro no teste — mesmo callback

      session.jumpBy(10_000)

      expect(adapter.jumpCalls).toEqual([10_000, 10_000])
    })

    it('seekTo negativo grampeia em 0', () => {
      const adapter = fakeAdapter()
      const session = createPlayerSession('http://exemplo.invalid/x.ts', FULLSCREEN_REGION, 'movie', {
        createAdapter: adapter.factory,
      })

      session.seekTo(-5_000)

      expect(adapter.seekCalls).toEqual([0])
    })

    it('com duração desconhecida, seekTo negativo ainda grampeia só o limite inferior', () => {
      const adapter = fakeAdapter()
      const session = createPlayerSession('http://exemplo.invalid/x.ts', FULLSCREEN_REGION, 'movie', {
        createAdapter: adapter.factory,
      })
      adapter.emitProgress(1_000, undefined) // duração nunca chegou

      session.seekTo(-5_000)

      expect(adapter.seekCalls).toEqual([0])
    })

    it('jumpBy que ultrapassaria a duração para no último instante válido, sem concluir por atalho', () => {
      const adapter = fakeAdapter()
      const session = createPlayerSession('http://exemplo.invalid/x.ts', FULLSCREEN_REGION, 'movie', {
        createAdapter: adapter.factory,
      })
      adapter.emitProgress(595_000, 600_000) // 5s restantes de 10min

      session.jumpBy(60_000) // pediria +60s, muito além do fim

      expect(adapter.jumpCalls).toEqual([4_999]) // 600_000 - 1 - 595_000
      // Grampear a busca não é o mesmo que concluir: só o motor real conclui.
      expect(session.state).not.toBe('completed')
    })

    it('sem capacidade de busca, jumpBy/seekTo não chamam o adaptador', () => {
      const adapter = fakeAdapter(NONE)
      const session = createPlayerSession('http://exemplo.invalid/x.ts', FULLSCREEN_REGION, 'channel', {
        createAdapter: adapter.factory,
      })

      session.jumpBy(10_000)
      session.seekTo(5_000)

      expect(adapter.jumpCalls).toEqual([])
      expect(adapter.seekCalls).toEqual([])
    })
  })

  // Capacidades resolvidas e expostas pela sessão (D-001/D-002).
  describe('capabilities', () => {
    it('resolve a interseção motor × mídia e expõe na sessão', () => {
      const adapter = fakeAdapter(FULL)
      const session = createPlayerSession('http://exemplo.invalid/x.ts', FULLSCREEN_REGION, 'channel', {
        createAdapter: adapter.factory,
      })
      // Motor sabe tudo, mas canal ao vivo não permite nada disso.
      expect(session.capabilities).toEqual(NONE)
    })

    it('togglePause sem efeito quando a mídia não permite pausa', () => {
      const adapter = fakeAdapter(FULL)
      const session = createPlayerSession('http://exemplo.invalid/x.ts', FULLSCREEN_REGION, 'channel', {
        createAdapter: adapter.factory,
      })
      session.togglePause()
      expect(adapter.pauseCount).toBe(0)
      expect(adapter.resumeCount).toBe(0)
    })

    it('togglePause pausa quando reproduzindo e retoma quando pausado', () => {
      const adapter = fakeAdapter(FULL)
      const session = createPlayerSession('http://exemplo.invalid/x.ts', FULLSCREEN_REGION, 'movie', {
        createAdapter: adapter.factory,
      })
      adapter.emitState('buffering')
      adapter.emitState('playing')

      session.togglePause()
      expect(adapter.pauseCount).toBe(1)

      adapter.emitState('paused')
      session.togglePause()
      expect(adapter.resumeCount).toBe(1)
    })
  })

  // Progresso propagado pela sessão (R0-3).
  describe('progress', () => {
    it('começa nulo e reflete o último onProgress recebido', () => {
      const adapter = fakeAdapter()
      const session = createPlayerSession('http://exemplo.invalid/x.ts', FULLSCREEN_REGION, 'movie', {
        createAdapter: adapter.factory,
      })
      expect(session.progress).toBeNull()

      adapter.emitProgress(12_000, 120_000)

      expect(session.progress).toEqual({ positionMs: 12_000, durationMs: 120_000 })
    })
  })
})
