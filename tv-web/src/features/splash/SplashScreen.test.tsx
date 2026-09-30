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
  it('chama onFinished só depois de 2,6 s — o tempo de sempre (FR-041)', () => {
    const onFinished = vi.fn()
    render(<SplashScreen onFinished={onFinished} />)

    vi.advanceTimersByTime(2599)
    expect(onFinished).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onFinished).toHaveBeenCalledTimes(1)
  })

  it('desmontar antes do fim cancela o temporizador', () => {
    const onFinished = vi.fn()
    const { unmount } = render(<SplashScreen onFinished={onFinished} />)
    unmount()
    vi.advanceTimersByTime(5000)
    expect(onFinished).not.toHaveBeenCalled()
  })

  it('mostra a marca e um indicador de carregamento (role=status) sem nenhum número', () => {
    render(<SplashScreen onFinished={vi.fn()} />)
    expect(screen.getByText('CCPlayTv')).toBeInTheDocument()

    const status = screen.getByRole('status')
    expect(status).toBeInTheDocument()
    expect(status.textContent ?? '').not.toMatch(/\d/)
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  // Feature 028, FR-015/FR-017.
  it('todo controle focável/interativo tem nome acessível', () => {
    const { container } = render(<SplashScreen onFinished={vi.fn()} />)
    expect(findUnnamedControls(container).map((f) => f.description)).toEqual([])
  })
})
