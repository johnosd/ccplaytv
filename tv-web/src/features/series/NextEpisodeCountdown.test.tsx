import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextEpisodeCountdown } from './NextEpisodeCountdown'

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

describe('NextEpisodeCountdown (feature 012, D-009)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('conta de N a 0 (padrão 10), um segundo por vez', () => {
    render(<NextEpisodeCountdown title="Cat in the Bag" onExpire={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByText('Próximo episódio em 10s')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByText('Próximo episódio em 9s')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(3000))
    expect(screen.getByText('Próximo episódio em 6s')).toBeInTheDocument()
  })

  it('expirar chama onExpire exatamente uma vez, sem continuar chamando depois', () => {
    const onExpire = vi.fn()
    render(<NextEpisodeCountdown title="Cat in the Bag" onExpire={onExpire} onCancel={vi.fn()} seconds={2} />)

    act(() => vi.advanceTimersByTime(2000))
    expect(onExpire).toHaveBeenCalledTimes(1)

    act(() => vi.advanceTimersByTime(5000))
    expect(onExpire).toHaveBeenCalledTimes(1)
  })

  it('"Cancelar" nasce focado', () => {
    render(<NextEpisodeCountdown title="Cat in the Bag" onExpire={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Cancelar' }).className).toContain('tv-focus')
  })

  it('SELECT chama onCancel, sem chamar onExpire', () => {
    const onCancel = vi.fn()
    const onExpire = vi.fn()
    render(<NextEpisodeCountdown title="Cat in the Bag" onExpire={onExpire} onCancel={onCancel} />)

    press('Enter')

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onExpire).not.toHaveBeenCalled()
  })

  it('RETURN chama onCancel, igual a SELECT', () => {
    const onCancel = vi.fn()
    render(<NextEpisodeCountdown title="Cat in the Bag" onExpire={vi.fn()} onCancel={onCancel} />)

    press('Escape')

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('desmontar limpa o temporizador — nada dispara depois de sair', () => {
    const onExpire = vi.fn()
    const { unmount } = render(
      <NextEpisodeCountdown title="Cat in the Bag" onExpire={onExpire} onCancel={vi.fn()} seconds={2} />,
    )

    unmount()
    act(() => vi.advanceTimersByTime(10_000))

    expect(onExpire).not.toHaveBeenCalled()
  })

  it('mostra a temporada quando presente (encadeando entre temporadas)', () => {
    render(
      <NextEpisodeCountdown
        title="Seven Thirty-Seven"
        seasonLabel="Temporada 2"
        onExpire={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText('Temporada 2 — Seven Thirty-Seven')).toBeInTheDocument()
  })
})
