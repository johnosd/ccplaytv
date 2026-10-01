import { describe, expect, it } from 'vitest'
import { appNavReducer, initialAppNav, type AppNavAction, type AppNavState, type AppScreen } from './appNav'
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
        from: { name: 'home', focus: { zone: 'rail', rail: 'continue', itemId: 'serie-7' } },
      },
    )
    expect(state.history).toEqual([{ name: 'home', focus: { zone: 'rail', rail: 'continue', itemId: 'serie-7' } }])
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

  // Feature 030 (US2, FR-022): RETURN na tela de EPG volta às Configurações com o foco no botão "EPG".
  it('abrir o EPG de uma lista e voltar restaura Configurações com o foco no botão "EPG" daquela lista', () => {
    const settings = { name: 'settings' as const, restore: { zone: 'sources' as const, sourceId: 'a', action: 'epg' as const } }
    const state = run(
      initialAppNav(),
      { type: 'splash-finished' },
      { type: 'choose-source', source: A },
      { type: 'open', screen: { name: 'settings' } },
      { type: 'open', screen: { name: 'epg-settings', source: A }, from: settings },
    )
    expect(state.screen).toEqual({ name: 'epg-settings', source: A })

    const back = appNavReducer(state, { type: 'back' })
    expect(back.screen).toEqual(settings)
  })

  // Feature 032 (US2): a tela da chave TMDB volta ao card do TMDB; do dock da Home, RETURN volta ao ícone do dock.
  it('abrir a chave do TMDB e voltar restaura Configurações no card do TMDB', () => {
    const settings = { name: 'settings' as const, restore: { zone: 'panel' as const, tab: 'integrations' as const } }
    const state = run(
      initialAppNav(),
      { type: 'splash-finished' },
      { type: 'choose-source', source: A },
      { type: 'open', screen: { name: 'settings' } },
      { type: 'open', screen: { name: 'tmdb-key' }, from: settings },
    )
    expect(state.screen).toEqual({ name: 'tmdb-key' })
    expect(appNavReducer(state, { type: 'back' }).screen).toEqual(settings)
  })

  it('Integrações aberta pelo dock do Início: RETURN devolve o Início com o foco no ícone do dock', () => {
    const atHome = run(initialAppNav(), { type: 'splash-finished' }, { type: 'choose-source', source: A })
    const state = appNavReducer(atHome, {
      type: 'open',
      screen: { name: 'settings', restore: { zone: 'panel', tab: 'integrations' } },
      from: { name: 'home', focus: { zone: 'dock', service: 'dock-tmdb' } },
    })
    expect(state.screen).toEqual({ name: 'settings', restore: { zone: 'panel', tab: 'integrations' } })
    expect(appNavReducer(state, { type: 'back' }).screen).toEqual({ name: 'home', focus: { zone: 'dock', service: 'dock-tmdb' } })
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

  // Feature 024, T026: a topbar da Live troca de destino de topo (Filmes)
  // sem empilhar, e RETURN de lá volta direto ao Início — nunca pra Live.
  it('"Filmes" na topbar da Live abre Filmes via switch-top, e RETURN volta ao Início (não à Live)', () => {
    const homeFocus = { name: 'home', focus: { zone: 'topbar', item: 'live' } } as const
    let state = run(
      initialAppNav(),
      { type: 'splash-finished' },
      { type: 'choose-source', source: A },
      { type: 'open', screen: { name: 'live' }, from: homeFocus },
    )
    expect(state.screen).toEqual({ name: 'live' })
    expect(state.history).toEqual([homeFocus])

    state = run(state, { type: 'switch-top', screen: { name: 'movies' } })
    expect(state.screen).toEqual({ name: 'movies' })
    expect(state.history).toEqual([homeFocus]) // não empilhou a Live

    state = run(state, { type: 'back' })
    expect(state.screen).toEqual(homeFocus)
    expect(state.history).toEqual([])
  })

  // Feature 024: o indicador da lista ativa na topbar da Live abre os
  // perfis (mesmo caminho da topbar do Início), e RETURN volta à Live.
  it('open-profiles a partir da topbar da Live empilha a Live, e RETURN volta a ela', () => {
    const liveFocus = { name: 'home', focus: { zone: 'shortcuts', destination: 'live' } } as const
    let state = run(
      initialAppNav(),
      { type: 'splash-finished' },
      { type: 'choose-source', source: A },
      { type: 'open', screen: { name: 'live' }, from: liveFocus },
      { type: 'open-profiles', from: { name: 'live' } },
    )
    expect(state.screen).toEqual({ name: 'profiles', mode: 'switch', focusSourceId: 'a' })
    expect(state.history).toEqual([liveFocus, { name: 'live' }])

    state = run(state, { type: 'back' })
    expect(state.screen).toEqual({ name: 'live' })
    expect(state.activeSource?.id).toBe('a')
  })
})

describe('appNavReducer — pilha de detalhes (feature 035)', () => {
  const detailA: AppScreen = { name: 'movie-detail', movieId: 'a' }

  it('detalhe → detalhe → back devolve o restore certo, e A → B → A mantém dois snapshots', () => {
    const fromA: AppScreen = { ...detailA, restore: { tab: 'similar', focusKey: 'tmdb:movie:2' } }
    const inB = run(
      { screen: detailA, history: [{ name: 'home' }], activeSource: A },
      { type: 'open', screen: { name: 'movie-detail', movieId: 'b' }, from: fromA },
    )
    expect(inB.screen).toEqual({ name: 'movie-detail', movieId: 'b' })

    const fromB: AppScreen = { name: 'movie-detail', movieId: 'b', restore: { tab: 'similar', focusKey: 'tmdb:movie:1' } }
    const backInA = run(inB, { type: 'open', screen: { name: 'movie-detail', movieId: 'a' }, from: fromB })
    expect(backInA.history.slice(-2)).toEqual([fromA, fromB])

    const afterBack = run(backInA, { type: 'back' })
    expect(afterBack.screen).toEqual(fromB)
    expect(run(afterBack, { type: 'back' }).screen).toEqual(fromA)
  })

  it('detalhe → ator → detalhe → back ×2 restaura a pessoa e depois a aba Elenco com a pessoa focada', () => {
    const fromDetail: AppScreen = { name: 'movie-detail', movieId: 'a', restore: { tab: 'cast', focusKey: 'person:6384' } }
    const person: AppScreen = { name: 'person', personId: 6384, personName: 'Keanu' }
    const fromPerson: AppScreen = { ...person, restore: { focusKey: 'tmdb:movie:2' } }

    const inPerson = run({ screen: { name: 'movie-detail', movieId: 'a' }, history: [], activeSource: A }, { type: 'open', screen: person, from: fromDetail })
    const inOther = run(inPerson, { type: 'open', screen: { name: 'movie-detail', movieId: 'b' }, from: fromPerson })
    expect(run(inOther, { type: 'back' }).screen).toEqual(fromPerson)
    expect(run(inOther, { type: 'back' }, { type: 'back' }).screen).toEqual(fromDetail)
  })

  it('Configurar TMDB abre Configurações e o RETURN volta ao detalhe com aba e item', () => {
    const from: AppScreen = { name: 'series-detail', seriesId: 's', restore: { tab: 'similar' } }
    const state = run(
      { screen: { name: 'series-detail', seriesId: 's' }, history: [], activeSource: A },
      { type: 'open', screen: { name: 'settings', restore: { zone: 'panel', tab: 'integrations' } }, from },
      { type: 'back' },
    )
    expect(state.screen).toEqual(from)
  })
})

describe('appNavReducer — extensões da feature 026 (Home definitiva, Busca global, Configurações)', () => {
  it('abre a Busca a partir da Live, empilhando a Live com `topbarFocus` (nunca `initialChannel`, senão voltar tocaria o canal de novo)', () => {
    let state = run(
      initialAppNav(),
      { type: 'splash-finished' },
      { type: 'choose-source', source: A },
      { type: 'open', screen: { name: 'live' }, from: { name: 'home' } },
    )
    state = run(state, {
      type: 'open',
      screen: { name: 'search' },
      from: { name: 'live', topbarFocus: 'search' },
    })
    expect(state.screen).toEqual({ name: 'search' })
    expect(state.history).toEqual([{ name: 'home' }, { name: 'live', topbarFocus: 'search' }])
  })

  it('switch-top troca entre Busca e Configurações sem empilhar', () => {
    let state = run(
      initialAppNav(),
      { type: 'splash-finished' },
      { type: 'choose-source', source: A },
      { type: 'open', screen: { name: 'search' }, from: { name: 'home' } },
    )
    expect(state.history).toEqual([{ name: 'home' }])

    state = run(state, { type: 'switch-top', screen: { name: 'settings' } })
    expect(state.screen).toEqual({ name: 'settings' })
    expect(state.history).toEqual([{ name: 'home' }]) // não empilhou a Busca

    state = run(state, { type: 'switch-top', screen: { name: 'search' } })
    expect(state.screen).toEqual({ name: 'search' })
    expect(state.history).toEqual([{ name: 'home' }])
  })

  it('go-home com um Início na pilha: descarta tudo acima dele e preserva o `focus` que ele guardou', () => {
    const homeFocus = { name: 'home', focus: { zone: 'topbar', item: 'live' } } as const
    let state = run(
      initialAppNav(),
      { type: 'splash-finished' },
      { type: 'choose-source', source: A },
      { type: 'open', screen: { name: 'live' }, from: homeFocus },
      { type: 'open', screen: { name: 'search' }, from: { name: 'live', topbarFocus: 'search' } },
    )
    expect(state.history).toEqual([homeFocus, { name: 'live', topbarFocus: 'search' }])

    state = run(state, { type: 'go-home' })
    expect(state.screen).toEqual(homeFocus)
    expect(state.history).toEqual([])
    expect(state.activeSource?.id).toBe('a')
  })

  it('go-home sem nenhum Início na pilha troca a tela atual por Início com a pilha zerada', () => {
    const state = run(initialAppNav(), { type: 'splash-finished' }, { type: 'choose-source', source: A })
    expect(state.screen.name).toBe('home')
    expect(state.history).toEqual([])

    const after = run(state, { type: 'go-home' })
    expect(after.screen).toEqual({ name: 'home' })
    expect(after.history).toEqual([])
    expect(after.activeSource?.id).toBe('a')
  })

  it('Configurações `standalone` (atalho "Gerenciar listas" dos perfis) abre sem lista ativa, e RETURN volta aos perfis', () => {
    const state = run(
      initialAppNav(),
      { type: 'splash-finished' },
      {
        type: 'open',
        screen: { name: 'settings', standalone: true },
        from: { name: 'profiles', mode: 'base' },
      },
    )
    expect(state.screen).toEqual({ name: 'settings', standalone: true })
    expect(state.history).toEqual([{ name: 'profiles', mode: 'base' }])
    expect(state.activeSource).toBeNull()

    const after = run(state, { type: 'back' })
    expect(after.screen).toEqual({ name: 'profiles', mode: 'base' })
    expect(after.history).toEqual([])
  })

  it('source-removed com Configurações aberta pela topbar: se era a lista ativa, os perfis viram a base direto (igual a qualquer outra tela)', () => {
    const state = run(
      initialAppNav(),
      { type: 'splash-finished' },
      { type: 'choose-source', source: A },
      {
        type: 'open',
        screen: { name: 'settings' },
        from: { name: 'home', focus: { zone: 'topbar', item: 'settings' } },
      },
    )

    const after = run(state, { type: 'source-removed', sourceId: 'a' })
    expect(after.screen).toMatchObject({ name: 'profiles', mode: 'base' })
    expect(after.history).toEqual([])
    expect(after.activeSource).toBeNull()
  })
})
