import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TrailerLayer } from './TrailerLayer'
import { findUnnamedControls } from '../testing/accessibleNames'
import { TRAILER_BRIDGE_ORIGIN } from '../lib/trailer/bridgeConfig'
import { TRAILER_START_TIMEOUT_MS } from '../lib/trailer/trailerSession'
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

function fromBridge(source: Window, data: unknown) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data, origin: TRAILER_BRIDGE_ORIGIN, source }))
  })
}

const bridge = (type: string, extra: Record<string, unknown> = {}) => ({ source: 'ccplay-trailer', v: 1, type, ...extra })

function mount(onClose: () => void = () => {}, candidates: readonly TrailerCandidate[] = CANDIDATES) {
  const view = render(<TrailerLayer title="Duna" candidates={candidates} onClose={onClose} />)
  const frame = () => {
    const iframe = view.container.querySelector('iframe')
    if (!iframe?.contentWindow) throw new Error('sem iframe da página-ponte')
    return { iframe, window: iframe.contentWindow }
  }
  return { ...view, frame }
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('TrailerLayer — erro, prazo e fechamento (feature 033)', () => {
  it('erro do player mostra a frase, o código discreto e as ações certas (153: "Tentar de novo" e "Voltar")', () => {
    const { frame } = mount()
    fromBridge(frame().window, bridge('error', { code: 153 }))

    expect(screen.getByText('O player de trailer não conseguiu iniciar.')).toBeInTheDocument()
    expect(screen.getByTestId('error-state-code').textContent).toBe('YT-153')
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument()
    expect(document.querySelectorAll('.tv-focus')).toHaveLength(1)
  })

  it('"Tentar de novo" remonta o iframe (nunca reaproveita a janela antiga)', () => {
    const { frame } = mount()
    fromBridge(frame().window, bridge('error', { code: 153 }))
    expect(document.querySelector('iframe')).toBeNull()

    press('Enter') // "Tentar de novo" já focada

    expect(document.querySelector('iframe')).not.toBeNull()
    expect(screen.getByText('Carregando trailer')).toBeInTheDocument()
  })

  it('trocar de candidato remonta o iframe com o reserva (o iframe novo é outra janela)', () => {
    const { frame } = mount()
    const first = frame()

    fromBridge(first.window, bridge('error', { code: 150 }))

    const second = frame()
    expect(second.iframe).not.toBe(first.iframe)
    expect(new URL(second.iframe.src).searchParams.get('v')).toBe('trailerPt01')
    expect(screen.getByText('Carregando trailer')).toBeInTheDocument()
  })

  it('vídeo bloqueado sem reserva: "Voltar" é a única ação e OK fecha', () => {
    const onClose = vi.fn()
    const { frame } = mount(onClose, [CANDIDATES[0]])
    fromBridge(frame().window, bridge('error', { code: 150 }))

    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument()
    expect(screen.getByText(/não permite que ele seja exibido/)).toBeInTheDocument()
    press('Enter')

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('passados 15 s carregando vira TRL-TEMPO', () => {
    vi.useFakeTimers()
    mount()

    act(() => {
      vi.advanceTimersByTime(TRAILER_START_TIMEOUT_MS + 1)
    })

    expect(screen.getByTestId('error-state-code').textContent).toBe('TRL-TEMPO')
  })

  it('tocando, o prazo não vale', () => {
    vi.useFakeTimers()
    const { frame } = mount()
    fromBridge(frame().window, bridge('playing'))

    act(() => {
      vi.advanceTimersByTime(TRAILER_START_TIMEOUT_MS * 2)
    })

    expect(screen.queryByTestId('error-state-code')).not.toBeInTheDocument()
  })

  it('sem rede abre direto em TRL-REDE', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    mount()

    expect(screen.getByTestId('error-state-code').textContent).toBe('TRL-REDE')
    expect(screen.getByText('Sem conexão com a internet.')).toBeInTheDocument()
  })

  it('app oculto fecha a camada', () => {
    const onClose = vi.fn()
    mount(onClose)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('fim e RETURN chegando juntos chamam onClose uma única vez', () => {
    const onClose = vi.fn()
    const { frame } = mount(onClose)
    const target = frame().window
    fromBridge(target, bridge('playing'))

    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: bridge('ended'), origin: TRAILER_BRIDGE_ORIGIN, source: target }))
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('carregando, "Cancelar" fecha por OK e RETURN manda parar', () => {
    const onClose = vi.fn()
    const { frame } = mount(onClose)
    const post = vi.spyOn(frame().window, 'postMessage')

    expect(screen.getByText('Cancelar').className).toContain('tv-focus')
    press('Enter')

    expect(post).toHaveBeenCalledWith({ source: 'ccplay-app', v: 1, type: 'stop' }, TRAILER_BRIDGE_ORIGIN)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('desmontar por fora também manda parar, sem chamar onClose', () => {
    const onClose = vi.fn()
    const { frame, unmount } = mount(onClose)
    const post = vi.spyOn(frame().window, 'postMessage')

    unmount()

    expect(post).toHaveBeenCalledWith({ source: 'ccplay-app', v: 1, type: 'stop' }, TRAILER_BRIDGE_ORIGIN)
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('TrailerLayer — reserva automática (feature 033, US2)', () => {
  it('150 no 1º candidato remonta com o 2º e, tocando, nenhum erro aparece', () => {
    const { frame } = mount()
    fromBridge(frame().window, bridge('error', { code: 150 }))
    fromBridge(frame().window, bridge('playing'))

    expect(screen.queryByTestId('error-state-code')).not.toBeInTheDocument()
    expect(new URL(frame().iframe.src).searchParams.get('v')).toBe('trailerPt01')
    expect(screen.getByText('⏸ Pausar')).toBeInTheDocument()
  })

  it('150 também no 2º vira erro só com "Voltar"', () => {
    const { frame } = mount()
    fromBridge(frame().window, bridge('error', { code: 150 }))
    fromBridge(frame().window, bridge('error', { code: 101 }))

    expect(screen.getByTestId('error-state-code').textContent).toBe('YT-101')
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument()
  })

  it('só os dois primeiros candidatos são usados, mesmo com mais na lista', () => {
    const three: TrailerCandidate[] = [
      ...CANDIDATES,
      { videoId: 'terceiroVid', kind: 'trailer', origin: 'tmdb' },
    ]
    const { frame } = mount(() => {}, three)
    fromBridge(frame().window, bridge('error', { code: 150 }))
    fromBridge(frame().window, bridge('error', { code: 150 }))

    expect(screen.getByTestId('error-state-code').textContent).toBe('YT-150')
    expect(document.querySelector('iframe')).toBeNull()
  })
})

describe('TrailerLayer — controle e acessibilidade (feature 033, US3)', () => {
  function playing() {
    const mounted = mount()
    const target = mounted.frame().window
    fromBridge(target, bridge('playing'))
    return { ...mounted, target, post: vi.spyOn(target, 'postMessage') }
  }

  const seekBy = (seconds: number) => ({ source: 'ccplay-app', v: 1, type: 'seek-by', seconds })

  it('duas setas seguidas sem "seeked" mandam UM seek-by; depois do "seeked" manda o próximo', () => {
    const { target, post } = playing()

    press('ArrowRight')
    press('ArrowRight')
    expect(post.mock.calls.filter(([m]) => (m as { type: string }).type === 'seek-by')).toHaveLength(1)
    expect(post).toHaveBeenCalledWith(seekBy(10), TRAILER_BRIDGE_ORIGIN)

    fromBridge(target, bridge('seeked'))
    press('ArrowLeft')
    expect(post).toHaveBeenCalledWith(seekBy(-10), TRAILER_BRIDGE_ORIGIN)
  })

  it('sem "seeked" da ponte, o seek pendente é liberado em 1 s', () => {
    vi.useFakeTimers()
    const { post } = playing()

    press('ArrowRight')
    act(() => {
      vi.advanceTimersByTime(1001)
    })
    press('ArrowRight')

    expect(post.mock.calls.filter(([m]) => (m as { type: string }).type === 'seek-by')).toHaveLength(2)
  })

  it('MediaPlayPause manda toggle; Stop e CH± não mandam nada', () => {
    const { post } = playing()

    press('MediaPlayPause')
    expect(post).toHaveBeenCalledWith({ source: 'ccplay-app', v: 1, type: 'toggle' }, TRAILER_BRIDGE_ORIGIN)
    post.mockClear()

    press('MediaStop')
    press('ChannelUp')
    press('ChannelDown')
    expect(post).not.toHaveBeenCalled()
  })

  it('pausada, a pill vira "Continuar" e a faixa fica sempre visível', () => {
    vi.useFakeTimers()
    const { target } = playing()
    fromBridge(target, bridge('paused'))

    act(() => {
      vi.advanceTimersByTime(10_000)
    })

    expect(screen.getByText('▶ Continuar').className).toContain('tv-focus')
    expect(document.querySelector('.trailer-bar-hidden')).toBeNull()
  })

  it('tocando, a faixa some depois de 4 s sem tecla e volta com uma tecla tratada', () => {
    vi.useFakeTimers()
    playing()

    act(() => {
      vi.advanceTimersByTime(4001)
    })
    expect(document.querySelector('.trailer-bar-hidden')).not.toBeNull()
    expect(document.querySelectorAll('.tv-focus')).toHaveLength(1) // continua um foco, só sem opacidade

    press('ArrowUp')
    expect(document.querySelector('.trailer-bar-hidden')).toBeNull()
  })

  it('erro: ←/→ movem o foco entre as ações, sempre um só', () => {
    const { frame } = mount()
    fromBridge(frame().window, bridge('error', { code: 153 }))
    expect(screen.getByRole('button', { name: 'Tentar de novo' }).className).toContain('tv-focus')

    press('ArrowRight')
    expect(screen.getByRole('button', { name: 'Voltar' }).className).toContain('tv-focus')
    expect(document.querySelectorAll('.tv-focus')).toHaveLength(1)

    press('ArrowRight') // já é a última
    expect(screen.getByRole('button', { name: 'Voltar' }).className).toContain('tv-focus')
  })

  it('todo controle tem nome acessível em carregando, tocando, pausado e erro', () => {
    const { frame } = mount()
    const target = frame().window
    expect(findUnnamedControls(document.body).map((f) => f.description)).toEqual([])

    fromBridge(target, bridge('playing'))
    expect(findUnnamedControls(document.body).map((f) => f.description)).toEqual([])

    fromBridge(target, bridge('paused'))
    expect(findUnnamedControls(document.body).map((f) => f.description)).toEqual([])

    fromBridge(target, bridge('error', { code: 153 }))
    expect(findUnnamedControls(document.body).map((f) => f.description)).toEqual([])
  })
})