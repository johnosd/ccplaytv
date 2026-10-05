/** Feature 058 (T028, `data-model.md` §1/§5): dias de arquivo do canal e relógio do painel. */
import { describe, expect, it } from 'vitest'
import { mapLiveEntry, normalizeArchiveDays, readPanelClock } from './xtreamConnector'

describe('normalizeArchiveDays', () => {
  it('tv_archive 1 (número ou texto) com duração inteira positiva → os dias', () => {
    expect(normalizeArchiveDays(1, 7)).toBe(7)
    expect(normalizeArchiveDays('1', '3')).toBe(3)
  })

  it('qualquer outra coisa → ausente (nunca inventa arquivo)', () => {
    expect(normalizeArchiveDays(0, 7)).toBeUndefined()
    expect(normalizeArchiveDays(undefined, 7)).toBeUndefined()
    expect(normalizeArchiveDays('0', '7')).toBeUndefined()
    expect(normalizeArchiveDays(1, 0)).toBeUndefined()
    expect(normalizeArchiveDays(1, -2)).toBeUndefined()
    expect(normalizeArchiveDays(1, 'sete')).toBeUndefined()
    expect(normalizeArchiveDays(1, 2.5)).toBeUndefined()
    expect(normalizeArchiveDays(1, '')).toBeUndefined()
    expect(normalizeArchiveDays(1, undefined)).toBeUndefined()
  })

  it('mapLiveEntry só põe archiveDays quando o painel declarou', () => {
    const categories = new Map()
    const build = (id: string) => `u/${id}`
    expect(mapLiveEntry({ name: 'A', stream_id: 1, tv_archive: 1, tv_archive_duration: 3 }, categories, build)?.archiveDays).toBe(3)
    const plain = mapLiveEntry({ name: 'B', stream_id: 2, tv_archive: 0, tv_archive_duration: 0 }, categories, build)
    expect(plain && 'archiveDays' in plain).toBe(false)
  })
})

describe('readPanelClock', () => {
  const ts = Date.UTC(2026, 9, 4, 12, 0, 0) / 1000

  it('fuso nomeado e deslocamento medido (arredondado a 15 min)', () => {
    expect(readPanelClock({ timezone: 'America/Sao_Paulo', time_now: '2026-10-04 09:00:07', timestamp_now: ts })).toEqual({
      timezone: 'America/Sao_Paulo',
      utcOffsetMinutes: -180,
    })
    // 5 h 37 min de diferença → arredonda para 5 h 30 (Índia), não para a hora cheia.
    expect(readPanelClock({ time_now: '2026-10-04 17:37:00', timestamp_now: String(ts) })).toEqual({ utcOffsetMinutes: 330 })
  })

  it('deslocamento fora de −14 h…+14 h é descartado; fuso vazio é ausente', () => {
    expect(readPanelClock({ timezone: '  ', time_now: '2026-10-06 12:00:00', timestamp_now: ts })).toBeUndefined()
  })

  it('sem nada utilizável → ausente', () => {
    expect(readPanelClock(undefined)).toBeUndefined()
    expect(readPanelClock({ time_now: 'ontem', timestamp_now: ts })).toBeUndefined()
    expect(readPanelClock({ time_now: '2026-10-04 09:00:00' })).toBeUndefined()
  })
})
