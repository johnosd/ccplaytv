import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { formatClock, msUntilNextMinute, useClock } from './clock'

function ClockProbe() {
  return createElement('span', { 'data-testid': 'clock' }, useClock())
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('formatClock', () => {
  it('meia-noite, manhã com zero à esquerda e fim do dia (HH:MM, 24 h)', () => {
    expect(formatClock(new Date(2026, 8, 26, 0, 0))).toBe('00:00')
    expect(formatClock(new Date(2026, 8, 26, 9, 5))).toBe('09:05')
    expect(formatClock(new Date(2026, 8, 26, 23, 59))).toBe('23:59')
    expect(formatClock(new Date(2026, 8, 26, 13, 7))).toBe('13:07')
  })
})

describe('msUntilNextMinute', () => {
  it('conta até o próximo :00 e nunca devolve 0', () => {
    expect(msUntilNextMinute(new Date(2026, 8, 26, 9, 5, 50, 0))).toBe(10_000)
    expect(msUntilNextMinute(new Date(2026, 8, 26, 9, 5, 0, 0))).toBe(60_000)
    expect(msUntilNextMinute(new Date(2026, 8, 26, 9, 5, 59, 999))).toBe(1)
  })
})

describe('useClock', () => {
  it('mostra a hora certa já no primeiro render (nunca um 00:00 provisório)', () => {
    vi.setSystemTime(new Date(2026, 8, 26, 9, 5, 30))
    render(createElement(ClockProbe))
    expect(screen.getByTestId('clock')).toHaveTextContent('09:05')
  })

  it('só troca na virada do minuto, sem redesenhar a cada segundo', () => {
    vi.setSystemTime(new Date(2026, 8, 26, 9, 5, 50))
    render(createElement(ClockProbe))
    expect(screen.getByTestId('clock')).toHaveTextContent('09:05')

    act(() => {
      vi.advanceTimersByTime(9_999)
    })
    expect(screen.getByTestId('clock')).toHaveTextContent('09:05')

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getByTestId('clock')).toHaveTextContent('09:06')

    // E continua se atualizando nos minutos seguintes.
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(screen.getByTestId('clock')).toHaveTextContent('09:07')
  })

  it('agenda um único timer por vez e o limpa ao desmontar', () => {
    vi.setSystemTime(new Date(2026, 8, 26, 9, 5, 50))
    const { unmount } = render(createElement(ClockProbe))
    expect(vi.getTimerCount()).toBe(1)

    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(vi.getTimerCount()).toBe(1)

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
