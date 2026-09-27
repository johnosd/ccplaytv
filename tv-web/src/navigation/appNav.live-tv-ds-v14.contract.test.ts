/**
 * Teste de CONTRATO da feature 024 — travado em
 * `sdd/specs/024-live-tv-ds-v14/contract-tests.lock`. O sdd-execute só pode
 * fazê-lo passar, nunca editá-lo.
 */
import { describe, expect, it } from 'vitest'
import { appNavReducer, initialAppNav, type AppNavAction, type AppNavState } from './appNav'
import type { SourceOut } from '../features/import/importApi'

function makeSource(id: string): SourceOut {
  return {
    id,
    type: 'm3u_url',
    display_name: `Lista ${id}`,
    connection_state: 'synced',
    last_successful_sync_at: null,
    provider_import_mode: null,
    limited_reason: null,
    provider_dns: null,
    last_truncated_by_storage: false,
    last_discarded_by_type: 0,
  }
}

function run(state: AppNavState, ...actions: AppNavAction[]): AppNavState {
  return actions.reduce(appNavReducer, state)
}

describe('appNav — contrato da feature 024', () => {
  // FR-001, FR-003, D-004: trocar de destino pela topbar da Live não empilha a Live.
  it('topbar da Live troca de destino de topo sem empilhar, e RETURN volta sempre ao Início', () => {
    const homeFocus = { name: 'home', focus: { zone: 'topbar', item: 'live' } } as const
    let state = run(
      initialAppNav(),
      { type: 'splash-finished' },
      { type: 'choose-source', source: makeSource('a') },
      { type: 'open', screen: { name: 'live' }, from: homeFocus },
    )
    expect(state.history).toEqual([homeFocus])

    // Live → (topbar) Filmes → (topbar de Filmes, quando existir) Live: a pilha nunca cresce.
    state = run(state, { type: 'switch-top', screen: { name: 'movies' } })
    expect(state.screen).toEqual({ name: 'movies' })
    expect(state.history).toEqual([homeFocus])

    state = run(state, { type: 'switch-top', screen: { name: 'live' } })
    expect(state.screen).toEqual({ name: 'live' })
    expect(state.history).toEqual([homeFocus])

    // RETURN na raiz do destino de topo: Início, com o foco de origem.
    state = run(state, { type: 'back' })
    expect(state.screen).toEqual(homeFocus)
    expect(state.history).toEqual([])
    expect(state.activeSource?.id).toBe('a')
  })
})
