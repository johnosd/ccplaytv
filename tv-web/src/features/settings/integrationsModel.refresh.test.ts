import { expect, it } from 'vitest'
import type { TmdbStatusView } from '../../lib/metadata/types'
import { TMDB_ACTION_LABEL_KEY, tmdbActions } from './integrationsModel'

// Feature 077: a aba Integrações ganhou o Atualizar da chave TMDB (busca a chave enviada pelo portal).
it('Atualizar é sempre a última ação do cartão do TMDB, com ou sem chave, e reaproveita o texto "Atualizar"', () => {
  expect(tmdbActions(undefined)).toEqual(['configure', 'refresh'])
  expect(tmdbActions({ state: 'not_configured' })).toEqual(['configure', 'refresh'])
  expect(tmdbActions({ state: 'connected' } as TmdbStatusView)).toEqual(['test', 'edit', 'remove', 'refresh'])
  expect(TMDB_ACTION_LABEL_KEY.refresh).toBe('portal.refresh.label')
})