import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { SplashScreen } from './SplashScreen'
import { findUnnamedControls } from '../../testing/accessibleNames'

beforeEach(() => vi.useFakeTimers())

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('SplashScreen (feature 023, US5)', () => {
  it('espera prontidão local e um quadro da marca, sem timer fixo', () => {
    const onFinished = vi.fn()
    const { rerender } = render(<SplashScreen onFinished={onFinished} ready={false} />)

    vi.advanceTimersByTime(5000)
    expect(onFinished).not.toHaveBeenCalled()
    rerender(<SplashScreen onFinished={onFinished} ready />)
    vi.advanceTimersToNextFrame()
    expect(onFinished).toHaveBeenCalledTimes(1)
  })

  it('desmontar antes da prontidão cancela o quadro pendente', () => {
    const onFinished = vi.fn()
    const { unmount } = render(<SplashScreen onFinished={onFinished} ready />)
    unmount()
    vi.advanceTimersByTime(5000)
    expect(onFinished).not.toHaveBeenCalled()
  })

  it('mostra a marca e um indicador de carregamento (role=status) sem nenhum número', () => {
    render(<SplashScreen onFinished={vi.fn()} ready={false} />)
    expect(screen.getByText('CCPlayTv')).toBeInTheDocument()

    const status = screen.getByRole('status')
    expect(status).toBeInTheDocument()
    expect(status.textContent ?? '').not.toMatch(/\d/)
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  // Feature 028, FR-015/FR-017.
  it('todo controle focável/interativo tem nome acessível', () => {
    const { container } = render(<SplashScreen onFinished={vi.fn()} ready={false} />)
    expect(findUnnamedControls(container).map((f) => f.description)).toEqual([])
  })
})
