import { describe, expect, it } from 'vitest'
import { appNavReducer, initialAppNav, type AppNavAction, type AppNavState } from './appNav'
import type { SourceOut } from '../features/import/importApi'

const source = { id: 'a', type: 'm3u_url', display_name: 'A', connection_state: 'synced', last_successful_sync_at: null,
  provider_import_mode: null, limited_reason: null, provider_dns: null, last_truncated_by_storage: false,
  last_discarded_by_type: 0 } as unknown as SourceOut
const run = (state: AppNavState, ...actions: AppNavAction[]) => actions.reduce(appNavReducer, state)

describe('appNav — contrato da feature 070', () => {
  // US4/AC1-AC2, FR-018, FR-019 — Constitution: RETURN fecha camadas antes de sair; Voltar restaura foco por id
  it('RETURN no Início sai da lista para a tela de listas como base, com foco na lista que estava aberta; lá a pilha acaba', () => {
    let state = run(initialAppNav(), { type: 'splash-finished' }, { type: 'choose-source', source })
    state = run(state, { type: 'open', screen: { name: 'live' }, from: { name: 'home' } }, { type: 'back' })
    expect(state.screen.name).toBe('home')

    state = run(state, { type: 'leave-list' })
    expect(state.screen).toEqual({ name: 'profiles', mode: 'base', focusSourceId: 'a' })
    expect(state.history).toEqual([])
    expect(state.activeSource).toBeNull()

    const atBase = run(state, { type: 'back' })
    expect(atBase.screen).toEqual({ name: 'profiles', mode: 'base', focusSourceId: 'a' })
    expect(atBase.history).toEqual([])
  })
})
