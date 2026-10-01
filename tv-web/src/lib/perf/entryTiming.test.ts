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

  it('a entrada da tela (start) recomeça a medição — um registro velho da mesma categoria não soma tempo', () => {
    localStorage.setItem('ccplaytv:perf', '1')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const now = vi.spyOn(performance, 'now')
    now.mockReturnValue(1_000)
    markEntry(9, 'movie', 'request') // busca em segundo plano que nunca pintou
    now.mockReturnValue(241_000)
    markEntry(9, 'movie', 'start') // a pessoa entra 4 min depois
    now.mockReturnValue(241_026)
    markEntry(9, 'movie', 'firstPaint')

    const [report] = takeEntryReports()
    expect(report.phases).toEqual({ start: 0, firstPaint: 26 })
  })
})
