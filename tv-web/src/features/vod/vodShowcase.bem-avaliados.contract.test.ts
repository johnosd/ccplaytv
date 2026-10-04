/**
 * Teste de CONTRATO da feature 056 (fileira "Bem avaliados" em Filmes e Séries) — a regra pura: quem entra na fileira
 * (recente, de boa nota, sem versões duplicadas), quando ela existe, e a ordenação por nota que só o "Ver tudo" dela usa.
 * Travado em `sdd/specs/056-bem-avaliados/contract-tests.lock`. O sdd-execute só pode fazê-lo passar, nunca editá-lo.
 *
 * Emendado em 2026-10-04 (R-011, aprovado pelo usuário): o 1º teste passou de `topRated` (maior nota, qualquer ano) para
 * `selectFeaturedRated` (FR-015..FR-018). Os outros três testes ficaram como estavam.
 */
import { describe, expect, it } from 'vitest'
import type { CatalogItemOut } from '../catalog/catalogApi'
import { selectFeaturedRated } from './ratedSelection'
import { RATED_MIN } from './vodShowcase'
import { buildShowcaseRows } from './vodShowcaseRows'
import { availableSortOptions, sortVodItems } from './vodSort'

function item(name: string, rating: number | null | undefined, addedAt?: number | null): CatalogItemOut {
  return {
    id: `id-${name}`,
    kind: 'movie',
    name,
    original_group: 'Ação',
    published: true,
    playable: true,
    source_id: 'source-1',
    provider_stream_id: name,
    original_name: name,
    added_at: addedAt ?? null,
    provider_rating: rating,
  }
}

const names = (items: readonly CatalogItemOut[]) => items.map((entry) => entry.name)

interface Film {
  name: string
  rating: number | null
  year?: number
  at?: number
}
const film = (name: string, rating: number | null, year?: number, at?: number): Film => ({ name, rating, year, at })
const read = {
  id: (f: Film) => `id-${f.name}`,
  name: (f: Film) => f.name,
  rating: (f: Film) => f.rating,
  year: (f: Film) => f.year,
  addedAt: (f: Film) => f.at,
}
const NOW = new Date(2026, 9, 4, 12).getTime()
const select = (films: Film[]) => selectFeaturedRated(films, read, { now: NOW, seed: 'contrato' })
const filmNames = (films: Film[]) => films.map((f) => f.name)

describe('Bem avaliados — regra pura (feature 056)', () => {
  // US1/AC1, US1/AC2, US3/AC2, FR-002, FR-003, FR-015, FR-016, FR-018
  it('selectFeaturedRated: só nota 6,0–9,9 com ano, recentes antes dos antigos, uma versão por título, no máximo 12 em ordem de nota; abaixo do mínimo a fileira não existe', () => {
    const recent = Array.from({ length: 14 }, (_, index) => film(`R${index + 1}`, Math.round((9.5 - index * 0.1) * 10) / 10, 2026 - (index % 6), 100 + index))
    const excluded = [
      film('Dez', 10, 2025),
      film('Baixo', 5.9, 2025),
      film('Zero', 0, 2025),
      film('Sem ano', 9.4),
      film('Velho', 9.9, 1980),
    ]
    const input = [...excluded, film('R1 [L]', 9.5, 2026, 999), ...recent]
    const before = filmNames(input)

    const { picked, eligibleCount } = select(input)

    expect(picked).toHaveLength(12)
    expect(eligibleCount).toBe(15) // 14 recentes ("R1" e "R1 [L]" são o mesmo título) + "Velho", elegível mas antigo
    for (const out of ['Dez', 'Baixo', 'Zero', 'Sem ano', 'Velho']) expect(filmNames(picked)).not.toContain(out)
    expect(filmNames(picked).filter((name) => name === 'R1' || name === 'R1 [L]').length).toBeLessThanOrEqual(1)
    expect(picked.every((f) => (f.year ?? 0) >= 2016 && f.rating !== null && f.rating >= 6 && f.rating < 10)).toBe(true)
    const ratings = picked.map((f) => f.rating as number)
    expect(ratings).toEqual([...ratings].sort((a, b) => b - a))
    expect(filmNames(input)).toEqual(before) // nunca muta a entrada

    // US3/AC2, FR-003: com menos de RATED_MIN títulos elegíveis a fileira não existe; com RATED_MIN, existe.
    expect(RATED_MIN).toBe(5)
    const four = [film('A', 9, 2025), film('B', 8, 2025), film('C', 7, 2025), film('D', 6, 2025)]
    const ineligible = excluded.filter((f) => f.name !== 'Velho') // "Velho" tem nota e ano: é elegível, só não é recente
    expect(select([...four, ...ineligible])).toEqual({ picked: [], eligibleCount: 4 })
    expect(select([])).toEqual({ picked: [], eligibleCount: 0 })

    // FR-016 (plano B): faltando recentes, completa com os mais novos que existirem (o antigo só entra aqui).
    const five = [...four, film('E', 6.5, 2024)]
    expect(filmNames(select([...excluded, ...five]).picked)).toEqual(['Velho', 'A', 'B', 'C', 'E', 'D']) // por nota: E (6,5) vem antes de D (6,0)
  })

  // US3/AC1, FR-001, FR-003, FR-009, Constitution: "Foco Visível e Sem Becos Sem Saída" (sem slot fantasma)
  it('buildShowcaseRows: com nota a fileira "rated" é de itens, entre "added" e "because", com Ver tudo ordenado por nota; sem nota some, sem slot "Em breve"', () => {
    const base = { section: 'movies' as const, hasContinue: false, hasFavorites: false, hasAdded: true, categoryNames: ['Ação'] }

    const withRated = buildShowcaseRows({ ...base, hasRated: true })
    expect(withRated.map((row) => row.key)).toEqual(['added', 'rated', 'because', 'cat:Ação'])
    const rated = withRated.find((row) => row.key === 'rated')!
    expect(rated.kind).toBe('items')
    expect(rated.format).toBe('poster')
    expect(rated.slotId).toBeNull()
    expect(rated.seeAll).toEqual({ kind: 'all', sort: 'rating' })
    expect(rated.title).toBe('Bem avaliados')

    for (const without of [buildShowcaseRows({ ...base, hasRated: false }), buildShowcaseRows(base)]) {
      expect(without.map((row) => row.key)).toEqual(['added', 'because', 'cat:Ação'])
      expect(without.some((row) => row.slotId === 'vod-rated')).toBe(false)
    }
    // Os outros slots reservados seguem como estavam.
    expect(withRated.filter((row) => row.kind === 'slot').map((row) => row.key)).toEqual(['because'])
  })

  // US2/AC1, US2/AC3, FR-007, FR-008
  it('sortVodItems("rating"): nota decrescente, empate pelo mais recente, sem nota ao final na ordem da fonte; o menu geral de ordenação NÃO oferece "rating"', () => {
    const input = [
      item('Sem nota 1', null),
      item('Sete', 7, 5),
      item('Nove antigo', 9, 5),
      item('Indefinido', undefined),
      item('Nove novo', 9, 20),
    ]
    const before = names(input)

    expect(names(sortVodItems(input, 'rating'))).toEqual(['Nove novo', 'Nove antigo', 'Sete', 'Sem nota 1', 'Indefinido'])
    expect(names(input)).toEqual(before) // nunca muta a entrada

    // Mesmo com notas nos itens, "Nota" não vira opção do modal de Ordenar (FR-008).
    expect(availableSortOptions(input)).not.toContain('rating')
  })
})
