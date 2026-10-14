import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { HomeContent, type HomeContentProps } from './HomeContent'
import { AnnouncerContext } from '../../lib/announcer'
import { db } from '../../lib/catalog/db'
import { HOME_CHANNELS_VISIBLE, HOME_ROW_FORMATS } from './homeRowFormats'
import { buildStableId, toggleFavorite, updateProgress } from '../../lib/catalog/userStateRepository'
import { findUnnamedControls } from '../../testing/accessibleNames'
import { PROVIDER_FIELDS_VERSION } from '../../lib/metadata/titleMetadataStore'

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
  await db.titleMetadata.where('sourceId').equals(SOURCE_ID).delete() // feature 060: um teste grava a duração de um filme
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
    expect(document.querySelector('.home-hero .content-rating-badge, .home-hero .tmdb-rating-badge')).toBeNull()
    const movies = screen.getByRole('button', { name: 'Abrir Filmes' })
    expect(live).toHaveClass('tv-focus')
    expect(movies).not.toHaveClass('tv-focus')

    expect(screen.queryByText('Continuar assistindo')).not.toBeInTheDocument()
    expect(screen.queryByText('Minha Lista')).not.toBeInTheDocument()
    expect(screen.queryByText('Canais favoritos')).not.toBeInTheDocument()
    // Ad-hoc 2026-10-09: sem Curadoria IA e sem o dock de serviços — sem dados, só o billboard.
    expect(screen.queryByText('Curadoria IA')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Serviços' })).not.toBeInTheDocument()
    expect(document.querySelectorAll('.home-row')).toHaveLength(0)

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

// Feature 060 (US1): billboard com progresso real e Trailer real, no lugar do "Em breve" (item 32).
describe('HomeContent — billboard da 060', () => {
  it('061: billboard com metadata mostra classificação e TMDB depois da nota do provedor', async () => {
    await seedSource()
    const id = await seedMovie('Filme com classificação', 'rated')
    await db.channels.update(id, { providerRating: 7.4 })
    const stableId = buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: 'rated' })
    await updateProgress(stableId, SOURCE_ID, 300, db)
    await db.titleMetadata.put({
      stableId, sourceId: SOURCE_ID, kind: 'movie',
      tmdb: { status: 'matched', tmdbId: 1, fields: { certifications: { BR: '12' }, tmdbRating: { average: 7.83, votes: 80 } } },
      tmdbFetchedAt: Date.now(),
    })
    renderHome()
    await waitFor(() => expect(document.querySelector('.home-hero-meta .content-rating-badge')).toHaveTextContent('12'))
    const text = document.querySelector('.home-hero-meta')!.textContent!
    expect(text.indexOf('12')).toBeGreaterThan(text.indexOf('7,4'))
    expect(text.indexOf('TMDB 7,8')).toBeGreaterThan(text.indexOf('12'))
  })

  it('"Continuar": o nome da primária é só o rótulo; o tempo restante é a descrição e só existe com a duração conhecida (metadata guardada)', async () => {
    await seedSource()
    await seedMovie('Duna', 'd1')
    await seedMovie('Dark', 'k1')
    const stable = (streamId: string) => buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: streamId })
    await updateProgress(stable('k1'), SOURCE_ID, 300, db) // Dark: sem duração conhecida
    await updateProgress(stable('d1'), SOURCE_ID, 600, db) // Duna: o mais recente -> vira o hero
    // `lastWatched` de dois `updateProgress` seguidos pode empatar no mesmo milissegundo: a ordem do hero fica explícita.
    await db.userStates.update(stable('d1'), { lastWatched: Date.now() + 60_000 })
    await db.titleMetadata.put({
      stableId: stable('d1'),
      sourceId: SOURCE_ID,
      kind: 'movie',
      provider: { durationSeconds: 7200 },
      providerFetchedAt: Date.now(),
      providerVersion: PROVIDER_FIELDS_VERSION,
    })
    renderHome()

    const primary = await screen.findByRole('button', { name: /^(▶\s*)?Continuar$/ })
    await waitFor(() => expect(primary).toHaveAccessibleDescription('faltam 1 h 50 min'))
    expect(document.querySelector('.home-hero-title')?.textContent).toBe('Duna')
    expect(document.querySelectorAll('.home-hero-progress')).toHaveLength(1)
  })

  it('"Continuar" sem duração conhecida: sem barra e sem descrição (nenhum percentual inventado)', async () => {
    await seedSource()
    await seedMovie('Duna', 'd1')
    await updateProgress(buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: 'd1' }), SOURCE_ID, 600, db)
    renderHome()

    const primary = await screen.findByRole('button', { name: /^(▶\s*)?Continuar$/ })
    await waitFor(() => expect(document.querySelector('.home-hero-title')?.textContent).toBe('Duna'))
    expect(primary).not.toHaveAttribute('aria-describedby')
    expect(document.querySelector('.home-hero-progress')).toBeNull()
  })

  // Ad-hoc 2026-10-09: "Mais informações" e Trailer saíram do billboard; sobram a primária e "Minha Lista".
  it('o billboard só tem a primária e "Minha Lista" — sem "Mais informações" nem Trailer', async () => {
    await seedSource()
    await seedMovie('Duna', 'd1')
    await updateProgress(buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: 'd1' }), SOURCE_ID, 600, db)
    renderHome()

    const primary = await screen.findByRole('button', { name: /^(▶\s*)?Continuar$/ })
    expect([...document.querySelectorAll('.home-hero-action')].map((button) => button.textContent)).toEqual([
      expect.stringContaining('Continuar'),
      expect.stringMatching(/Minha Lista/),
    ])
    expect(screen.queryByRole('button', { name: /Mais informações/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Trailer/ })).not.toBeInTheDocument()
    expect(primary).toHaveClass('tv-focus')
    press('ArrowRight')
    press('ArrowRight') // clamp: não passa de "Minha Lista"
    expect(screen.getByRole('button', { name: /Minha Lista/ })).toHaveClass('tv-focus')
  })

  it('↑ no billboard sai direto à topbar (sem dock no caminho)', async () => {
    await seedSource()
    const props = renderHome({ onExitUp: vi.fn() }).props
    await waitFor(() => expect(screen.getByRole('button', { name: 'Abrir TV ao vivo' })).toHaveClass('tv-focus'))

    press('ArrowUp')
    expect(props.onExitUp).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.home-hero-dock, .home-dock')).toBeNull()
  })

  // Feature 060 (FR-023/SC-006): todo estado tem algo focável — sem dados só o billboard existe.
  it('sem nenhum dado há exatamente um foco, e ↑/↓ nunca o fazem sumir', async () => {
    await seedSource()
    renderHome()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Abrir TV ao vivo' })).toHaveClass('tv-focus'))
    expect(document.querySelectorAll('.home-content .tv-focus')).toHaveLength(1)

    for (const key of ['ArrowDown', 'ArrowDown', 'ArrowUp']) {
      press(key)
      expect(document.querySelectorAll('.home-content .tv-focus')).toHaveLength(1)
    }
  })
})

// Feature 060 (US2): cards com selos, expansão no foco e Continuar com progresso real.
describe('HomeContent — cards da 060', () => {
  const stable = (streamId: string) => buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: streamId })
  const expandedCards = () => document.querySelectorAll('.home-card.is-expanded')

  it('→ no último card da fileira não sai dela; só o card focado expande, e "Filmes (N)" não expande', async () => {
    await seedSource()
    await seedMovie('Alfa', 'a1')
    await seedMovie('Beta', 'b1')
    await favoriteMovie('a1', 100)
    await favoriteMovie('b1', 200)
    renderHome()
    await waitFor(() => expect(screen.getByText('Filmes (2)')).toBeInTheDocument())

    press('ArrowDown') // hero -> Minha Lista
    expect(expandedCards()).toHaveLength(1)
    expect(document.querySelectorAll('.home-card.tv-focus')).toHaveLength(1)

    press('ArrowRight') // Alfa/Beta -> o outro título
    expect(expandedCards()).toHaveLength(1)
    press('ArrowRight') // -> Filmes (2): não é um título, nada expande
    expect(expandedCards()).toHaveLength(0)
    expect(document.querySelector('.home-see-all.tv-focus')?.textContent).toBe('Filmes (2)')
    for (let i = 0; i < 4; i += 1) press('ArrowRight') // além do fim: a fileira não perde o foco nem troca de linha
    expect(document.querySelector('.home-see-all.tv-focus')?.textContent).toBe('Filmes (2)')
    expect(document.querySelectorAll('.home-content .tv-focus')).toHaveLength(1)
    expect(document.querySelector('.home-row.is-above')).toBeNull()
  })

  it('selos: ♥ nos títulos da Minha Lista e ✓ no filme assistido, lidos do aparelho (sem consulta por card)', async () => {
    await seedSource()
    await seedMovie('Alfa', 'a1')
    await seedMovie('Beta', 'b1')
    await favoriteMovie('a1', 100)
    await favoriteMovie('b1', 200)
    await db.userStates.update(stable('a1'), { completedAt: Date.now() })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    renderHome()

    await waitFor(() => expect(document.querySelectorAll('.home-row[aria-label="Minha Lista"] .home-mark--favorite')).toHaveLength(2))
    const cardOf = (name: string) =>
      [...document.querySelectorAll('.home-row[aria-label="Minha Lista"] .home-card')].find((card) => card.querySelector('.home-card-title')?.textContent === name)!
    await waitFor(() => expect(cardOf('Alfa').querySelector('.home-mark--watched')).not.toBeNull())
    expect(cardOf('Beta').querySelector('.home-mark--watched')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('Continuar assistindo: a barra e a legenda só existem para o filme com posição E duração conhecidas', async () => {
    await seedSource()
    await seedMovie('Com duração', 'd1')
    await seedMovie('Sem duração', 'k1')
    await updateProgress(stable('k1'), SOURCE_ID, 300, db)
    await updateProgress(stable('d1'), SOURCE_ID, 600, db)
    await db.userStates.update(stable('d1'), { lastWatched: Date.now() + 60_000 })
    await db.titleMetadata.put({
      stableId: stable('d1'),
      sourceId: SOURCE_ID,
      kind: 'movie',
      provider: { durationSeconds: 7200 },
      providerFetchedAt: Date.now(),
      providerVersion: PROVIDER_FIELDS_VERSION,
    })
    renderHome()

    await waitFor(() => expect(document.querySelectorAll('.home-row[aria-label="Continuar assistindo"] .home-card')).toHaveLength(2))
    await waitFor(() => expect(document.querySelectorAll('.home-row[aria-label="Continuar assistindo"] .home-card-progress')).toHaveLength(1))
    const captions = [...document.querySelectorAll('.home-row[aria-label="Continuar assistindo"] .home-card-caption')].map((el) => el.textContent)
    expect(captions).toEqual(['faltam 1 h 50 min'])
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

    // Ad-hoc 2026-10-09: "Canais favoritos" (`channels`) é a 1ª fileira. Desce até os canais e vai ao "Ver todos".
    press('ArrowDown') // hero -> channels
    press('ArrowRight') // Globo -> Ver todos (1)
    press('Enter')
    expect(props.onOpenFavorites).toHaveBeenCalledWith('live', expect.objectContaining({ zone: 'rail', rail: 'channels' }))

    // "Minha Lista" ([Duna, Dark, Filmes (1), Séries (1)]): vai até o sentinela "Filmes (1)".
    press('ArrowDown') // channels -> mylist
    press('ArrowRight') // Duna -> Dark
    press('ArrowRight') // Dark -> Filmes (1)
    press('Enter')
    expect(props.onOpenFavorites).toHaveBeenCalledWith('movies', expect.objectContaining({ zone: 'rail', rail: 'mylist' }))
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

describe('HomeContent — ordem das fileiras (feature 060, FR-018)', () => {
  it('"Canais favoritos" abre as fileiras, antes de "Continuar assistindo" e "Minha Lista"; não há Curadoria IA', async () => {
    await seedSource()
    await seedMovie('Duna', 'm1')
    await favoriteMovie('m1', 40)
    await updateProgress(buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: 'm1' }), SOURCE_ID, 300, db)
    await seedChannel('Globo', 'c1')
    await favoriteChannel('c1', 50)
    renderHome()

    await waitFor(() => {
      expect(screen.getByText('Canais favoritos')).toBeInTheDocument()
      expect(screen.getByText('Continuar assistindo')).toBeInTheDocument()
      expect(screen.getByText('Minha Lista')).toBeInTheDocument()
      expect(document.querySelectorAll('.home-row[aria-busy="true"]')).toHaveLength(0)
    })
    expect([...document.querySelectorAll('.home-row')].map((row) => row.getAttribute('data-row'))).toEqual(['channels', 'continue', 'mylist'])
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
      const title = document.querySelector('.home-row .home-card-title')
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
      expect(focused?.querySelector('.home-card-title')?.textContent).toBe('Beta')
    })
  })

  it('id que não existe mais cai no início da mesma linha, nunca em outra', async () => {
    await seedSource()
    await seedMovie('Alfa', 'a1')
    await favoriteMovie('a1', 100)

    renderHome({ initialFocus: { zone: 'rail', rail: 'mylist', itemId: 'id-que-nao-existe-mais' } })

    await waitFor(() => {
      const focused = document.querySelector('.home-row .tv-focus')
      expect(focused?.querySelector('.home-card-title')?.textContent).toBe('Alfa')
    })
  })
})

// Ad-hoc 2026-10-09 (substitui os cards com EPG da 030/060): ícones, só os que cabem na tela, e o "Ver todos (N)" com o total.
describe('HomeContent — ícones de "Canais favoritos"', () => {
  it('mostra só HOME_CHANNELS_VISIBLE ícones e o "Ver todos" conta todos os favoritos', async () => {
    await seedSource()
    const total = HOME_CHANNELS_VISIBLE + 3
    for (let i = 0; i < total; i += 1) {
      await seedChannel(`Canal ${i}`, `c${i}`)
      await favoriteChannel(`c${i}`, 100 - i)
    }
    renderHome()

    await waitFor(() => expect(screen.getByText(`Ver todos (${total})`)).toBeInTheDocument())
    const tiles = document.querySelectorAll('.home-row[data-row="channels"] .home-live-card')
    expect(tiles).toHaveLength(HOME_CHANNELS_VISIBLE)
    // Ícone = logo ou, sem logo, as iniciais (placeholder); o nome fica embaixo. Sem programa nem barra de EPG.
    expect(tiles[0].querySelector('.poster-box-logo')).not.toBeNull()
    expect(tiles[0].querySelector('.home-live-name')?.textContent).toBe('Canal 0')
    expect(document.querySelector('.home-row[data-row="channels"] .home-live-bar')).toBeNull()
  })

  it('cabem na largura útil do palco junto com o "Ver todos"', () => {
    expect(HOME_CHANNELS_VISIBLE).toBeGreaterThan(0)
    expect((HOME_CHANNELS_VISIBLE + 1) * HOME_ROW_FORMATS.live.itemWidth).toBeLessThanOrEqual(1920 - 96 * 2)
  })
})
