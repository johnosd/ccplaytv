/**
 * Teste de CONTRATO da feature 053 (carrosséis na tela hero de Filmes e Séries) — quais fileiras existem, em que ordem e
 * com que formato. Travado em `sdd/specs/053-carrosseis-filmes-series/contract-tests.lock`. O sdd-execute só pode
 * fazê-lo passar, nunca editá-lo.
 */
import { describe, expect, it } from 'vitest'
import { buildShowcaseRows } from './vodShowcaseRows'

describe('buildShowcaseRows — contrato da feature 053', () => {
  // FR-001, FR-002, FR-006, FR-007, FR-008, FR-009, FR-010
  // EMENDADO em 2026-10-05 (feature 060, autorizado pelo usuário): "Porque você assistiu" deixou de ser slot "Em breve" —
  // sem semente a fileira não existe (a regra com semente é coberta pelo contrato da 060).
  it('ordem fixa sob o hero; fileiras de itens só com dado; uma fileira por categoria da fonte, sempre', () => {
    const all = buildShowcaseRows({
      section: 'movies',
      hasContinue: true,
      hasFavorites: true,
      hasAdded: true,
      categoryNames: ['Ação', 'Filmes | Drama'],
    })
    expect(all.map((row) => row.key)).toEqual(['continue', 'favorites', 'added', 'cat:Ação', 'cat:Filmes | Drama'])
    expect(all.map((row) => row.kind)).toEqual(['items', 'items', 'items', 'category', 'category'])
    // Formatos por papel: destaque grande, comum, categorias compactas.
    expect(all.map((row) => row.format)).toEqual(['poster-xl', 'poster', 'poster', 'poster-compact', 'poster-compact'])
    // Categoria: o nome declarado vira o destino do "Ver tudo"; só a exibição perde o prefixo redundante.
    const drama = all[4]
    expect(drama.title).toBe('Drama')
    expect(drama.seeAll).toEqual({ kind: 'category', name: 'Filmes | Drama' })
    // "Ver tudo" das fileiras de itens.
    expect(all[0].seeAll).toEqual({ kind: 'history' })
    expect(all[1].seeAll).toEqual({ kind: 'favorites' })
    expect(all[2].seeAll).toEqual({ kind: 'all', sort: 'added' })
    expect(all.every((row) => row.slotId === null)).toBe(true)

    // Sem histórico, o destaque grande passa para Favoritos; sem nenhum dado sobram só as categorias.
    const noHistory = buildShowcaseRows({ section: 'movies', hasContinue: false, hasFavorites: true, hasAdded: false, categoryNames: ['Ação'] })
    expect(noHistory.map((row) => [row.key, row.format])).toEqual([
      ['favorites', 'poster-xl'],
      ['cat:Ação', 'poster-compact'],
    ])
    const bare = buildShowcaseRows({ section: 'series', hasContinue: false, hasFavorites: false, hasAdded: false, categoryNames: [] })
    expect(bare.map((row) => row.key)).toEqual([])
    // O Top 10 (feature 057) deixou de ser slot: some sem dado; o título por seção é coberto pelos testes da 057.
  })
})
