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

const A = makeSource('a')
const B = makeSource('b')

describe('appNavReducer — regras além dos contratos (feature 023)', () => {
  it('começa no Splash, sem pilha e sem fonte ativa; o Splash nunca entra na pilha', () => {
    const start = initialAppNav()
    expect(start).toEqual({ screen: { name: 'splash' }, history: [], activeSource: null })
    const afterSplash = run(start, { type: 'splash-finished' })
    expect(afterSplash.history).toEqual([])
    expect(afterSplash.screen).toEqual({ name: 'profiles', mode: 'base' })
  })

  it('open sem `from` empilha a tela atual', () => {
    const state = run(initialAppNav(), { type: 'splash-finished' }, { type: 'open', screen: { name: 'add-source' } })
    expect(state.screen).toEqual({ name: 'add-source' })
    expect(state.history).toEqual([{ name: 'profiles', mode: 'base' }])
  })

  it('open com `from` empilha o `from`, não a tela atual (é assim que o Início guarda o foco)', () => {
    const state = run(
      initialAppNav(),
      { type: 'splash-finished' },
      { type: 'choose-source', source: A },
      {
        type: 'open',
        screen: { name: 'series' },
        from: { name: 'home', focus: { zone: 'continue', itemId: 'serie-7' } },
      },
    )
    expect(state.history).toEqual([{ name: 'home', focus: { zone: 'continue', itemId: 'serie-7' } }])
  })

  it('editar uma lista e salvar (back) volta aos perfis, sem perder a base (FR-040)', () => {
    const state = run(
      initialAppNav(),
      { type: 'splash-finished' },
      { type: 'open', screen: { name: 'edit-source', source: A } },
      { type: 'back' },
    )
    expect(state.screen).toEqual({ name: 'profiles', mode: 'base' })
    expect(state.history).toEqual([])
  })

  it('back numa tela base devolve o MESMO estado (a tela decide o que RETURN faz)', () => {
    const atHome = run(initialAppNav(), { type: 'splash-finished' }, { type: 'choose-source', source: A })
    expect(appNavReducer(atHome, { type: 'back' })).toBe(atHome)
    const atProfiles = run(initialAppNav(), { type: 'splash-finished' })
    expect(appNavReducer(atProfiles, { type: 'back' })).toBe(atProfiles)
  })

  it('concluir a importação (choose-source) zera a pilha: nunca se volta ao formulário já enviado (FR-038)', () => {
    const state = run(
      initialAppNav(),
      { type: 'splash-finished' },
      { type: 'open', screen: { name: 'add-source' } },
      { type: 'open', screen: { name: 'progress', jobId: 'job-1' } },
      { type: 'choose-source', source: B },
    )
    expect(state.screen).toEqual({ name: 'home' })
    expect(state.history).toEqual([])
    expect(state.activeSource?.id).toBe('b')
  })

  it('import-back abre os perfis como base com foco na lista importada, e zera a pilha e a fonte ativa (FR-039)', () => {
    const state = run(
      initialAppNav(),
      { type: 'splash-finished' },
      { type: 'open', screen: { name: 'add-source' } },
      { type: 'open', screen: { name: 'progress', jobId: 'job-1' } },
      { type: 'import-back', sourceId: 'novo' },
    )
    expect(state.screen).toEqual({ name: 'profiles', mode: 'base', focusSourceId: 'novo' })
    expect(state.history).toEqual([])
    expect(state.activeSource).toBeNull()
  })

  it('import-back sem lista criada (falha antes de gravar) não define foco', () => {
    const state = run(initialAppNav(), { type: 'splash-finished' }, { type: 'import-back' })
    expect(state.screen).toEqual({ name: 'profiles', mode: 'base', focusSourceId: null })
  })

  it('open-profiles sem fonte ativa não cria um modo "troca" sem destino: vira base', () => {
    const state = run(initialAppNav(), { type: 'splash-finished' }, { type: 'open-profiles' })
    expect(state.screen).toMatchObject({ name: 'profiles', mode: 'base' })
    expect(state.history).toEqual([])
  })

  it('source-removed de uma lista que não é a ativa devolve o mesmo estado', () => {
    const atHome = run(initialAppNav(), { type: 'splash-finished' }, { type: 'choose-source', source: A })
    expect(appNavReducer(atHome, { type: 'source-removed', sourceId: 'outra' })).toBe(atHome)
  })

  it('o snapshot de Filmes/Séries (feature 017) atravessa a pilha intacto, sem ser lido', () => {
    const snapshot = { marker: 'x' } as never
    const state = run(
      initialAppNav(),
      { type: 'splash-finished' },
      { type: 'choose-source', source: A },
      { type: 'open', screen: { name: 'movies' }, from: { name: 'home' } },
      { type: 'open', screen: { name: 'movie-detail', movieId: 'm' }, from: { name: 'movies', restore: snapshot } },
      { type: 'back' },
    )
    expect(state.screen).toEqual({ name: 'movies', restore: snapshot })
    expect((state.screen as { restore?: unknown }).restore).toBe(snapshot)
  })
})
