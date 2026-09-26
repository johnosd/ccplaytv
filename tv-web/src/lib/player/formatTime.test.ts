import { describe, it, expect } from 'vitest'
import { formatTime } from './formatTime'

describe('formatTime', () => {
  it('formata minutos:segundos abaixo de uma hora, sem inventar horas', () => {
    // Filme de 40 min: nunca "0h40" nem "0:40:00".
    expect(formatTime(12 * 60_000 + 5_000)).toBe('12:05')
    expect(formatTime(40 * 60_000)).toBe('40:00')
  })

  it('formata horas e minutos acima de uma hora, sem segundos', () => {
    expect(formatTime((60 + 23) * 60_000)).toBe('1h23')
  })

  it('preenche segundos e minutos com zero à esquerda', () => {
    expect(formatTime(65_000)).toBe('1:05')
    expect(formatTime(5_000)).toBe('0:05')
  })

  it('nunca fica negativo', () => {
    expect(formatTime(-5_000)).toBe('0:00')
  })

  it('zero é 0:00', () => {
    expect(formatTime(0)).toBe('0:00')
  })
})
