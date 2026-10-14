import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SplashScreen } from './SplashScreen'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('SplashScreen — prontidão local (feature 065, T042)', () => {
  it('mantém RETURN focável enquanto fontes locais ainda não terminaram', () => {
    const onFinished = vi.fn()
    render(<SplashScreen onFinished={onFinished} ready={false} />)

    const back = screen.getByRole('button', { name: 'Voltar' })
    expect(back).toHaveClass('tv-focus')
    fireEvent.click(back)
    expect(onFinished).toHaveBeenCalledTimes(1)
  })

  it('libera depois do primeiro quadro quando a prontidão chega', () => {
    vi.useFakeTimers()
    const onFinished = vi.fn()
    const { rerender } = render(<SplashScreen onFinished={onFinished} ready={false} />)

    rerender(<SplashScreen onFinished={onFinished} ready />)
    act(() => vi.advanceTimersToNextFrame())
    expect(onFinished).toHaveBeenCalledTimes(1)
  })
})
