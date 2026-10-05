/**
 * Teste de CONTRATO da feature 060 — "Porque você assistiu" vira fileira real em Filmes e Séries (FR-014, FR-015, FR-016).
 * Travado em `sdd/specs/060-home-vitrine-expandida/contract-tests.lock`. O sdd-execute só pode fazê-lo passar, nunca editá-lo.
 */
import { describe, expect, it } from 'vitest'
import { buildShowcaseRows } from './vodShowcaseRows'
import { COMING_SOON } from '../../lib/comingSoon'

describe('buildShowcaseRows — contrato da feature 060', () => {
  // FR-014, FR-015, FR-016, US3/AC3, SC-008; Constitution: "IA e Classificação Nunca Inventam Dados" (sem dado, nada no lugar)
  it('com semente, "Porque você assistiu <título>" é fileira de itens depois da Dica e antes das categorias; sem semente não existe; não sobra nenhum slot nem os mocks vod-because/home-trailer', () => {
    const base = { section: 'movies' as const, hasContinue: true, hasFavorites: false, hasAdded: true, hasTip: true, categoryNames: ['Ação'] }

    const withSeed = buildShowcaseRows({ ...base, hasBecause: true, becauseTitle: 'Duna' })
    expect(withSeed.map((row) => row.key)).toEqual(['continue', 'added', 'tip', 'because', 'cat:Ação'])
    const because = withSeed.find((row) => row.key === 'because')!
    expect(because.kind).toBe('items')
    expect(because.format).toBe('poster')
    expect(because.slotId).toBeNull()
    expect(because.seeAll).toBeNull()
    expect(because.title).toBe('Porque você assistiu Duna')

    for (const without of [buildShowcaseRows({ ...base, hasBecause: false }), buildShowcaseRows(base)]) {
      expect(without.map((row) => row.key)).toEqual(['continue', 'added', 'tip', 'cat:Ação'])
    }
    const series = buildShowcaseRows({ section: 'series', hasContinue: false, hasFavorites: false, hasAdded: false, categoryNames: [] })
    expect(series).toEqual([])
    expect(withSeed.some((row) => row.kind === 'slot')).toBe(false)

    // Os dois mocks entregues por esta feature saem do registro único (itens 69 e 32 do backlog).
    expect(Object.keys(COMING_SOON)).not.toContain('vod-because')
    expect(Object.keys(COMING_SOON)).not.toContain('home-trailer')
  })
})
