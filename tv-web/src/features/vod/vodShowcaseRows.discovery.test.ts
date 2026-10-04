import { describe, expect, it } from 'vitest'
import { buildShowcaseRows } from './vodShowcaseRows'

const base = { section: 'movies' as const, hasContinue: false, hasFavorites: false, hasAdded: false, categoryNames: ['Ação'] }
const keys = (input: Parameters<typeof buildShowcaseRows>[0]) => buildShowcaseRows(input).map((row) => row.key)

describe('buildShowcaseRows — Top 10 e Dica (feature 057)', () => {
  it('sem dado nada de Top 10 nem Dica (nem slot); o único slot é "Porque você assistiu"', () => {
    const rows = buildShowcaseRows(base)
    expect(rows.map((row) => row.key)).toEqual(['because', 'cat:Ação'])
    expect(rows.filter((row) => row.kind === 'slot').map((row) => row.slotId)).toEqual(['vod-because'])
  })

  it('ordem: continue → top10 → favorites → added → rated → tip → because → categorias', () => {
    expect(
      keys({ ...base, hasContinue: true, hasFavorites: true, hasAdded: true, hasRated: true, hasTop10: true, hasTip: true }),
    ).toEqual(['continue', 'top10', 'favorites', 'added', 'rated', 'tip', 'because', 'cat:Ação'])
  })

  it('a Dica fica logo antes de "Porque você assistiu" com qualquer combinação das fileiras de destaque', () => {
    for (const hasAdded of [false, true]) {
      for (const hasRated of [false, true]) {
        const result = keys({ ...base, hasAdded, hasRated, hasTip: true })
        expect(result.indexOf('tip')).toBe(result.indexOf('because') - 1)
        if (hasRated) expect(result.indexOf('rated')).toBe(result.indexOf('tip') - 1)
      }
    }
  })

  it('formato, título por seção e sem "Ver tudo" nem slot', () => {
    const movies = buildShowcaseRows({ ...base, hasTop10: true, hasTip: true })
    const series = buildShowcaseRows({ ...base, section: 'series', hasTop10: true, hasTip: true })
    const find = (rows: typeof movies, key: string) => rows.find((row) => row.key === key)!
    expect(find(movies, 'top10')).toMatchObject({ kind: 'items', format: 'top10', seeAll: null, slotId: null, title: 'Top 10 filmes da semana' })
    expect(find(series, 'top10')).toMatchObject({ title: 'Top 10 séries da semana' })
    expect(find(movies, 'tip')).toMatchObject({ kind: 'items', format: 'poster', seeAll: null, slotId: null, title: 'Dica de filme' })
    expect(find(series, 'tip')).toMatchObject({ title: 'Dica de série' })
  })
})
