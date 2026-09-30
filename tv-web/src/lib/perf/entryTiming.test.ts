import { afterEach, describe, expect, it, vi } from 'vitest'
import { markEntry, takeEntryReports } from './entryTiming'

afterEach(() => {
  localStorage.removeItem('ccplaytv:perf')
  delete (globalThis as { __ccplayEntryTimings?: unknown }).__ccplayEntryTimings
  vi.restoreAllMocks()
})

describe('entryTiming', () => {
  it('desligado por padrão: não registra nada', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    markEntry(1, 'movie', 'request')
    markEntry(1, 'movie', 'firstPaint', 3)
    expect(takeEntryReports()).toEqual([])
    expect(log).not.toHaveBeenCalled()
  })

  it('ligado: publica só números e a seção, nunca uma URL', () => {
    localStorage.setItem('ccplaytv:perf', '1')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    markEntry(7, 'series', 'request')
    markEntry(7, 'series', 'mapped', 120)
    markEntry(7, 'series', 'written')
    markEntry(7, 'series', 'read')
    markEntry(7, 'series', 'firstPaint')

    const [report] = takeEntryReports()
    expect(report.categoryId).toBe(7)
    expect(report.items).toBe(120)
    expect(Object.keys(report.phases)).toEqual(['request', 'mapped', 'written', 'read', 'firstPaint'])
    for (const ms of Object.values(report.phases)) expect(typeof ms).toBe('number')
    const printed = log.mock.calls.flat().join(' ')
    expect(printed).not.toMatch(/https?:/)
    expect(printed).toContain('itens=120')
  })
})
