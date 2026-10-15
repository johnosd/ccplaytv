/**
 * Teste de CONTRATO da feature 055 (nota, gênero e fundo vindos da listagem Xtream).
 * Travado em `sdd/specs/055-campos-da-listagem-xtream/contract-tests.lock`. O sdd-execute só pode fazê-lo
 * passar, nunca editá-lo.
 *
 * Regras: `sdd/specs/055-campos-da-listagem-xtream/logic/campos-da-listagem.md`.
 */
import { describe, expect, it } from 'vitest'
import { mapSeriesEntry, mapVodEntry } from './xtreamConnector'
import { itemsSignature } from './categoryBlocks'
import type { CatalogRecord } from './db'

const categories = new Map([['10', { id: '10', name: 'Ação', order: 0 }]])
const buildUrl = () => undefined

describe('campos da listagem — contrato da feature 055', () => {
  // FR-001, FR-003, US1/AC3, Constitution: "IA e Classificação Nunca Inventam Dados"
  it('filme: nota válida vira número 0–10 com uma casa; ausente, vazia, 0, texto, vírgula, negativa ou acima de 10 viram ausência', () => {
    const rate = (rating: unknown) =>
      mapVodEntry({ name: 'Filme', stream_id: 1, category_id: '10', rating }, categories, buildUrl)?.providerRating

    expect(rate('9.2')).toBe(9.2)
    expect(rate(7.4)).toBe(7.4)
    expect(rate(7)).toBe(7)
    expect(rate(10)).toBe(10)
    expect(rate('6.04')).toBe(6)

    for (const invalid of [undefined, null, '', '0', 0, '0.0', 'N/A', '7,4', -1, '-3', '11', 10.01, true, {}]) {
      expect(rate(invalid), `rating ${JSON.stringify(invalid)} deveria ser "sem nota"`).toBeUndefined()
    }

    // Sem o campo, o item é idêntico ao de antes da feature: nem a chave existe (FR-011).
    const without = mapVodEntry({ name: 'Filme', stream_id: 2, category_id: '10' }, categories, buildUrl)
    expect(without).toBeDefined()
    expect('providerRating' in (without ?? {})).toBe(false)
  })

  // FR-002, FR-010, US2/AC1-AC2
  it('série: guarda nota, gênero e a primeira URL de fundo válida (lista ou texto); filme não ganha gênero nem fundo', () => {
    const fromList = mapSeriesEntry(
      {
        name: 'Série A',
        series_id: 9,
        category_id: '10',
        rating: '8',
        genre: '  Comédia, Drama ',
        backdrop_path: ['isso não é url', 'https://img.exemplo.test/a.jpg', 'https://img.exemplo.test/b.jpg'],
      },
      categories,
    )
    expect(fromList?.providerRating).toBe(8)
    expect(fromList?.providerGenres).toBe('Comédia, Drama')
    expect(fromList?.providerBackdropUrl).toBe('https://img.exemplo.test/a.jpg')

    const fromText = mapSeriesEntry(
      { name: 'Série B', series_id: 10, category_id: '10', backdrop_path: 'https://img.exemplo.test/c.jpg' },
      categories,
    )
    expect(fromText?.providerBackdropUrl).toBe('https://img.exemplo.test/c.jpg')

    const empty = mapSeriesEntry(
      { name: 'Série C', series_id: 11, category_id: '10', rating: '0', genre: '   ', backdrop_path: [] },
      categories,
    )
    expect(empty?.providerRating).toBeUndefined()
    expect(empty?.providerGenres).toBeUndefined()
    expect(empty?.providerBackdropUrl).toBeUndefined()

    // Gênero e fundo da listagem são só de série (spec: Fora de Escopo para filme).
    const movie = mapVodEntry(
      { name: 'Filme', stream_id: 3, category_id: '10', genre: 'Ação', backdrop_path: ['https://img.exemplo.test/d.jpg'] },
      categories,
      buildUrl,
    )
    expect(movie?.providerGenres).toBeUndefined()
    expect(movie?.providerBackdropUrl).toBeUndefined()
  })

  // FR-011, FR-012, US3/AC1-AC2
  it('assinatura do bloco: item sem os campos gera a mesma de antes (lista antiga não regrava); nota, gênero ou fundo novos a mudam', () => {
    const base: CatalogRecord = {
      sourceId: 's',
      generation: 1,
      kind: 'series',
      name: 'Série',
      originalName: 'Série',
      groupOrder: 0,
      seriesId: '9',
      year: 2020,
    }
    const before = itemsSignature([base])

    expect(itemsSignature([{ ...base, providerRating: undefined, providerGenres: undefined, providerBackdropUrl: undefined }])).toBe(before)

    expect(itemsSignature([{ ...base, providerRating: 7.4 }])).not.toBe(before)
    expect(itemsSignature([{ ...base, providerGenres: 'Drama' }])).not.toBe(before)
    expect(itemsSignature([{ ...base, providerBackdropUrl: 'https://img.exemplo.test/a.jpg' }])).not.toBe(before)
    expect(itemsSignature([{ ...base, providerRating: 7.4 }])).not.toBe(itemsSignature([{ ...base, providerRating: 7.5 }]))
  })
})
