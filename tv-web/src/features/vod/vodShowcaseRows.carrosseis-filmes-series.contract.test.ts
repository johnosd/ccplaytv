/**
 * Teste de CONTRATO da feature 053 (carrosséis na tela hero de Filmes e Séries) — quais fileiras existem, em que ordem e
 * com que formato. Travado em `sdd/specs/053-carrosseis-filmes-series/contract-tests.lock`. O sdd-execute só pode
 * fazê-lo passar, nunca editá-lo.
 */
import { describe, expect, it } from 'vitest'
import { buildShowcaseRows } from './vodShowcaseRows'

describe('buildShowcaseRows — contrato da feature 053', () => {
  // FR-001, FR-002, FR-006, FR-007, FR-008, FR-009, FR-010
  it('ordem fixa sob o hero; fileiras de itens só com dado; slots reservados e uma fileira por categoria da fonte, sempre', () => {
    const all = buildShowcaseRows({
      section: 'movies',
      hasContinue: true,
      hasFavorites: true,
      hasAdded: true,
      categoryNames: ['Ação', 'Filmes | Drama'],
    })
    expect(all.map((row) => row.key)).toEqual([
      'continue',
      'top10',
      'favorites',
      'added',
      'rated',
      'because',
      'cat:Ação',
      'cat:Filmes | Drama',
    ])
    expect(all.map((row) => row.kind)).toEqual(['items', 'slot', 'items', 'items', 'slot', 'slot', 'category', 'category'])
    // Formatos por papel: destaque grande, Top 10 com número, comum, categorias compactas.
    expect(all.map((row) => row.format)).toEqual([
      'poster-xl',
      'top10',
      'poster',
      'poster',
      'poster',
      'poster',
      'poster-compact',
      'poster-compact',
    ])
    // Categoria: o nome declarado vira o destino do "Ver tudo"; só a exibição perde o prefixo redundante.
    const drama = all[7]
    expect(drama.title).toBe('Drama')
    expect(drama.seeAll).toEqual({ kind: 'category', name: 'Filmes | Drama' })
    // "Ver tudo" das fileiras de itens e slots sem destino nem dado.
    expect(all[0].seeAll).toEqual({ kind: 'history' })
    expect(all[2].seeAll).toEqual({ kind: 'favorites' })
    expect(all[3].seeAll).toEqual({ kind: 'all', sort: 'added' })
    expect(all[1].seeAll).toBeNull()
    expect(all[1].slotId).not.toBeNull()
    expect(all[0].slotId).toBeNull()

    // Sem histórico, o destaque grande passa para Favoritos; sem nenhum dado sobram slots + categorias.
    const noHistory = buildShowcaseRows({ section: 'movies', hasContinue: false, hasFavorites: true, hasAdded: false, categoryNames: ['Ação'] })
    expect(noHistory.map((row) => [row.key, row.format])).toEqual([
      ['top10', 'top10'],
      ['favorites', 'poster-xl'],
      ['rated', 'poster'],
      ['because', 'poster'],
      ['cat:Ação', 'poster-compact'],
    ])
    const bare = buildShowcaseRows({ section: 'series', hasContinue: false, hasFavorites: false, hasAdded: false, categoryNames: [] })
    expect(bare.map((row) => row.key)).toEqual(['top10', 'rated', 'because'])
    // O Top 10 é de séries em Séries e de filmes em Filmes (FR-009); título e id do slot acompanham.
    expect(bare[0].title).toContain('séries')
    expect(all[1].title).toContain('filmes')
    expect(bare[0].slotId).not.toBe(all[1].slotId)
  })
})
