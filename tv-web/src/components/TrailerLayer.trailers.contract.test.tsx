/**
 * Contrato da feature 033 (trailers) — travado em
 * `sdd/specs/033-trailers-filmes-series/contract-tests.lock`. O sdd-execute
 * só pode fazê-lo passar, nunca editá-lo.
 *
 * Regras: `logic/pagina-ponte.md` (protocolo) e `logic/sessao-de-trailer.md`.
 */
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TrailerLayer } from './TrailerLayer'
import { TRAILER_BRIDGE_ORIGIN, TRAILER_BRIDGE_URL } from '../lib/trailer/bridgeConfig'
import type { TrailerCandidate } from '../lib/trailer/trailerCandidates'

const CANDIDATES: TrailerCandidate[] = [
  { videoId: 'provTrail01', kind: 'trailer', origin: 'provider' },
  { videoId: 'trailerPt01', kind: 'trailer', language: 'pt', official: true, origin: 'tmdb' },
]

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

function fromBridge(source: Window, data: unknown, origin = TRAILER_BRIDGE_ORIGIN) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data, origin, source }))
  })
}

function mount(onClose: () => void) {
  const { container } = render(<TrailerLayer title="Duna" candidates={CANDIDATES} onClose={onClose} />)
  const iframe = container.querySelector('iframe')
  if (!iframe?.contentWindow) throw new Error('sem iframe da página-ponte')
  return { container, iframe, frame: iframe.contentWindow }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('TrailerLayer — contrato da feature 033', () => {
  // FR-009/FR-010 (só o id vai à ponte), FR-011 (só mensagens da ponte), FR-013/FR-014 (OK pausa, fim e RETURN fecham parando), FR-023 (um foco visível)
  it('carrega a página-ponte só com o id; ignora mensagem de outra origem ou janela; OK pede pausa à ponte; o fim fecha; RETURN manda parar e fecha', () => {
    const onClose = vi.fn()
    const { container, iframe, frame } = mount(onClose)

    expect(iframe.src.startsWith(TRAILER_BRIDGE_URL)).toBe(true)
    const src = new URL(iframe.src)
    expect([...src.searchParams.keys()]).toEqual(['v'])
    expect(src.searchParams.get('v')).toBe('provTrail01')
    expect(iframe.src).not.toContain('Duna')
    expect(container.querySelectorAll('.tv-focus')).toHaveLength(1)

    const post = vi.spyOn(frame, 'postMessage')
    fromBridge(frame, { source: 'ccplay-trailer', v: 1, type: 'playing' })
    press('Enter')
    expect(post).toHaveBeenCalledWith({ source: 'ccplay-app', v: 1, type: 'toggle' }, TRAILER_BRIDGE_ORIGIN)

    fromBridge(frame, { source: 'ccplay-trailer', v: 1, type: 'ended' }, 'https://malicioso.test')
    fromBridge(window, { source: 'ccplay-trailer', v: 1, type: 'ended' })
    expect(onClose).not.toHaveBeenCalled()

    fromBridge(frame, { source: 'ccplay-trailer', v: 1, type: 'ended' })
    expect(onClose).toHaveBeenCalledTimes(1)

    cleanup()
    const onCloseByReturn = vi.fn()
    const second = mount(onCloseByReturn)
    const postSecond = vi.spyOn(second.frame, 'postMessage')
    press('Escape')
    expect(postSecond).toHaveBeenCalledWith({ source: 'ccplay-app', v: 1, type: 'stop' }, TRAILER_BRIDGE_ORIGIN)
    expect(onCloseByReturn).toHaveBeenCalledTimes(1)
  })
})
