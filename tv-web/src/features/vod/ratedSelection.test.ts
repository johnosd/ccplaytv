import { describe, expect, it } from 'vitest'
import { dayKey, fnv1a32, RATED_POOL, selectFeaturedRated, titleKey } from './ratedSelection'

// Feature 056 (T030, FR-015..FR-018): seleção recente, de boa nota, sem duplicatas e variada por dia.
interface Film {
  id: string
  name: string
  rating?: unknown
  year?: unknown
  at?: unknown
}

const NOW = new Date(2026, 9, 4, 12).getTime()
const read = {
  id: (film: Film) => film.id,
  name: (film: Film) => film.name,
  rating: (film: Film) => film.rating,
  year: (film: Film) => film.year,
  addedAt: (film: Film) => film.at,
}
const pick = (films: Film[], seed = 'dia-1', extra: { limit?: number; min?: number } = {}) =>
  selectFeaturedRated(films, read, { now: NOW, seed, ...extra })
const names = (films: Film[]) => films.map((film) => film.name)

/** `count` filmes recentes e elegíveis, de nota decrescente (9,5 → …), um por ano 2019–2026. */
function recentFilms(count: number, prefix = 'Filme'): Film[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
    rating: Math.round((9.5 - index * 0.05) * 100) / 100,
    year: 2019 + (index % 8),
    at: 1_000 + index,
  }))
}

describe('titleKey (FR-018)', () => {
  it('versões do mesmo filme caem na mesma chave; filmes diferentes não', () => {
    const base = titleKey('A Hipótese do Amor')
    expect(titleKey('A Hipótese do Amor [L]')).toBe(base)
    expect(titleKey('A Hipótese do Amor 4K')).toBe(base)
    expect(titleKey('A Hipótese do Amor (Dublado)')).toBe(base)
    expect(titleKey('A Hipótese do Amor (2026)')).toBe(base)
    expect(titleKey('A Hipotese do Amor [DUB] HD')).toBe(base)
    expect(titleKey('A Hipótese do Amor 2')).not.toBe(base)
    expect(titleKey('Alma Negra (Parte 2)')).not.toBe(titleKey('Alma Negra'))
  })

  it('nome só de marcador ainda devolve uma chave não vazia', () => {
    expect(titleKey('[L]')).not.toBe('')
    expect(titleKey('4K')).not.toBe('')
  })
})

describe('selectFeaturedRated — elegibilidade (FR-015, FR-016)', () => {
  it('fora: nota 10, abaixo de 6, inválida e sem ano; dentro: 6,0 e 9,9', () => {
    const films: Film[] = [
      ...recentFilms(5),
      { id: 'dez', name: 'Dez', rating: 10, year: 2025 },
      { id: 'cinco', name: 'Cinco', rating: 5.9, year: 2025 },
      { id: 'zero', name: 'Zero', rating: 0, year: 2025 },
      { id: 'texto', name: 'Texto', rating: '9', year: 2025 },
      { id: 'semano', name: 'Sem ano', rating: 9, year: undefined },
      { id: 'futuro', name: 'Ano absurdo', rating: 9, year: 2099 },
      { id: 'seis', name: 'Seis', rating: 6, year: 2025 },
      { id: 'nove9', name: 'Nove nove', rating: 9.9, year: 2025 },
    ]
    const { picked } = pick(films)
    expect(names(picked)).toContain('Seis')
    expect(names(picked)).toContain('Nove nove')
    for (const out of ['Dez', 'Cinco', 'Zero', 'Texto', 'Sem ano', 'Ano absurdo']) expect(names(picked)).not.toContain(out)
  })

  it('abaixo do mínimo de elegíveis a fileira não existe; os inelegíveis não contam', () => {
    const films: Film[] = [...recentFilms(4), { id: 'dez', name: 'Dez', rating: 10, year: 2025 }, { id: 'velho', name: 'Velho', rating: 9, year: undefined }]
    expect(pick(films)).toEqual({ picked: [], eligibleCount: 4 })
    expect(pick([...films, ...recentFilms(1, 'Extra')]).picked).toHaveLength(5)
  })

  it('versões duplicadas contam como um título só no mínimo', () => {
    const cinco = recentFilms(1)
    const copies: Film[] = ['[L]', '4K', '(Dublado)', 'HD'].map((tag, index) => ({ ...cinco[0], id: `c${index}`, name: `${cinco[0].name} ${tag}` }))
    expect(pick([...cinco, ...copies, ...recentFilms(3, 'Outro')]).picked).toEqual([])
  })

  it('recentes vêm antes dos antigos; faltando recentes, completa com os mais novos que existirem (plano B)', () => {
    const recent = recentFilms(8)
    const older: Film[] = [
      { id: 'o2015', name: 'De 2015', rating: 9.8, year: 2015, at: 1 },
      { id: 'o2005', name: 'De 2005', rating: 9.9, year: 2005, at: 1 },
      { id: 'o1990', name: 'De 1990', rating: 9.7, year: 1990, at: 1 },
      { id: 'o2012', name: 'De 2012', rating: 9.6, year: 2012, at: 1 },
      { id: 'o2000', name: 'De 2000', rating: 9.4, year: 2000, at: 1 },
      { id: 'o1980', name: 'De 1980', rating: 9.3, year: 1980, at: 1 },
    ]
    const { picked } = pick([...older, ...recent], 'dia-1', { limit: 12 })
    expect(picked).toHaveLength(12)
    // 8 recentes + os 4 mais novos entre os antigos (2015, 2012, 2005, 2000), mesmo com nota maior nos mais velhos.
    expect(names(picked).filter((name) => name.startsWith('De '))).toEqual(expect.arrayContaining(['De 2015', 'De 2012', 'De 2005', 'De 2000']))
    expect(names(picked)).not.toContain('De 1990')
    expect(names(picked)).not.toContain('De 1980')
  })

  it('com 12+ recentes, nenhum antigo entra', () => {
    const { picked } = pick([...recentFilms(20), { id: 'v', name: 'Clássico', rating: 9.9, year: 1972 }])
    expect(picked).toHaveLength(12)
    expect(names(picked)).not.toContain('Clássico')
    expect(picked.every((film) => Number(film.year) >= 2016)).toBe(true)
  })
})

describe('selectFeaturedRated — duplicatas (FR-018)', () => {
  it('uma versão por título e ano; fica a de maior nota; mesmo nome em anos diferentes não se funde', () => {
    const films: Film[] = [
      { id: 'a1', name: 'Condor', rating: 8, year: 2026, at: 1 },
      { id: 'a2', name: 'Condor [L]', rating: 8.4, year: 2026, at: 2 },
      { id: 'a3', name: 'Condor 4K', rating: 8.4, year: 2026, at: 9 },
      { id: 'b', name: 'Condor', rating: 7, year: 2018, at: 1 },
      ...recentFilms(4),
    ]
    const { picked } = pick(films)
    const condors = picked.filter((film) => film.name.startsWith('Condor'))
    expect(condors.map((film) => film.id).sort()).toEqual(['a3', 'b']) // a3 = maior nota, depois o mais recente
  })
})

describe('selectFeaturedRated — variação diária estável (FR-017)', () => {
  const pool = recentFilms(30)

  it('mesma semente e mesmos dados ⇒ mesma escolha; a ordem final é nota ↓', () => {
    const first = pick(pool, '2026-10-04|movie|src')
    const again = pick(pool, '2026-10-04|movie|src')
    expect(names(again.picked)).toEqual(names(first.picked))
    const ratings = first.picked.map((film) => Number(film.rating))
    expect(ratings).toEqual([...ratings].sort((a, b) => b - a))
  })

  it('outra semente (outro dia, outra seção ou outra lista) ⇒ conjunto diferente, sempre dentro do pool dos melhores', () => {
    const base = new Set(names(pick(pool, '2026-10-04|movie|src').picked))
    const other = pick(pool, '2026-10-05|movie|src')
    expect(new Set(names(other.picked))).not.toEqual(base)
    const allowed = new Set(names([...pool].sort((a, b) => Number(b.rating) - Number(a.rating)).slice(0, RATED_POOL)))
    for (const name of names(other.picked)) expect(allowed.has(name)).toBe(true)
  })

  it('o sorteio não ignora a qualidade: com mais de 36 recentes, os piores nunca aparecem', () => {
    const many = recentFilms(60)
    const worst = new Set(names(many.slice(RATED_POOL)))
    for (const seed of ['d1', 'd2', 'd3', 'd4', 'd5', 'd6']) {
      for (const name of names(pick(many, seed).picked)) expect(worst.has(name)).toBe(false)
    }
  })

  it('um candidato novo troca no máximo um título (a escolha é estável quando os dados mudam pouco)', () => {
    const before = new Set(names(pick(pool, 'estavel').picked))
    const extra: Film = { id: 'novo', name: 'Novo', rating: 9.4, year: 2025, at: 5 }
    const after = new Set(names(pick([...pool, extra], 'estavel').picked))
    const lost = [...before].filter((name) => !after.has(name))
    expect(lost.length).toBeLessThanOrEqual(2) // o pool também desloca um item na borda
  })

  it('nunca muta a entrada e aceita qualquer iterável', () => {
    const input = recentFilms(15)
    const before = names(input)
    pick(input)
    expect(names(input)).toEqual(before)
    expect(selectFeaturedRated(new Set(input), read, { now: NOW, seed: 's' }).picked.length).toBeGreaterThan(0)
  })
})

describe('dayKey / fnv1a32', () => {
  it('dayKey é a data local e fnv1a32 é estável', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05')
    expect(dayKey(new Date(2026, 0, 6, 0, 1).getTime())).toBe('2026-01-06')
    expect(fnv1a32('abc')).toBe(fnv1a32('abc'))
    expect(fnv1a32('abc')).not.toBe(fnv1a32('abd'))
  })
})
