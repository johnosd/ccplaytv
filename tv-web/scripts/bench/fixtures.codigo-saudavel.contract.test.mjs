// Contrato da feature 063 (US3, item 35) — fontes do benchmark são
// determinísticas e do tamanho pedido (FR-018, SC-007).
import { describe, expect, it } from 'vitest'
import { BENCH_FORMATS, generateFixture } from './fixtures.mjs'

function countEntries(fixture) {
  if (fixture.format === 'm3u') return (fixture.files['playlist.m3u'].match(/^#EXTINF/gm) ?? []).length
  if (fixture.format === 'xmltv') return (fixture.files['epg.xml'].match(/<programme\b/g) ?? []).length
  return ['get_live_streams', 'get_vod_streams', 'get_series'].reduce(
    (total, action) => total + JSON.parse(fixture.files[action]).length,
    0,
  )
}

describe('fixtures do benchmark — feature 063', () => {
  it('mesma semente gera o mesmo conteúdo, outra semente não, e cada formato tem exatamente o tamanho pedido (FR-018, SC-007)', () => {
    for (const format of BENCH_FORMATS) {
      for (const size of [1_000, 10_000]) {
        const a = generateFixture({ format, size, seed: 7 })
        const b = generateFixture({ format, size, seed: 7 })
        const c = generateFixture({ format, size, seed: 8 })

        expect(a.files, `${format}/${size}: mesma semente`).toEqual(b.files)
        expect(a.files, `${format}/${size}: outra semente`).not.toEqual(c.files)
        expect(countEntries(a), `${format}/${size}: entradas`).toBe(size)
        expect(a.expected.items, `${format}/${size}: expected.items`).toBe(size)
        expect(a.expected.categories, `${format}/${size}: expected.categories`).toBeGreaterThan(1)
        expect(JSON.stringify(a.files)).not.toMatch(/https?:\/\/(?!127\.0\.0\.1|localhost)/)
      }
    }
  })
})
