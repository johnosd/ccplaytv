// Contrato da feature 086 — travado pelo sdd-plan; o sdd-execute só pode fazê-lo passar.
import { describe, expect, it } from 'vitest'
import type { CatalogRecord } from './db'
import { pickCandidates, RATED_CANDIDATES, RECENT_CANDIDATES } from './showcaseCandidates'

const NOW = Date.UTC(2026, 9, 20, 12)
const TARGET = { sourceId: 'f', generation: 1, kind: 'movie' as const, categoryId: 7, groupOrder: 3, order: 3 }

/** 120 itens de uma categoria: datas decrescentes, notas e anos variados, alguns sem data/nota/ano. */
const ITEMS: CatalogRecord[] = Array.from({ length: 120 }, (_, index) => ({
  sourceId: 'f', generation: 1, kind: 'movie', groupOrder: 3,
  name: `Filme ${index}`, originalName: `Filme ${index}`, providerStreamId: String(index),
  addedAt: index % 9 === 0 ? undefined : NOW - index * 60_000,
  providerRating: index % 10 === 0 ? undefined : 6 + ((index * 3) % 39) / 10,
  year: index % 11 === 0 ? undefined : 2026 - ((index * 5) % 12),
}))

describe('candidatos por categoria (086)', () => {
  // FR-003 / `logic/selecoes-guardadas.md` §1: escolhe sobre os itens em mãos, sem tocar o banco, dentro dos limites.
  it('guarda os mais novos e os melhores da categoria, sem ler o banco, respeitando os limites', () => {
    const candidates = pickCandidates(TARGET, ITEMS, NOW)

    expect(candidates.categoryId).toBe(7)
    expect(candidates.order).toBe(3)
    expect(candidates.itemsCount).toBe(ITEMS.length)

    // Os mais novos: exatamente os `RECENT_CANDIDATES` com data mais recente, do mais novo para o mais antigo.
    const esperadosRecentes = ITEMS
      .filter((item) => typeof item.addedAt === 'number')
      .sort((a, b) => (b.addedAt as number) - (a.addedAt as number))
      .slice(0, RECENT_CANDIDATES)
      .map((item) => item.name)
    expect(candidates.recent.map((item) => item.name)).toEqual(esperadosRecentes)

    // Os avaliados cabem no limite e trazem só elegíveis (nota 6,0–9,9 e ano conhecido).
    expect(candidates.rated.length).toBeLessThanOrEqual(RATED_CANDIDATES)
    expect(candidates.rated.length).toBeGreaterThan(0)
    for (const item of candidates.rated) {
      expect(item.providerRating).toBeGreaterThanOrEqual(6)
      expect(item.providerRating).toBeLessThan(10)
      expect(typeof item.year).toBe('number')
    }
    expect(candidates.eligibleCount).toBeGreaterThanOrEqual(candidates.rated.length)

    // Cada candidato carrega o que o card precisa, para a montagem não reabrir o bloco da categoria.
    const primeiro = candidates.recent[0]
    expect(primeiro.categoryId).toBe(7)
    expect(primeiro.name).not.toBe('')
    expect(typeof primeiro.hasPlayback).toBe('boolean')
  })
})
