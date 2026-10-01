import { describe, expect, it } from 'vitest'
import { formatEpgClock, formatEpgTimeRange } from './formatEpgTime'

describe('formatEpgTime', () => {
  it('relógio de 24 h com dois dígitos, no horário local', () => {
    const instant = new Date(2026, 8, 29, 8, 5).getTime() // construído em horário local: independe do fuso da máquina
    expect(formatEpgClock(instant)).toBe('08:05')
  })

  it('intervalo "HH:MM – HH:MM"', () => {
    const start = new Date(2026, 8, 29, 20, 0).getTime()
    const end = new Date(2026, 8, 29, 21, 30).getTime()
    expect(formatEpgTimeRange(start, end)).toBe('20:00 – 21:30')
  })
})
