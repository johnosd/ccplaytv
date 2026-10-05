import { describe, expect, it } from 'vitest'
import { matchDiscoveryTitles, matchDiscoveryTitlesAsync, selectTip, selectTop10, versionTier, type MatchedTitle } from './discoveryRules'
import type { DiscoveryTitle } from './tmdbDiscovery'

interface Local {
  id: string
  name: string
  year?: number
  rating?: unknown
  at?: unknown
}
const read = {
  id: (l: Local) => l.id,
  name: (l: Local) => l.name,
  year: (l: Local) => l.year,
  rating: (l: Local) => l.rating,
  addedAt: (l: Local) => l.at,
}
const tmdb = (rank: number, title: string, year: number | undefined, over: Partial<DiscoveryTitle> = {}): DiscoveryTitle => ({
  tmdbId: 500 + rank,
  kind: 'movie',
  title,
  year,
  voteAverage: 8,
  voteCount: 1000,
  popularity: 100,
  rank,
  ...over,
})
const ids = (matches: MatchedTitle<Local>[]) => matches.map((m) => m.local.id)

describe('versionTier', () => {
  it.each([
    ['Duna', 0],
    ['Duna (2021)', 0],
    ['Duna HD', 0],
    ['Duna FHD', 0],
    ['Duna Dublado', 0],
    ['Duna [L]', 1],
    ['Duna [LEG]', 1],
    ['Duna (LEG)', 1],
    ['Duna Legendado', 1],
    ['Duna 4K', 1],
    ['Duna UHD', 1],
    ['Duna 2160p', 1],
  ])('%s → %i', (name, tier) => {
    expect(versionTier(name)).toBe(tier)
  })
})

describe('matchDiscoveryTitles — casos além do contrato (feature 057)', () => {
  it('homônimo de ano diferente não casa; sem ano no TMDB ou na lista não casa', () => {
    const locals: Local[] = [{ id: 'a', name: 'Alfa', year: 2020 }, { id: 'b', name: 'Beta' }]
    expect(ids(matchDiscoveryTitles([tmdb(1, 'Alfa', 2021)], locals, read))).toEqual([])
    expect(ids(matchDiscoveryTitles([tmdb(1, 'Alfa', undefined)], locals, read))).toEqual([])
    expect(ids(matchDiscoveryTitles([tmdb(1, 'Beta', 2020)], locals, read))).toEqual([])
  })

  it('"Legendado"/"Dublado" soltos e pontuação não atrapalham; acento é ignorado', () => {
    const locals: Local[] = [
      { id: 'a', name: 'Amélie Poulain Dublado', year: 2001 },
      { id: 'b', name: 'Spider-Man: Longe de Casa Legendado', year: 2019 },
    ]
    const titles = [tmdb(1, 'Amelie Poulain', 2001), tmdb(2, 'Spider Man Longe de Casa', 2019)]
    expect(ids(matchDiscoveryTitles(titles, locals, read))).toEqual(['a', 'b'])
  })

  it('entre cópias iguais: versão, depois nota, depois adição mais recente, depois a primeira; nota inválida e data ausente ficam por último', () => {
    const titles = [tmdb(1, 'Alfa', 2025)]
    const pick = (locals: Local[]) => ids(matchDiscoveryTitles(titles, locals, read))
    expect(pick([{ id: 'x', name: 'Alfa', year: 2025, rating: 6 }, { id: 'y', name: 'Alfa', year: 2025, rating: 9 }])).toEqual(['y'])
    expect(pick([{ id: 'x', name: 'Alfa', year: 2025, rating: 0 }, { id: 'y', name: 'Alfa', year: 2025, rating: 5 }])).toEqual(['y'])
    expect(pick([{ id: 'x', name: 'Alfa', year: 2025, at: 1 }, { id: 'y', name: 'Alfa', year: 2025, at: 9 }])).toEqual(['y'])
    expect(pick([{ id: 'x', name: 'Alfa', year: 2025 }, { id: 'y', name: 'Alfa', year: 2025, at: Number.NaN }])).toEqual(['x'])
    expect(pick([{ id: 'x', name: 'Alfa 4K', year: 2025, rating: 10 }, { id: 'y', name: 'Alfa', year: 2025, rating: 1 }])).toEqual(['y'])
  })

  it('lista vazia ou títulos vazios devolvem vazio', () => {
    expect(matchDiscoveryTitles([], [{ id: 'a', name: 'Alfa', year: 2020 }], read)).toEqual([])
    expect(matchDiscoveryTitles([tmdb(1, 'Alfa', 2020)], [], read)).toEqual([])
  })

  it('selectTop10 não muta a entrada', () => {
    const matches = [1, 2, 3, 4].map((n) => ({ title: tmdb(n, `T${n}`, 2020), local: { id: `l${n}`, name: `T${n}` } }))
    const before = matches.map((m) => m.title.rank)
    selectTop10(matches)
    expect(matches.map((m) => m.title.rank)).toEqual(before)
  })
})

describe('selectTip — popularidade pesa no sorteio', () => {
  it('o título muito mais popular é sorteado bem mais vezes que um pouco popular, sem ser o único', () => {
    const NOW = new Date(2026, 9, 4, 12).getTime()
    const cand = (n: number, popularity: number): MatchedTitle<Local> => ({
      title: tmdb(n, `T${n}`, 2024, { popularity }),
      local: { id: `l${n}`, name: `T${n}`, year: 2024 },
    })
    // 12 candidatos, sorteia 5 por semente: o de popularidade 900 contra o de 4.
    const matches = [cand(1, 900), cand(2, 4), ...Array.from({ length: 10 }, (_, i) => cand(i + 3, 40))]
    let popular = 0
    let obscure = 0
    for (let day = 0; day < 400; day += 1) {
      const picked = selectTip(matches, { now: NOW, seed: `dia-${day}`, limit: 5 }).map((l) => l.id)
      if (picked.includes('l1')) popular += 1
      if (picked.includes('l2')) obscure += 1
    }
    expect(popular).toBeGreaterThan(obscure * 1.5)
    expect(obscure).toBeGreaterThan(0)
  })
})

describe('matchDiscoveryTitlesAsync — cruzamento sem prender a thread (feature 057, T043)', () => {
  const makeLocals = (n: number): Local[] => Array.from({ length: n }, (_, i) => ({ id: `l${i}`, name: `Título ${i}`, year: 2020 + (i % 5) }))
  const titles = [tmdb(1, 'Título 3', 2023), tmdb(2, 'Título 10', 2020), tmdb(3, 'Título 77', 2022), tmdb(4, 'Inexistente', 2021)]

  it('dá o mesmo resultado da versão síncrona', async () => {
    const locals = makeLocals(500)
    const sync = matchDiscoveryTitles(titles, locals, read)
    const async = await matchDiscoveryTitlesAsync(titles, locals, read, { yieldFn: async () => {}, sliceSize: 50 })
    expect(async.map((m) => [m.title.rank, m.local.id])).toEqual(sync.map((m) => [m.title.rank, m.local.id]))
    expect(async.length).toBe(3)
  })

  it('cede a thread a cada fatia (nunca um bloco só) e não muta a entrada', async () => {
    const locals = makeLocals(1000)
    const before = locals.map((l) => l.id)
    let yields = 0
    await matchDiscoveryTitlesAsync(titles, locals, read, { yieldFn: async () => void (yields += 1), sliceSize: 100 })
    expect(yields).toBe(10)
    expect(locals.map((l) => l.id)).toEqual(before)
  })

  it('Top 10 e Dica do mesmo tipo (chamadas concorrentes com a mesma lista) montam o índice uma vez só', async () => {
    const locals = makeLocals(300)
    let nameReads = 0
    const counting = { ...read, name: (l: Local) => ((nameReads += 1), l.name) }
    const opts = { yieldFn: async () => {}, sliceSize: 50 }
    const [a, b] = await Promise.all([
      matchDiscoveryTitlesAsync(titles, locals, counting, opts),
      matchDiscoveryTitlesAsync([tmdb(9, 'Título 5', 2020)], locals, counting, opts),
    ])
    expect(a.length).toBe(3)
    expect(b.length).toBe(1)
    const afterFirst = nameReads
    await matchDiscoveryTitlesAsync(titles, locals, counting, opts) // 3ª chamada: índice já guardado, nenhum registro relido
    expect(nameReads).toBe(afterFirst)
    expect(afterFirst).toBeLessThanOrEqual(locals.length * 2) // `versionTier` lê o nome de novo, mas só uma vez por registro
  })

  it('sem títulos nada é lido', async () => {
    const locals = makeLocals(10)
    let reads = 0
    expect(await matchDiscoveryTitlesAsync([], locals, { ...read, name: (l: Local) => ((reads += 1), l.name) })).toEqual([])
    expect(reads).toBe(0)
  })
})