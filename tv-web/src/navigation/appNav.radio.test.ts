import { describe, expect, it } from 'vitest'
import { appNavReducer, initialAppNav, type AppNavAction, type AppNavState } from './appNav'
import type { SourceOut } from '../features/import/importApi'

// Feature 074: a Rádio é um destino de topo como os outros — abrir do Início empilha, RETURN volta ao Início com o
// foco no item "Rádio" da topbar; trocar a partir de Filmes não empilha.

const source = { id: 'a', display_name: 'Sala' } as SourceOut

function run(state: AppNavState, ...actions: AppNavAction[]): AppNavState {
  return actions.reduce(appNavReducer, state)
}

describe('appNav — Rádio (feature 074)', () => {
  it('abrir do Início e voltar restaura o foco no item Rádio', () => {
    let state = run(initialAppNav(), { type: 'choose-source', source })
    state = run(state, { type: 'open', screen: { name: 'radio' }, from: { name: 'home', focus: { zone: 'topbar', item: 'radio' } } })
    expect(state.screen).toEqual({ name: 'radio' })
    state = run(state, { type: 'back' })
    expect(state.screen).toEqual({ name: 'home', focus: { zone: 'topbar', item: 'radio' } })
  })

  it('trocar de Filmes para a Rádio não empilha: RETURN volta ao Início', () => {
    let state = run(initialAppNav(), { type: 'choose-source', source }, { type: 'open', screen: { name: 'movies' } })
    state = run(state, { type: 'switch-top', screen: { name: 'radio' } })
    expect(state.screen).toEqual({ name: 'radio' })
    expect(state.history).toHaveLength(1)
    expect(run(state, { type: 'back' }).screen).toEqual({ name: 'home' })
  })
})
