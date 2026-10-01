import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { HomeContent, type HomeContentProps } from './HomeContent'
import { AnnouncerContext } from '../../lib/announcer'
import { db } from '../../lib/catalog/db'
import { writeEpgPrograms } from '../../lib/epg/epgRepository'
import { buildStableId, toggleFavorite, updateProgress } from '../../lib/catalog/userStateRepository'
import { findUnnamedControls } from '../../testing/accessibleNames'

/**
 * Testes de comportamento de `HomeContent` (feature 026, T020) — hero,
 * linhas navegáveis, restauração por id e mocks. O fluxo completo hero →
 * player → fechar → foco é o contrato travado
 * (`HomeScreen.home-busca-configuracoes-ds-v14.contract.test.tsx`); aqui só
 * o conteúdo em si, contra `fake-indexeddb` de verdade (mesmo padrão de
 * `catalogApi.test.tsx`).
 */

const SOURCE_ID = 'source-home-content'

// `Rail` (feature 022, D-008) só precisa da largura do contêiner — sem
// `ResizeObserver`, `itemWidth` é prop fixa (mesmo mock do contrato de `Rail`).
let restoreOffsetWidth: PropertyDescriptor | undefined
beforeAll(() => {
  restoreOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 1600 })
})
afterAll(() => {
  if (restoreOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', restoreOffsetWidth)
})

async function seedSource(): Promise<void> {
  await db.sources.put({
    id: SOURCE_ID,
    type: 'provider_credentials',
    displayName: 'Fonte',
    connectionState: 'synced',
    activeGeneration: 1,
    createdAt: 0,
    updatedAt: 0,
  })
}

async function seedMovie(name: string, streamId: string): Promise<number> {
  const [id] = await db.channels.bulkAdd(
    [{ sourceId: SOURCE_ID, generation: 1, kind: 'movie', name, originalName: name, groupOrder: 0, providerStreamId: streamId }],
    { allKeys: true },
  )
  return id as number
}

async function seedSeriesNoEpisodes(name: string, seriesId: string): Promise<number> {
  const [id] = await db.channels.bulkAdd(
    [{ sourceId: SOURCE_ID, generation: 1, kind: 'series', name, originalName: name, groupOrder: 0, seriesId }],
    { allKeys: true },
  )
  return id as number
}

async function seedChannel(name: string, streamId: string): Promise<number> {
  const [id] = await db.channels.bulkAdd(
    [{ sourceId: SOURCE_ID, generation: 1, kind: 'channel', name, originalName: name, groupOrder: 0, providerStreamId: streamId }],
    { allKeys: true },
  )
  return id as number
}

async function favoriteMovie(streamId: string, favoritedAt: number): Promise<void> {
  await toggleFavorite(buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: streamId }), SOURCE_ID, true, db)
  await db.userStates.update(buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: streamId }), { favoritedAt })
}

async function favoriteSeries(seriesId: string, favoritedAt: number): Promise<void> {
  await toggleFavorite(buildStableId({ sourceId: SOURCE_ID, kind: 'series', seriesId }), SOURCE_ID, true, db)
  await db.userStates.update(buildStableId({ sourceId: SOURCE_ID, kind: 'series', seriesId }), { favoritedAt })
}

async function favoriteChannel(streamId: string, favoritedAt: number): Promise<void> {
  await toggleFavorite(buildStableId({ sourceId: SOURCE_ID, kind: 'channel', providerStreamId: streamId }), SOURCE_ID, true, db)
  await db.userStates.update(buildStableId({ sourceId: SOURCE_ID, kind: 'channel', providerStreamId: streamId }), { favoritedAt })
}

function press(key: string) {
  fireEvent.keyDown(document.body, { key, bubbles: true })
}

/** Região de anúncio no formato de `AnnouncerRegion` (só o slot `.sr-only` importa a `useAnnounce`). */
function WithRegion({ children }: { children: ReactNode }) {
  const [region, setRegion] = useState<HTMLElement | null>(null)
  return (
    <AnnouncerContext.Provider value={region}>
      {children}
      <div ref={setRegion} className="announcer-region">
        <span className="sr-only" />
      </div>
    </AnnouncerContext.Provider>
  )
}

async function announced(): Promise<string> {
  await act(() => new Promise((resolve) => setTimeout(resolve, 30)))
  return document.querySelector('.sr-only')?.textContent ?? ''
}

function renderHome(overrides: Partial<HomeContentProps> = {}) {
  const props: HomeContentProps = {
    sourceId: SOURCE_ID,
    onBack: vi.fn(),
    onNavigate: vi.fn(),
    onOpenItem: vi.fn(),
    onOpenChannel: vi.fn(),
    onOpenFavorites: vi.fn(),
    onPlay: vi.fn(),
    ...overrides,
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <WithRegion>{children}</WithRegion>
      </QueryClientProvider>
    )
  }
  const result = render(<HomeContent {...props} />, { wrapper: Wrapper })
  return { ...result, props, queryClient }
}

afterEach(async () => {
  cleanup()
  vi.clearAllMocks()
  await db.sources.delete(SOURCE_ID)
  await db.channels.where('sourceId').equals(SOURCE_ID).delete()
  await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
})

describe('HomeContent — hero de boas-vindas (US1/AC3, FR-008)', () => {
  it('sem progresso e sem favoritos: hero de boas-vindas com duas ações reais; rails reais não aparecem', async () => {
    await seedSource()
    const props = renderHome().props

    // As 3 rails próprias resolvem em paralelo com o hero — espera as duas
    // coisas ficarem estáveis (nenhum skeleton, que usa o MESMO título da
    // rail de verdade) antes de checar a ausência delas.
    await waitFor(() => {
      expect(screen.getByText('Bem-vindo(a) ao CCPlayTV')).toBeInTheDocument()
      expect(document.querySelectorAll('.home-row[aria-busy="true"]')).toHaveLength(0)
    })
    const live = screen.getByRole('button', { name: 'Abrir TV ao vivo' })
    const movies = screen.getByRole('button', { name: 'Abrir Filmes' })
    expect(live).toHaveClass('tv-focus')
    expect(movies).not.toHaveClass('tv-focus')

    expect(screen.queryByText('Continuar assistindo')).not.toBeInTheDocument()
    expect(screen.queryByText('Minha Lista')).not.toBeInTheDocument()
    expect(screen.queryByText('Canais favoritos')).not.toBeInTheDocument()
    // Mocks sempre presentes.
    expect(screen.getByText('Curadoria IA')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Serviços' })).toBeInTheDocument()

    // Feature 028, FR-001: barra nativa escondida, sem trocar overflow por hidden.
    expect(document.querySelector('.home-content')).toHaveClass('no-scrollbar')

    press('Enter')
    expect(props.onNavigate).toHaveBeenCalledWith('live', { zone: 'shortcuts', destination: 'live' })

    press('ArrowRight')
    expect(movies).toHaveClass('tv-focus')
    press('Enter')
    expect(props.onNavigate).toHaveBeenCalledWith('movies', { zone: 'shortcuts', destination: 'movies' })
  })

  // Feature 028, FR-015/FR-017.
  it('todo controle tem nome acessível: sem conteúdo (boas-vindas)', async () => {
    const { container } = renderHome()
    await waitFor(() => {
      expect(screen.getByText('Bem-vindo(a) ao CCPlayTV')).toBeInTheDocument()
      expect(document.querySelectorAll('.home-row[aria-busy="true"]')).toHaveLength(0)
    })
    expect(findUnnamedControls(container).map((f) => f.description)).toEqual([])
  })
})

describe('HomeContent — hero de série sem episódio (FR-006)', () => {
  it('série favorita sem episódio conhecido: ação primária abre o detalhe em vez de reproduzir', async () => {
    await seedSource()
    await seedSeriesNoEpisodes('Série Sem Episódios', 's1')
    await favoriteSeries('s1', 100)
    const props = renderHome().props

    // Espera o botão "Assistir" em si (nunca aparece no hero de boas-vindas
    // nem enquanto o hero ainda não resolveu) — distingue do card homônimo
    // que a mesma série também ocupa na rail "Minha Lista".
    await waitFor(() => expect(screen.getByRole('button', { name: /Assistir/ })).toHaveClass('tv-focus'))

    press('Enter')
    expect(props.onOpenItem).toHaveBeenCalledTimes(1)
    expect(vi.mocked(props.onOpenItem).mock.calls[0][0].name).toBe('Série Sem Episódios')
    expect(props.onPlay).not.toHaveBeenCalled()
  })
})

describe('HomeContent — rail "Continuar assistindo" (US1/AC1, AC8)', () => {
  it('hero mostra "Continuar" e a rail lista o item; OK no card abre o detalhe', async () => {
    await seedSource()
    const id = await seedMovie('Arrival', 'a1')
    await updateProgress(buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: 'a1' }), SOURCE_ID, 300, db)
    const props = renderHome().props

    await waitFor(() => expect(screen.getByRole('button', { name: '▶ Continuar' })).toHaveClass('tv-focus'))
    await waitFor(() => expect(screen.getByText('Continuar assistindo')).toBeInTheDocument())

    press('ArrowDown') // hero -> continue
    press('Enter')
    expect(props.onOpenItem).toHaveBeenCalledTimes(1)
    expect(vi.mocked(props.onOpenItem).mock.calls[0]).toEqual([
      expect.objectContaining({ id: String(id), name: 'Arrival' }),
      { zone: 'rail', rail: 'continue', itemId: String(id) },
    ])
  })
})

describe('HomeContent — "Minha Lista" do hero (US1/AC7)', () => {
  it('alterna o favorito do item em foco e o rótulo muda, sem sair da tela', async () => {
    await seedSource()
    // "Duna" também está em "Continuar assistindo" — assim o hero continua
    // mostrando o MESMO item depois de desfavoritado (senão a cadeia de
    // preferência trocaria de hero, que é o comportamento certo noutro
    // cenário, mas não o que este teste quer isolar). "Dark" é só favorito,
    // para a rail "Minha Lista" não desaparecer inteira ao desfavoritar Duna.
    await seedMovie('Duna', 'd1')
    await updateProgress(buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: 'd1' }), SOURCE_ID, 300, db)
    await favoriteMovie('d1', 100)
    await seedSeriesNoEpisodes('Dark', 's1')
    await favoriteSeries('s1', 50)
    renderHome()

    await waitFor(() => expect(document.querySelector('.home-hero-title')?.textContent).toBe('Duna'))
    press('ArrowRight') // primária -> Mais informações
    press('ArrowRight') // -> Minha Lista
    expect(screen.getByRole('button', { name: '✓ Na Minha Lista' })).toHaveClass('tv-focus')

    press('Enter')
    await waitFor(() => expect(screen.getByRole('button', { name: '+ Minha Lista' })).toBeInTheDocument())
    // O aviso sai depois da gravação (`mutateAsync`) — sob carga chega depois do botão.
    await waitFor(() => expect(screen.getByText('Removido dos favoritos')).toBeInTheDocument())
    // O hero continua sendo Duna (via "Continuar assistindo"); a rail
    // "Minha Lista" perde o card dela, mas continua existindo (por "Dark").
    // "Duna" ainda aparece em "Continuar assistindo" — a checagem é só
    // dentro da seção "Minha Lista".
    expect(document.querySelector('.home-hero-title')?.textContent).toBe('Duna')
    await waitFor(() => {
      const myList = document.querySelector('[aria-label="Minha Lista"]')
      expect(myList?.textContent).not.toContain('Duna')
      expect(myList?.textContent).toContain('Dark')
    })
  })
})

describe('HomeContent — rails: "Filmes (N)"/"Séries (N)"/"Ver todos (N)" (FR-014)', () => {
  it('mostra só os atalhos com N>0, com a contagem real de itens resolvidos', async () => {
    await seedSource()
    await seedMovie('Duna', 'd1')
    await favoriteMovie('d1', 200) // mais recente -> vira o hero
    await seedSeriesNoEpisodes('Dark', 's1')
    await favoriteSeries('s1', 100)
    await seedChannel('Globo', 'c1')
    await favoriteChannel('c1', 50)
    const props = renderHome().props

    // "Ver todos"/"Filmes (N)"/"Séries (N)" (`HomeSeeAllCard`) são `<div>`s
    // com foco de estado (ADR-009), como `ContentCard`/`ChannelRow` — nunca
    // `role="button"` real.
    await waitFor(() => expect(screen.getByText('Filmes (1)')).toBeInTheDocument())
    expect(screen.getByText('Séries (1)')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Ver todos (1)')).toBeInTheDocument())

    // Desce até "Minha Lista" ([Duna, Dark, Filmes (1), Séries (1)]) e vai
    // até o sentinela "Filmes (1)".
    press('ArrowDown') // hero -> mylist
    press('ArrowRight') // Duna -> Dark
    press('ArrowRight') // Dark -> Filmes (1)
    press('Enter')
    expect(props.onOpenFavorites).toHaveBeenCalledWith('movies', expect.objectContaining({ zone: 'rail', rail: 'mylist' }))

    press('ArrowDown') // mylist -> channels
    press('ArrowRight') // Globo -> Ver todos (1)
    press('Enter')
    expect(props.onOpenFavorites).toHaveBeenCalledWith('live', expect.objectContaining({ zone: 'rail', rail: 'channels' }))
  })

  // Feature 028, FR-015/FR-017.
  it('todo controle tem nome acessível: com conteúdo (hero + rails)', async () => {
    await seedSource()
    await seedMovie('Duna', 'd1')
    await favoriteMovie('d1', 200)
    await seedSeriesNoEpisodes('Dark', 's1')
    await favoriteSeries('s1', 100)
    await seedChannel('Globo', 'c1')
    await favoriteChannel('c1', 50)
    const { container } = renderHome()

    await waitFor(() => expect(screen.getByText('Filmes (1)')).toBeInTheDocument())
    expect(findUnnamedControls(container).map((f) => f.description)).toEqual([])
  })

  it('sem nenhum favorito de filme/série, "Minha Lista" nem aparece (rail vazia não renderiza)', async () => {
    await seedSource()
    await seedChannel('Globo', 'c1')
    await favoriteChannel('c1', 50)
    renderHome()

    await waitFor(() => {
      expect(screen.getByText('Canais favoritos')).toBeInTheDocument()
      expect(document.querySelectorAll('.home-row[aria-busy="true"]')).toHaveLength(0)
    })
    expect(screen.queryByText('Minha Lista')).not.toBeInTheDocument()
    expect(screen.queryByText('Continuar assistindo')).not.toBeInTheDocument()
  })
})

describe('HomeContent — "linha efetiva" (FR-018, mesmo padrão da feature 023)', () => {
  it('o item em foco desaparece da única rail com a tela já montada — o foco cai na linha acima, nunca em nada', async () => {
    await seedSource()
    await seedMovie('Duna', 'd1')
    await favoriteMovie('d1', 100)
    const { queryClient } = renderHome()

    // Espera o card de verdade (não o skeleton, que tem o mesmo título) estar
    // pronto antes de descer o foco até ele.
    await waitFor(() => {
      const title = document.querySelector('.home-row .content-card-title')
      expect(title?.textContent).toBe('Duna')
    })
    press('ArrowDown') // hero -> mylist
    expect(document.querySelector('.home-row .tv-focus')).not.toBeNull()

    // Desfavoritado em outra tela (ex.: o detalhe) — a consulta revalida e a
    // rail esvazia com a Home já montada, sem nenhuma tecla ter sido apertada.
    // Único favorito da fonte: o hero também recai em boas-vindas.
    await toggleFavorite(buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: 'd1' }), SOURCE_ID, false, db)
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['my-list-content', SOURCE_ID] })
      await queryClient.invalidateQueries({ queryKey: ['home-hero', SOURCE_ID] })
    })

    await waitFor(() => expect(screen.queryByText('Minha Lista')).not.toBeInTheDocument())
    expect(document.querySelectorAll('.tv-focus')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Abrir TV ao vivo' })).toHaveClass('tv-focus')

    // A navegação continua funcionando depois da corrida.
    press('ArrowRight')
    expect(screen.getByRole('button', { name: 'Abrir Filmes' })).toHaveClass('tv-focus')
  })
})

describe('HomeContent — mocks anunciam "Em breve" (FR-016)', () => {
  it('"Curadoria IA" e os ícones do dock anunciam e não fazem mais nada', async () => {
    await seedSource()
    renderHome()

    await waitFor(() => expect(screen.getByText('Curadoria IA')).toBeInTheDocument())
    press('ArrowDown') // hero -> ai
    press('Enter')
    expect(await announced()).toContain('Em breve —')

    press('ArrowDown') // ai -> dock (1º ícone = TMDB, real desde a feature 032)
    press('ArrowRight') // 2º ícone = Assistente de IA, ainda mock
    press('Enter')
    expect(await announced()).toContain('Em breve —')
  })
})

describe('HomeContent — ícone TMDB do dock (feature 032, FR-016)', () => {
  async function focusDock() {
    await waitFor(() => expect(screen.getByText('Curadoria IA')).toBeInTheDocument())
    press('ArrowDown') // hero -> ai
    press('ArrowDown') // ai -> dock (1º ícone)
  }

  it('sem chave: nome acessível "não configurado", sem aria-disabled; OK abre Integrações com o foco de origem', async () => {
    await seedSource()
    const { props } = renderHome({ onOpenIntegrations: vi.fn() })
    await focusDock()

    const tmdb = await screen.findByRole('button', { name: 'TMDB — não configurado' })
    expect(tmdb).toHaveClass('tv-focus')
    expect(tmdb).not.toHaveAttribute('aria-disabled')
    expect(tmdb).toHaveAttribute('data-state', 'not_configured')

    press('Enter')
    expect(props.onOpenIntegrations).toHaveBeenCalledWith({ zone: 'dock', service: 'dock-tmdb' })
  })

  it('com chave guardada o ícone mostra "conectado" — só a leitura local, sem rede', async () => {
    await seedSource()
    await db.integrations.put({ id: 'tmdb', key: '0123456789abcdef0123456789abcdef', format: 'v3', state: 'connected', lastTestedAt: 1 })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    try {
      renderHome({ onOpenIntegrations: vi.fn() })
      expect(await screen.findByRole('button', { name: 'TMDB — conectado' })).toHaveAttribute('data-state', 'connected')
      expect(fetchSpy).not.toHaveBeenCalled()
      // A chave nunca chega ao DOM.
      expect(document.body.innerHTML).not.toContain('0123456789abcdef0123456789abcdef')
    } finally {
      fetchSpy.mockRestore()
      await db.integrations.clear()
    }
  })

  it('sem o callback (contratos antigos), OK só anuncia o estado e não quebra', async () => {
    await seedSource()
    renderHome()
    await focusDock()
    press('Enter')
    expect(await announced()).toContain('TMDB — não configurado')
  })

  it('os outros três ícones continuam "Em breve" e soft disabled', async () => {
    await seedSource()
    renderHome()
    await screen.findByRole('group', { name: 'Serviços' })
    for (const name of ['Assistente de IA', 'Clima', 'Teste de velocidade']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-disabled', 'true')
    }
  })
})

describe('HomeContent — restauração de initialFocus por id (FR-017/FR-029)', () => {
  it('restaura o foco na rail "Minha Lista" pelo id do item, não pela posição', async () => {
    await seedSource()
    await seedMovie('Alfa', 'a1')
    await favoriteMovie('a1', 100)
    const betaId = await seedMovie('Beta', 'b1')
    await favoriteMovie('b1', 200) // mais recente -> vira o hero

    renderHome({ initialFocus: { zone: 'rail', rail: 'mylist', itemId: String(betaId) } })

    await waitFor(() => {
      const focused = document.querySelector('.home-row .tv-focus')
      expect(focused?.closest('.content-card')?.querySelector('.content-card-title')?.textContent).toBe('Beta')
    })
  })

  it('id que não existe mais cai no início da mesma linha, nunca em outra', async () => {
    await seedSource()
    await seedMovie('Alfa', 'a1')
    await favoriteMovie('a1', 100)

    renderHome({ initialFocus: { zone: 'rail', rail: 'mylist', itemId: 'id-que-nao-existe-mais' } })

    await waitFor(() => {
      const focused = document.querySelector('.home-row .tv-focus')
      expect(focused?.closest('.content-card')?.querySelector('.content-card-title')?.textContent).toBe('Alfa')
    })
  })
})

// Feature 030, US4 (FR-027): programa atual nos cards de "Canais favoritos".
describe('HomeContent — EPG na rail "Canais favoritos" (feature 030)', () => {
  afterEach(async () => {
    await db.epgPrograms.clear()
  })

  async function seedChannelWithEpg(name: string, streamId: string, epgId: string | undefined): Promise<void> {
    const id = await seedChannel(name, streamId)
    if (epgId) await db.channels.update(id, { epgChannelId: epgId })
    await favoriteChannel(streamId, 50)
  }

  it('mostra o título do programa atual só nos canais com EPG; os demais ficam como eram', async () => {
    await seedSource()
    await seedChannelWithEpg('Globo', 'c1', 'globo.br')
    await seedChannelWithEpg('Sem Guia', 'c2', undefined)
    const now = Date.now()
    await writeEpgPrograms(SOURCE_ID, [
      { channelKey: 'globo.br', start: now - 30 * 60_000, end: now + 30 * 60_000, title: 'Jornal Nacional' },
      { channelKey: 'globo.br', start: now + 30 * 60_000, end: now + 90 * 60_000, title: 'Novela das Nove' },
    ])
    renderHome()

    await waitFor(() => expect(screen.getByText('Jornal Nacional')).toBeInTheDocument())
    const rowOf = (name: string) =>
      [...document.querySelectorAll('.home-row .channel-row')].find((row) => row.querySelector('.channel-row-name')?.textContent === name)
    expect(rowOf('Globo')?.querySelector('.channel-row-now')?.textContent).toBe('Jornal Nacional')
    expect(rowOf('Sem Guia')?.querySelector('.channel-row-now')?.textContent).toBe('')
    // FR-027: só o título — o "A seguir" não entra no card.
    expect(screen.queryByText('Novela das Nove')).not.toBeInTheDocument()
  })

  it('sem programação guardada, os cards ficam exatamente como eram', async () => {
    await seedSource()
    await seedChannelWithEpg('Globo', 'c1', 'globo.br')
    renderHome()

    await waitFor(() => expect(screen.getByText('Globo')).toBeInTheDocument())
    expect(document.querySelector('.home-row .channel-row-now')?.textContent).toBe('')
  })
})