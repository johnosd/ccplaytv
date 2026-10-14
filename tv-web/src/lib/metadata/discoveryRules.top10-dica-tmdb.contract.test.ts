/**
 * Teste de CONTRATO da feature 057 (Top 10 da semana e Dica, TMDB) — as regras puras: o cruzamento com a lista (mesmo tipo,
 * mesmo ano, versão principal antes de 4K/legendada, posição real do ranking) e o sorteio estável da Dica. Travado em
 * `sdd/specs/057-top10-dica-tmdb/contract-tests.lock`. O sdd-execute só pode fazê-lo passar, nunca editá-lo.
 */
import { describe, expect, it } from 'vitest'
import {
  DISCOVERY_LIMIT,
  TIP_MIN,
  TOP10_MIN,
  matchDiscoveryTitles,
  selectTip,
  selectTop10,
  versionTier,
  type MatchedTitle,
} from './discoveryRules'
import type { DiscoveryTitle } from './tmdbDiscovery'

interface Local {
  id: string
  name: string
  year?: number
  rating?: number | null
  at?: number
}
const local = (id: string, name: string, year?: number, rating?: number | null, at?: number): Local => ({ id, name, year, rating, at })
const read = {
  id: (l: Local) => l.id,
  name: (l: Local) => l.name,
  year: (l: Local) => l.year,
  rating: (l: Local) => l.rating,
  addedAt: (l: Local) => l.at,
}

const tmdb = (rank: number, name: string, year: number | undefined, over: Partial<DiscoveryTitle> = {}): DiscoveryTitle => ({
  tmdbId: 1000 + rank,
  kind: 'movie',
  title: name,
  year,
  voteAverage: 8,
  voteCount: 1000,
  popularity: 100,
  rank,
  ...over,
})

describe('Top 10 e Dica — regras puras (feature 057)', () => {
  // US1/AC2, US1/AC3, US1/AC7, FR-002, FR-003, FR-004, FR-010, FR-011
  it('matchDiscoveryTitles/selectTop10: mesmo ano, versão principal antes de 4K/legendada, posição real sem renumerar, um registro por título, Top 10 só com 3 ou mais', () => {
    const locals: Local[] = [
      local('a-leg', 'Alfa [L]', 2025, 9),
      local('a-4k', 'Alfa 4K', 2025),
      local('a', 'Alfa', 2025, 5), // principal vence mesmo com nota pior
      local('b-leg', 'Beta [L]', 2024, 7, 1),
      local('b-4k', 'Beta 4K', 2024, 8, 0), // sem principal: entre 4K/legendada, a de maior nota
      local('g', 'Gama', 2022), // ano diferente do TMDB (2023): não casa
      local('d', 'Delta (2021)'), // sem `year`: vale o ano escrito no nome
      local('z', 'Zeta', 2020), // casa pelo título original
      local('e-old', 'Epsilon', 2019), // "Epsilon" do TMDB é de 2025
    ]
    const titles: DiscoveryTitle[] = [
      tmdb(1, 'Alfa', 2025),
      tmdb(2, 'Epsilon', 2025), // fora da lista (só existe a de 2019)
      tmdb(3, 'Beta', 2024),
      tmdb(4, 'Gama', 2023),
      tmdb(5, 'Delta', 2021),
      tmdb(6, 'Zeta em português', 2020, { originalTitle: 'Zeta' }),
      tmdb(9, 'Alfa', 2025, { tmdbId: 99 }), // outro título do TMDB que cairia no mesmo registro: não pode repetir
    ]
    const before = locals.map((l) => l.id)

    const matches = matchDiscoveryTitles(titles, locals, read)

    expect(matches.map((m) => [m.title.rank, m.local.id])).toEqual([
      [1, 'a'],
      [3, 'b-4k'],
      [5, 'd'],
      [6, 'z'],
    ])
    expect(locals.map((l) => l.id)).toEqual(before) // nunca muta a entrada

    expect(versionTier('Alfa')).toBe(0)
    expect(versionTier('Alfa HD')).toBe(0)
    expect(versionTier('Alfa [L]')).toBe(1)
    expect(versionTier('Alfa 4K')).toBe(1)
    expect(versionTier('Alfa Legendado')).toBe(1)

    // FR-003/FR-004: ordem do ranking, posição real (1, 3, 5, 6) e mínimo de 3.
    expect(TOP10_MIN).toBe(3)
    expect(selectTop10(matches).map((entry) => [entry.rank, entry.local.id])).toEqual([
      [1, 'a'],
      [3, 'b-4k'],
      [5, 'd'],
      [6, 'z'],
    ])
    expect(selectTop10(matches.slice(0, TOP10_MIN - 1))).toEqual([])
    const many: MatchedTitle<Local>[] = Array.from({ length: 12 }, (_, i) => ({ title: tmdb(i + 1, `T${i + 1}`, 2025), local: local(`l${i + 1}`, `T${i + 1}`, 2025) }))
    expect(selectTop10(many).map((entry) => entry.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  // US2/AC1, US2/AC2, US2/AC3, US2/AC6, FR-005, FR-006, FR-007, FR-008
  it('selectTip: só nota ≥ 7,0 com votos mínimos e lançamento dos últimos 15 anos; no mínimo 5; 10 sorteados, estáveis para a mesma semente e diferentes de um dia para o outro', () => {
    const NOW = new Date(2026, 9, 4, 12).getTime() // ano corrente: 2026
    const cand = (n: number, over: Partial<DiscoveryTitle> = {}): MatchedTitle<Local> => ({
      title: tmdb(n, `T${n}`, 2024, { voteAverage: 7.5, voteCount: 1000, popularity: 20 + n, ...over }),
      local: local(`l${n}`, `T${n}`, 2024),
    })
    const valid = Array.from({ length: 40 }, (_, i) => cand(i + 1))
    const edge = cand(106, { voteAverage: 7, voteCount: 300, year: 2011 }) // exatamente nos limites: vale
    const invalid = [
      cand(101, { voteAverage: 6.9 }),
      cand(102, { voteCount: 299 }),
      cand(103, { year: 2010 }), // mais de 15 anos
      cand(104, { year: undefined }),
      cand(105, { year: 2027 }), // ainda não lançado
    ]
    const pick = (matches: readonly MatchedTitle<Local>[], seed = 'dia-1') => selectTip(matches, { now: NOW, seed }).map((l) => l.id)
    const all = [...invalid, ...valid, edge]
    const before = all.map((m) => m.local.id)

    const picked = pick(all)
    expect(DISCOVERY_LIMIT).toBe(10)
    expect(picked).toHaveLength(10)
    for (const out of ['l101', 'l102', 'l103', 'l104', 'l105']) expect(picked).not.toContain(out)
    expect(all.map((m) => m.local.id)).toEqual(before) // nunca muta a entrada

    // FR-007: mesma semente ⇒ mesmos cards na mesma ordem (inclusive com a entrada em outra ordem); outro dia ⇒ outro sorteio.
    expect(pick(all)).toEqual(picked)
    expect(pick([...all].reverse())).toEqual(picked)
    expect(pick(all, 'dia-2')).not.toEqual(picked)

    // FR-008: mínimo de 5 válidos (o candidato exatamente no limite conta).
    expect(TIP_MIN).toBe(5)
    expect(pick([...invalid, ...valid.slice(0, 4)])).toEqual([])
    expect(pick([...invalid, ...valid.slice(0, 5)])).toHaveLength(5)
    expect(pick([...invalid, edge, ...valid.slice(0, 4)])).toHaveLength(5)

    // FR-006: série tem menos votos que filme — o piso dela é 100.
    const serie = (n: number, over: Partial<DiscoveryTitle> = {}) => cand(n, { kind: 'series', voteCount: 120, ...over })
    expect(pick([1, 2, 3, 4, 5].map((n) => serie(n)))).toHaveLength(5)
    expect(pick([...[1, 2, 3, 4].map((n) => serie(n)), serie(9, { voteCount: 99 })])).toEqual([])
  })
})
