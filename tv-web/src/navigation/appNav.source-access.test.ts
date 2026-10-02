import { describe, expect, it } from 'vitest'
import { appNavReducer, initialAppNav, type AppNavAction, type AppNavState } from './appNav'
import type { SourceOut } from '../features/import/importApi'

function makeSource(id: string): SourceOut {
  return {
    id,
    type: 'provider_credentials',
    display_name: `Lista ${id}`,
    connection_state: 'synced',
    last_successful_sync_at: null,
    provider_import_mode: 'xtream_api',
    limited_reason: null,
    provider_dns: null,
    last_truncated_by_storage: false,
    last_discarded_by_type: 0,
  }
}

const run = (state: AppNavState, ...actions: AppNavAction[]): AppNavState => actions.reduce(appNavReducer, state)

const A = makeSource('a')
const B = makeSource('b')
const START = run(initialAppNav(), { type: 'splash-finished' })

/** O que o `App` faz ao escolher uma lista bloqueada (D-008: só `open`, nenhuma ação nova). */
const openGate = (state: AppNavState, source: SourceOut) =>
  run(state, {
    type: 'open',
    screen: { name: 'source-access', source },
    from: { name: 'profiles', mode: 'base', focusSourceId: source.id },
  })

describe('appNav — tela de acesso à lista (feature 034, D-008)', () => {
  it('empilha os perfis com o foco na lista; a lista ativa não muda enquanto o acesso não abrir', () => {
    const state = openGate(START, A)
    expect(state.screen).toEqual({ name: 'source-access', source: A })
    expect(state.history).toEqual([{ name: 'profiles', mode: 'base', focusSourceId: 'a' }])
    expect(state.activeSource).toBeNull()
  })

  it('RETURN volta aos perfis com o foco no cartão daquela lista (FR-013)', () => {
    const state = run(openGate(START, A), { type: 'back' })
    expect(state.screen).toEqual({ name: 'profiles', mode: 'base', focusSourceId: 'a' })
    expect(state.history).toEqual([])
  })

  it('"Editar lista" empilha a tela de acesso; voltar da edição retorna a ela', () => {
    const state = run(openGate(START, A), { type: 'open', screen: { name: 'edit-source', source: A } }, { type: 'back' })
    expect(state.screen).toEqual({ name: 'source-access', source: A })
    expect(state.history).toEqual([{ name: 'profiles', mode: 'base', focusSourceId: 'a' }])
  })

  it('conta válida (onOpen → choose-source) zera a pilha e abre o Início da lista', () => {
    const state = run(openGate(START, A), { type: 'choose-source', source: A })
    expect(state.screen).toEqual({ name: 'home' })
    expect(state.history).toEqual([])
    expect(state.activeSource).toBe(A)
  })

  it('excluir OUTRA lista com a tela empilhada não derruba o bloqueio; excluir a ativa cai nos perfis', () => {
    const afterOther = run(openGate(run(START, { type: 'choose-source', source: B }), A), { type: 'source-removed', sourceId: 'x' })
    expect(afterOther.screen.name).toBe('source-access')
    const afterActive = run(afterOther, { type: 'source-removed', sourceId: 'b' })
    expect(afterActive.screen).toEqual({ name: 'profiles', mode: 'base' })
    expect(afterActive.history).toEqual([])
  })

  it('import-back com a tela empilhada põe os perfis como base, sem sobrar a tela de acesso', () => {
    const state = run(openGate(START, A), { type: 'import-back', sourceId: 'a' })
    expect(state.screen.name).toBe('profiles')
    expect(state.history).toEqual([])
  })
})
