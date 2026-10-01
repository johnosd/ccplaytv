import { describe, expect, it } from 'vitest'
import { comparableTitle, normalizeTitle, pickCandidate, yearHintFromTitle, yearOfDate } from './tmdbMatch'

describe('normalizeTitle', () => {
  it.each([
    ['Duna (2021) [LEG]', 'Duna'],
    ['Filme 4K - 2019', 'Filme'],
    ['Matrix FHD [H265]', 'Matrix'],
    ['  O   Senhor dos Anéis  HD ', 'O Senhor dos Anéis'],
    ['Amélie', 'Amélie'],
    ['Space Jam: Um Novo Legado DUAL', 'Space Jam: Um Novo Legado'],
    ['HD', ''],
  ])('%s → %s', (raw, expected) => {
    expect(normalizeTitle(raw)).toBe(expected)
  })

  it('não confunde parte do título com etiqueta: "DVD"/"HDTV" ficam', () => {
    expect(normalizeTitle('Casablanca HDTV')).toBe('Casablanca HDTV')
  })
})

describe('comparableTitle', () => {
  it('ignora acento, caixa e pontuação', () => {
    expect(comparableTitle('Spider-Man: No Way Home [4K]')).toBe('spider man no way home')
    expect(comparableTitle('AMÉLIE')).toBe(comparableTitle('amelie'))
  })
})

describe('yearHintFromTitle', () => {
  it('lê "(AAAA)" e " - AAAA" final; ignora o resto', () => {
    expect(yearHintFromTitle('Duna (2021) [LEG]')).toBe(2021)
    expect(yearHintFromTitle('Filme - 2019')).toBe(2019)
    expect(yearHintFromTitle('2012')).toBeUndefined() // o filme "2012" não é um ano
    expect(yearHintFromTitle('Blade Runner 2049')).toBeUndefined()
    expect(yearHintFromTitle('Duna (3021)')).toBeUndefined()
    expect(yearHintFromTitle('Sem ano')).toBeUndefined()
  })
})

describe('yearOfDate', () => {
  it('só datas que começam por ano de 4 dígitos', () => {
    expect(yearOfDate('1999-03-31')).toBe(1999)
    expect(yearOfDate('')).toBeUndefined()
    expect(yearOfDate(undefined)).toBeUndefined()
    expect(yearOfDate('não é data')).toBeUndefined()
  })
})

describe('pickCandidate (D-004: só o candidato único)', () => {
  const dune2021 = { id: 1, title: 'Duna', release_date: '2021-09-15' }
  const dune1984 = { id: 2, title: 'Duna', release_date: '1984-12-14' }

  it('um único plausível → o id; o filme de outro ano não conta', () => {
    expect(pickCandidate([dune2021, dune1984], 'Duna', 2021)).toBe(1)
  })

  it('aceita ano ±1 e casa pelo título original', () => {
    expect(pickCandidate([{ id: 7, title: 'Dune', original_title: 'Duna', release_date: '2022-01-01' }], 'Duna', 2021)).toBe(7)
    expect(pickCandidate([{ id: 8, title: 'Duna', release_date: '2023-01-01' }], 'Duna', 2021)).toBeUndefined()
  })

  it('dois plausíveis → nenhum; zero → nenhum', () => {
    expect(pickCandidate([dune2021, { id: 3, title: 'Duna', release_date: '2022-05-01' }], 'Duna', 2021)).toBeUndefined()
    expect(pickCandidate([], 'Duna', 2021)).toBeUndefined()
  })

  it('candidato sem data ou sem id numérico não conta; série usa name/first_air_date', () => {
    expect(pickCandidate([{ id: 4, title: 'Duna' }], 'Duna', 2021)).toBeUndefined()
    expect(pickCandidate([{ id: 'x', title: 'Duna', release_date: '2021-01-01' }], 'Duna', 2021)).toBeUndefined()
    expect(pickCandidate([{ id: 5, name: 'Frieren', first_air_date: '2023-09-29' }], 'Frieren', 2023)).toBe(5)
  })

  it('título diferente não casa, mesmo com o ano certo; consulta vazia nunca casa', () => {
    expect(pickCandidate([{ id: 6, title: 'Outro Filme', release_date: '2021-01-01' }], 'Duna', 2021)).toBeUndefined()
    expect(pickCandidate([dune2021], '[LEG]', 2021)).toBeUndefined()
  })
})
