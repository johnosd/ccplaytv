/**
 * Teste de CONTRATO da feature 084 (ordenar "Todos" sem travar) — travado em
 * `sdd/specs/084-indice-busca-sem-travar/contract-tests.lock`. O sdd-execute só pode fazê-lo passar, nunca editá-lo.
 */
import { expect, it } from 'vitest'
import type { CatalogItemOut } from '../catalog/catalogApi'
import { sortVodItems, sortVodItemsInSlices, type VodSortOption } from './vodSort'

function item(index: number, name: string, extra: Partial<CatalogItemOut> = {}): CatalogItemOut {
  return {
    id: String(index), kind: 'movie', name, original_group: 'G', published: true, playable: true, source_id: 'f',
    provider_stream_id: String(index), original_name: name, series_id: null, icon_url: null, category_id: 1,
    category_position: index, source_number: null, year: null, added_at: null, provider_rating: null,
    provider_genres: null, provider_backdrop_url: null, epg_channel_id: null, archive_days: null, ...extra,
  }
}

// Nomes com acento, caixa, pontuação, números e empates (base) — onde uma ordem "parecida" diverge da do app.
const NAMES = ['Ação', 'acao', 'Água', 'agua 2', 'Zé', '#1 Filme', '007', '10 Coisas', '2 Filhos', 'Éden', 'eden', 'Ômega',
  'O Poço', 'o poço', 'A Vida', 'À Deriva', 'Batman: O Retorno', 'Batman - O Retorno', 'Über', 'uber']

// FR-005 + SC-004 (US2/AC1-AC2): todas as opções saem exatamente na ordem de hoje, cedendo a vez entre fatias.
it('FR-005: em fatias, cada ordenação dá exatamente a ordem de sortVodItems (empates na ordem da fonte)', async () => {
  const items = Array.from({ length: 6_000 }, (_, index) => item(index, NAMES[index % NAMES.length], {
    year: index % 7 === 0 ? null : 1990 + (index % 30),
    added_at: index % 5 === 0 ? null : 1_700_000_000 + ((index * 7919) % 100_000),
    provider_rating: index % 3 === 0 ? null : (index % 10) + 0.5,
  }))
  const options: VodSortOption[] = ['az', 'year', 'added', 'rating']
  for (const option of options) {
    let yields = 0
    const sliced = await sortVodItemsInSlices(items, option, { yieldToMain: async () => { yields += 1 } })
    expect(sliced.map((entry) => entry.id), option).toEqual(sortVodItems(items, option).map((entry) => entry.id))
    expect(yields, option).toBeGreaterThan(0)
  }
  expect(items[0].id).toBe('0') // nunca muta a entrada
})
