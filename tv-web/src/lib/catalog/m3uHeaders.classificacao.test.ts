import { describe, expect, it } from 'vitest'
import { classifyEntry, normalizeDeclaredChannelNumber, normalizeRadio } from './classifier'
import { itemsSignature } from './categoryBlocks'
import type { CatalogRecord } from './db'
import { createSeriesGrouper } from './m3uSeriesGrouping'
import type { ParsedEntry } from './m3uParser'

function entry(overrides: Partial<ParsedEntry> & { attributes?: Record<string, string> } = {}): ParsedEntry {
  return { name: 'Canal', url: 'http://exemplo.test/live/1.ts', group: 'Canais', attributes: {}, ...overrides }
}

describe('classifyEntry — radio, tvg-chno e headers (feature 044, logic §4)', () => {
  it('tvg-chno só aceita inteiro positivo de até 6 dígitos', () => {
    expect(normalizeDeclaredChannelNumber('12')).toBe(12)
    expect(normalizeDeclaredChannelNumber(' 7 ')).toBe(7)
    for (const invalid of ['0', '-3', 'abc', '', '1234567', '12.5', undefined]) {
      expect(normalizeDeclaredChannelNumber(invalid)).toBeUndefined()
    }
  })

  it('radio só vale "true" (qualquer caixa); "false" e o resto são ausência', () => {
    expect(normalizeRadio('true')).toBe(true)
    expect(normalizeRadio(' TRUE ')).toBe(true)
    for (const invalid of ['false', '1', '', undefined]) expect(normalizeRadio(invalid)).toBeUndefined()
  })

  it('os três campos saem nos três ramos (episódio, por grupo, não classificado)', () => {
    const extras = { attributes: { radio: 'true', 'tvg-chno': '5' }, headers: { userAgent: 'UA' } }
    const channel = classifyEntry(entry(extras))
    const episode = classifyEntry(entry({ ...extras, name: 'Serie S01E02', group: 'Series' }))
    const unclassified = classifyEntry(entry({ ...extras, group: 'Outros' }))

    expect(channel.kind).toBe('channel')
    expect(episode.kind).toBe('episode')
    expect(unclassified.kind).toBe('unclassified')
    for (const classified of [channel, episode, unclassified]) {
      expect(classified.playbackHeaders).toEqual({ userAgent: 'UA' })
      expect(classified.radio).toBe(true)
      expect(classified.declaredChannelNumber).toBe(5)
    }
  })

  it('entrada sem nada disso sai sem as chaves (FR-011)', () => {
    const classified = classifyEntry(entry())
    expect('playbackHeaders' in classified).toBe(false)
    expect('radio' in classified).toBe(false)
    expect('declaredChannelNumber' in classified).toBe(false)
  })
})

describe('agrupador de séries M3U — headers (feature 044)', () => {
  it('o episódio mantém os headers; a série sintética, que não tem URL, não os herda', () => {
    const classified = classifyEntry(entry({ name: 'Novela S01E01', group: 'Series', headers: { referer: 'http://r.test/' } }))
    const { episode, series } = createSeriesGrouper().assign({ ...classified, groupOrder: 0 })
    expect(episode.playbackHeaders).toEqual({ referer: 'http://r.test/' })
    expect(series?.playbackHeaders).toBeUndefined()
  })
})

describe('itemsSignature — campos novos só quando existem (feature 044, D-006)', () => {
  const base = { originalName: 'Canal', name: 'Canal', kind: 'channel', directUrl: 'http://exemplo.test/live/1.ts' } as CatalogRecord

  it('um item sem os campos tem a assinatura de antes desta feature', () => {
    // Valor fixado e conferido contra o `categoryBlocks.ts` do HEAD anterior a esta feature (vetor de 9 campos da 038/039).
    expect(itemsSignature([base])).toBe('1:4c683ba1')
    expect(itemsSignature([{ ...base, playbackHeaders: undefined, radio: undefined, declaredChannelNumber: undefined }])).toBe(itemsSignature([base]))
  })

  it('muda quando um header, radio ou o tvg-chno muda', () => {
    const plain = itemsSignature([base])
    const withUa = itemsSignature([{ ...base, playbackHeaders: { userAgent: 'A' } }])
    expect(withUa).not.toBe(plain)
    expect(itemsSignature([{ ...base, playbackHeaders: { userAgent: 'B' } }])).not.toBe(withUa)
    expect(itemsSignature([{ ...base, radio: true }])).not.toBe(plain)
    expect(itemsSignature([{ ...base, declaredChannelNumber: 9 }])).not.toBe(plain)
  })
})
