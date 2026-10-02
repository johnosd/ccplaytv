import { describe, expect, it } from 'vitest'
import { formatCounts } from './sourceFormat'

const zero = { categories: 0 }

describe('formatCounts (feature 034, US4, FR-017/FR-018)', () => {
  it('AC1 — Xtream com categorias: "41 categorias de canais · 20 de filmes · 30 de séries"', () => {
    expect(
      formatCounts({ channels: { categories: 41 }, movies: { categories: 20 }, series: { categories: 30 } }),
    ).toBe('41 categorias de canais · 20 de filmes · 30 de séries')
  })

  it('AC2 — M3U guardada: os totais exatos de itens por tipo, com milhar em pt-BR', () => {
    expect(
      formatCounts({ channels: { items: 1200, categories: 8 }, movies: { items: 300, categories: 3 }, series: zero }),
    ).toBe('1.200 canais · 300 filmes')
  })

  it('AC3 — tipo sem nenhuma categoria declarada não aparece (nunca "0 de séries")', () => {
    const text = formatCounts({ channels: { categories: 5 }, movies: zero, series: zero })
    expect(text).toBe('5 categorias de canais')
    expect(text).not.toMatch(/\b0\b/)
  })

  it('AC4 — seção que não respondeu na última sincronização diz "não obtidos", nunca "0"', () => {
    expect(formatCounts({ channels: { categories: 5 }, movies: zero, series: { categories: 9 } }, ['movie'])).toBe(
      '5 categorias de canais · filmes não obtidos · 9 de séries',
    )
    expect(formatCounts({ channels: zero, movies: zero, series: zero }, ['movie', 'series'])).toBe(
      'filmes não obtidos · séries não obtidas',
    )
  })

  it('a seção indisponível ganha mesmo que ainda haja categorias gravadas de antes', () => {
    expect(formatCounts({ channels: { categories: 2 }, movies: { categories: 7 }, series: zero }, ['movie'])).toBe(
      '2 categorias de canais · filmes não obtidos',
    )
  })

  it('o primeiro tipo contado mantém a forma longa mesmo quando não é canais', () => {
    expect(formatCounts({ channels: zero, movies: { categories: 20 }, series: { categories: 30 } })).toBe(
      '20 categorias de filmes · 30 de séries',
    )
  })

  it('itens e categorias misturados: nada encurta (só "todas de categorias" encurta)', () => {
    expect(formatCounts({ channels: { items: 1200, categories: 8 }, movies: { categories: 20 }, series: zero })).toBe(
      '1.200 canais · 20 categorias de filmes',
    )
  })

  it('singular quando é 1, e nada a mostrar quando não há nada', () => {
    expect(formatCounts({ channels: { items: 1, categories: 1 }, movies: { categories: 1 }, series: { items: 1, categories: 1 } })).toBe(
      '1 canal · 1 categoria de filmes · 1 série',
    )
    expect(formatCounts({ channels: zero, movies: zero, series: zero })).toBeUndefined()
  })

  it('uma fonte com itens contados e 0 itens reais ainda mostra o número real (0 só aparece se o dado é 0 de fato)', () => {
    expect(formatCounts({ channels: { items: 0, categories: 3 }, movies: zero, series: zero })).toBe('0 canais')
  })
})
