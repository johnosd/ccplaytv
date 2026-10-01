/**
 * Teste de CONTRATO da feature 024 — travado em
 * `sdd/specs/024-live-tv-ds-v14/contract-tests.lock`. O sdd-execute só pode
 * fazê-lo passar, nunca editá-lo.
 *
 * Inverte, por decisão registrada (spec 024, Clarifications; R-003 do
 * plan.md), o FR-009 da feature 015 ("canal nunca captura capa").
 */
import { describe, expect, it } from 'vitest'
import { classifyEntry } from './classifier'
import { mapLiveEntry, type LiveCategory } from './xtreamConnector'

describe('logo do canal — contrato da feature 024', () => {
  // FR-028, US4/AC1-AC2: os dois caminhos de importação capturam o logo, com a mesma normalização das capas.
  it('M3U (tvg-logo) e provedor (stream_icon) capturam o logo do canal; valor inválido vira ausência', () => {
    const m3u = classifyEntry({
      name: 'ESPN',
      url: 'http://exemplo.test/espn',
      group: 'Canais Esportes',
      attributes: { 'tvg-logo': '  http://exemplo.test/espn.png  ' },
    })
    expect(m3u.kind).toBe('channel')
    expect(m3u.iconUrl).toBe('http://exemplo.test/espn.png')

    const m3uInvalid = classifyEntry({
      name: 'ESPN 2',
      url: 'http://exemplo.test/espn2',
      group: 'Canais Esportes',
      attributes: { 'tvg-logo': 'não é url' },
    })
    expect(m3uInvalid.iconUrl).toBeUndefined()

    const categories = new Map<string, LiveCategory>([['10', { id: '10', name: 'Esportes', order: 0 }]])
    const buildUrl = (streamId: string) => `http://exemplo.test/live/u/p/${streamId}.ts`
    const provider = mapLiveEntry(
      { name: 'ESPN', stream_id: 5, category_id: 10, stream_icon: 'http://exemplo.test/espn.png' },
      categories,
      buildUrl,
    )
    expect(provider?.iconUrl).toBe('http://exemplo.test/espn.png')

    const providerNoIcon = mapLiveEntry({ name: 'Sem logo', stream_id: 6, category_id: 10, stream_icon: '' }, categories, buildUrl)
    expect(providerNoIcon?.iconUrl).toBeUndefined()
  })
})
