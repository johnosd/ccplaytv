/**
 * Contrato da feature 058 (US1) — headers da lista no AVPlay
 * (`logic/headers.md` §1): o `User-Agent` vai por `setStreamingProperty`
 * DEPOIS de `open` e ANTES de `prepareAsync` (estado IDLE do AVPlay); o que o
 * motor recusar (lançar) conta como recusado; uma abertura sem headers não
 * mexe em propriedade nenhuma (nada vaza de um item para o outro).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAvplayAdapter } from './avplayAdapter'
import { FULLSCREEN_REGION, type PlayerAdapterCallbacks } from './PlayerService'

function installFakeAvplay() {
  const log: string[] = []
  const props: [string, string][] = []
  const fake = {
    open: () => log.push('open'),
    close: () => log.push('close'),
    stop: () => log.push('stop'),
    prepareAsync: (onSuccess: () => void) => {
      log.push('prepare')
      onSuccess()
    },
    play: () => log.push('play'),
    pause: () => {},
    seekTo: () => {},
    jumpForward: () => {},
    jumpBackward: () => {},
    getCurrentTime: () => 0,
    getDuration: () => 0,
    setListener: () => {},
    setDisplayRect: () => {},
    // Este firmware falso só conhece USER_AGENT: qualquer outra propriedade é recusada.
    setStreamingProperty: (name: string, value: string) => {
      if (name !== 'USER_AGENT') throw new Error('NotSupportedError')
      log.push('user-agent')
      props.push([name, value])
    },
  }
  ;(window as unknown as { webapis?: unknown }).webapis = { avplay: fake }
  return { log, props }
}

function callbacks(): PlayerAdapterCallbacks {
  return { onStateChange: vi.fn(), onError: vi.fn(), onProgress: vi.fn(), onCompleted: vi.fn() }
}

describe('avplayAdapter — headers da lista (feature 058)', () => {
  afterEach(() => {
    delete (window as unknown as { webapis?: unknown }).webapis
  })

  // US1-AC1/AC4/AC6; FR-001, FR-003, FR-004.
  it('aplica o User-Agent entre open e prepareAsync, informa o recusado, e a abertura seguinte sem headers não aplica nada', () => {
    const tv = installFakeAvplay()
    const adapter = createAvplayAdapter(callbacks())

    adapter.open('http://srv.invalid/live/1.ts', FULLSCREEN_REGION, undefined, {
      userAgent: 'VLC/3.0.20',
      referer: 'http://referer.invalid/',
    })
    expect(tv.props).toEqual([['USER_AGENT', 'VLC/3.0.20']])
    expect(tv.log.indexOf('user-agent')).toBeGreaterThan(tv.log.indexOf('open'))
    expect(tv.log.indexOf('user-agent')).toBeLessThan(tv.log.indexOf('prepare'))
    expect(adapter.requestHeadersReport?.()).toEqual({ applied: ['User-Agent'], refused: ['Referer'] })

    adapter.close()
    tv.props.length = 0
    adapter.open('http://srv.invalid/live/2.ts', FULLSCREEN_REGION)
    expect(tv.props).toEqual([])
    expect(adapter.requestHeadersReport?.()).toEqual({ applied: [], refused: [] })
  })
})
