/**
 * Teste de CONTRATO da feature 025 (Filmes e Séries no DS V14) — captura de
 * ano e data de inclusão declarados pelo provedor. Travado em
 * `sdd/specs/025-filmes-series-ds-v14/contract-tests.lock`. O sdd-execute só
 * pode fazê-lo passar, nunca editá-lo.
 *
 * Regras: `sdd/specs/025-filmes-series-ds-v14/logic/metadados-vod.md`.
 */
import { describe, expect, it } from 'vitest'
import { mapSeriesEntry, mapVodEntry } from './xtreamConnector'

const categories = new Map([['10', { id: '10', name: 'Ação', order: 0 }]])
const buildUrl = () => undefined

describe('metadados de filme/série — contrato da feature 025', () => {
  // FR-049, FR-050, US4/AC4, Constitution: "IA e Classificação Nunca Inventam Dados"
  it('ano e inclusão vêm só de campo próprio da fonte; ilegível ou implausível vira ausência; título e last_modified nunca são usados', () => {
    const declared = mapVodEntry(
      { name: 'Filme A', stream_id: 1, category_id: '10', year: '2019', added: '1700000000' },
      categories,
      buildUrl,
    )
    expect(declared?.year).toBe(2019)
    expect(declared?.addedAt).toBe(1_700_000_000_000)

    const fromReleaseDate = mapVodEntry(
      { name: 'Filme B', stream_id: 2, category_id: '10', releaseDate: '2015-06-01' },
      categories,
      buildUrl,
    )
    expect(fromReleaseDate?.year).toBe(2015)
    expect(fromReleaseDate?.addedAt).toBeUndefined()

    const garbage = mapVodEntry(
      { name: 'Filme C (2012)', stream_id: 3, category_id: '10', year: 'N/A', added: 'ontem' },
      categories,
      buildUrl,
    )
    // "(2012)" no título nunca vira ano (FR-050).
    expect(garbage?.year).toBeUndefined()
    expect(garbage?.addedAt).toBeUndefined()

    const implausible = mapVodEntry(
      { name: 'Filme D', stream_id: 4, category_id: '10', year: '1700', added: '0' },
      categories,
      buildUrl,
    )
    expect(implausible?.year).toBeUndefined()
    expect(implausible?.addedAt).toBeUndefined()

    const series = mapSeriesEntry(
      { name: 'Série A', series_id: 9, category_id: '10', releaseDate: '2008-01-20', last_modified: '1700000000' },
      categories,
    )
    expect(series?.year).toBe(2008)
    // `last_modified` é atualização, nunca inclusão.
    expect(series?.addedAt).toBeUndefined()
  })
})
