import { describe, expect, it } from 'vitest'
import { appNavReducer, initialAppNav, type AppNavAction, type AppNavState } from './appNav'
import type { SourceOut } from '../features/import/importApi'
import type { CategoryScreenSnapshot } from '../features/catalog/categoryScreenSnapshot'

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

// O redutor nunca olha dentro do snapshot — só o carrega de volta (feature 017).
const MOVIES_SNAPSHOT = { marker: 'snapshot-filmes' } as unknown as CategoryScreenSnapshot

describe('appNav — contrato da feature 023', () => {
  it('RETURN em camadas: detalhe → categoria (com snapshot) → Início (com o foco de origem) → Início é base (US2/AC3-AC5, FR-028, FR-029, FR-030)', () => {
    const a = makeSource('a')
    let state = run(initialAppNav(), { type: 'splash-finished' })
    expect(state.screen).toEqual({ name: 'profiles', mode: 'base' })
    expect(state.history).toEqual([])

    state = run(state, { type: 'choose-source', source: a })
    expect(state.screen.name).toBe('home')
    expect(state.history).toEqual([])
    expect(state.activeSource?.id).toBe('a')

    // Atalho "TV ao vivo" → RETURN volta ao Início com o foco no atalho.
    state = run(state, {
      type: 'open',
      screen: { name: 'live' },
      from: { name: 'home', focus: { zone: 'shortcuts', destination: 'live' } },
    })
    expect(state.screen).toEqual({ name: 'live' })
    state = run(state, { type: 'back' })
    expect(state.screen).toEqual({ name: 'home', focus: { zone: 'shortcuts', destination: 'live' } })
    expect(state.history).toEqual([])

    // Topbar "Filmes" → detalhe → RETURN restaura o snapshot → RETURN volta ao item da topbar.
    state = run(
      state,
      { type: 'open', screen: { name: 'movies' }, from: { name: 'home', focus: { zone: 'topbar', item: 'movies' } } },
      { type: 'open', screen: { name: 'movie-detail', movieId: 'm1' }, from: { name: 'movies', restore: MOVIES_SNAPSHOT } },
    )
    state = run(state, { type: 'back' })
    expect(state.screen).toEqual({ name: 'movies', restore: MOVIES_SNAPSHOT })
    state = run(state, { type: 'back' })
    expect(state.screen).toEqual({ name: 'home', focus: { zone: 'topbar', item: 'movies' } })

    // Início é a base: RETURN aqui não navega (a tela abre o modal de saída).
    const atBase = run(state, { type: 'back' })
    expect(atBase.screen.name).toBe('home')
    expect(atBase.history).toEqual([])
    expect(atBase.activeSource?.id).toBe('a')
  })

  it('trocar de lista zera a pilha, e remover a lista ativa faz dos perfis a base (US2/AC6-AC7, FR-031, FR-032, edge case)', () => {
    const a = makeSource('a')
    const b = makeSource('b')
    let state = run(initialAppNav(), { type: 'splash-finished' }, { type: 'choose-source', source: a })

    // Indicador da topbar → perfis em modo troca, foco na lista ativa; RETURN volta ao Início sem trocar nada.
    state = run(state, { type: 'open-profiles', from: { name: 'home', focus: { zone: 'topbar', item: 'profile' } } })
    expect(state.screen).toEqual({ name: 'profiles', mode: 'switch', focusSourceId: 'a' })
    state = run(state, { type: 'back' })
    expect(state.screen).toEqual({ name: 'home', focus: { zone: 'topbar', item: 'profile' } })
    expect(state.activeSource?.id).toBe('a')

    // Remover uma lista que não é a ativa não mexe na sessão.
    state = run(state, { type: 'open-profiles' }, { type: 'source-removed', sourceId: 'c' })
    expect(state.screen).toMatchObject({ name: 'profiles', mode: 'switch' })
    expect(state.activeSource?.id).toBe('a')
    expect(state.history).toHaveLength(1)

    // Escolher outra lista: Início da nova, pilha zerada.
    state = run(state, { type: 'choose-source', source: b })
    expect(state.screen.name).toBe('home')
    expect(state.history).toEqual([])
    expect(state.activeSource?.id).toBe('b')

    // Remover a lista ativa com os perfis abertos pela topbar: perfis vira base, sem fonte ativa.
    state = run(state, { type: 'open-profiles' }, { type: 'source-removed', sourceId: 'b' })
    expect(state.screen).toMatchObject({ name: 'profiles', mode: 'base' })
    expect(state.history).toEqual([])
    expect(state.activeSource).toBeNull()
    const atBase = run(state, { type: 'back' })
    expect(atBase.screen).toMatchObject({ name: 'profiles', mode: 'base' })
    expect(atBase.history).toEqual([])
  })
})
