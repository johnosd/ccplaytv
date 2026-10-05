/**
 * Feature 058 (T031, `logic/arquivo.md` §7): o arquivo dentro da `LiveScreen` —
 * Guia → programa passado → RETURN volta ao Guia no programa; fim → o seguinte
 * → o atual → ao vivo; "Ao vivo" do erro do arquivo; CH± sai do arquivo.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveScreen } from './LiveScreen'
import * as catalogApi from '../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut } from '../catalog/catalogApi'
import { db } from '../../lib/catalog/db'
import { deleteEpgForSource, writeEpgPrograms } from '../../lib/epg/epgRepository'

const saved: Record<string, PropertyDescriptor | undefined> = {}
beforeAll(() => {
  saved.offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
  saved.offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
  saved.clientHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight')
  saved.scrollHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight')
  saved.scrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo')
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 640 })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 1344 })
  Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, value: 640 })
  Object.defineProperty(Element.prototype, 'scrollHeight', { configurable: true, value: 1_000_000 })
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    writable: true,
    value: function scrollTo(this: HTMLElement, options?: ScrollToOptions | number) {
      const top = typeof options === 'object' && options !== null ? options.top : undefined
      if (typeof top === 'number') this.scrollTop = top
      queueMicrotask(() => this.dispatchEvent(new Event('scroll')))
    },
  })
})
afterAll(() => {
  if (saved.offsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', saved.offsetHeight)
  if (saved.offsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', saved.offsetWidth)
  if (saved.clientHeight) Object.defineProperty(Element.prototype, 'clientHeight', saved.clientHeight)
  if (saved.scrollHeight) Object.defineProperty(Element.prototype, 'scrollHeight', saved.scrollHeight)
  if (saved.scrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', saved.scrollTo)
})

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return {
    ...actual,
    useCategoryList: vi.fn(),
    useCategoryContent: vi.fn(),
    useCategoryFocusPrefetch: vi.fn(),
    fetchPlayback: vi.fn(),
    fetchArchivePlayback: vi.fn(),
    rememberArchiveVariant: vi.fn(),
    useAggregatedItems: vi.fn(),
  }
})

const SOURCE_ID = 'source-arquivo-live'
const at = (hour: number, minute = 0) => new Date(2026, 8, 29, hour, minute, 0, 0).getTime()

const channel = (name: string, epgId: string, archiveDays: number | null): CatalogItemOut => ({
  id: `id-${name}`,
  kind: 'channel',
  name,
  original_group: 'Notícias',
  published: true,
  playable: true,
  source_id: SOURCE_ID,
  provider_stream_id: name,
  original_name: name,
  epg_channel_id: epgId,
  archive_days: archiveDays,
})

const CHANNELS = [channel('Canal A', 'a.br', 3), channel('Canal B', 'b.br', null)]

function mockCatalog() {
  const category: CatalogCategory = { id: 1, kind: 'channel', name: 'Notícias', order: 0, count: 0, fetchMode: 'on_demand', providerCategoryId: '1' }
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({ data: [category], isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
  vi.mocked(catalogApi.useCategoryContent).mockImplementation((_sourceId, cat) => {
    const items = cat?.id === 1 ? CHANNELS : []
    return { data: { items, totalCount: items.length, outcome: 'fresh' }, isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof catalogApi.useCategoryContent>
  })
  vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({ items: CHANNELS, coveredCategories: 1, totalCategories: 1, isLoading: false })
}

function archivePlayback() {
  return {
    item_id: 'id-Canal A',
    kind: 'archive' as const,
    url: 'http://exemplo.invalid/arquivo.ts',
    container_hint: null,
    source_id: SOURCE_ID,
    provider_stream_id: 'Canal A',
    original_name: 'Canal A',
    series_id: null,
    season_number: null,
    episode_number: null,
  }
}

function renderLive() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  render(
    <Wrapper>
      <LiveScreen sourceId={SOURCE_ID} onBack={vi.fn()} onResync={vi.fn()} />
    </Wrapper>,
  )
}

function tap(key: string, keyCode?: number) {
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true }))
    document.body.dispatchEvent(new KeyboardEvent('keyup', { key, keyCode, bubbles: true }))
  })
}

const guideFocusText = () => document.querySelector('.epg-guide-block.tv-focus')?.textContent ?? ''

/** Entra na categoria e abre o Guia completo pelo ícone (origem: Canal A), depois anda ← até `title`. */
async function openGuideAt(title: string) {
  tap('Enter')
  tap('ArrowUp')
  tap('ArrowRight')
  tap('Enter')
  await waitFor(() => expect(guideFocusText()).toContain('Agora A'))
  for (let i = 0; i < 6 && !guideFocusText().includes(title); i += 1) tap('ArrowLeft')
  expect(guideFocusText()).toContain(title)
}

/** O `<video>` de desenvolvimento começa a tocar (o jsdom nunca sai de `preparing` sozinho). */
function playVideo() {
  act(() => {
    document.querySelector('.player-video')?.dispatchEvent(new Event('playing'))
  })
}

/** O `<video>` toca e termina → fim do programa de arquivo. */
function endVideo() {
  playVideo()
  act(() => {
    document.querySelector('.player-video')?.dispatchEvent(new Event('ended'))
  })
}

describe('LiveScreen — arquivo (feature 058)', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(at(10, 30))
    mockCatalog()
    vi.mocked(catalogApi.fetchPlayback).mockImplementation(() => new Promise(() => {}))
    vi.mocked(catalogApi.fetchArchivePlayback).mockImplementation(async () => archivePlayback())
    vi.mocked(catalogApi.rememberArchiveVariant).mockResolvedValue(undefined)
    await db.sources.put({
      id: SOURCE_ID,
      type: 'provider_credentials',
      displayName: 'Fonte com arquivo',
      providerDns: 'http://painel.test',
      providerUsername: 'u',
      providerPassword: 'p',
      connectionState: 'synced',
      activeGeneration: 1,
      epgLastSyncAt: at(10),
      createdAt: 0,
      updatedAt: 0,
    })
    await writeEpgPrograms(SOURCE_ID, [
      { channelKey: 'a.br', start: at(8), end: at(9), title: 'Manhã A' },
      { channelKey: 'a.br', start: at(9), end: at(10), title: 'Antes A' },
      { channelKey: 'a.br', start: at(10), end: at(11), title: 'Agora A' },
      { channelKey: 'b.br', start: at(10), end: at(12), title: 'Programa do B' },
    ])
  })

  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    vi.useRealTimers()
    await deleteEpgForSource(SOURCE_ID).catch(() => {})
    await db.sources.delete(SOURCE_ID)
    await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
  })

  it('Guia → programa passado toca o arquivo; RETURN volta ao Guia com o foco no programa', async () => {
    renderLive()
    await openGuideAt('Antes A')
    tap('Enter')
    await waitFor(() => expect(catalogApi.fetchArchivePlayback).toHaveBeenCalledWith('id-Canal A', { start: at(9), end: at(10) }))
    expect(catalogApi.fetchPlayback).not.toHaveBeenCalled()
    expect(document.querySelector('.epg-guide')).toBeNull()

    tap('Escape')
    await waitFor(() => expect(guideFocusText()).toContain('Antes A'))
    expect(document.querySelector('.player-overlay')).toBeNull()
  })

  it('fim → o seguinte contíguo → o atual → ao vivo; nada vai para o histórico', async () => {
    renderLive()
    await openGuideAt('Manhã A')
    tap('Enter')
    await waitFor(() => expect(catalogApi.fetchArchivePlayback).toHaveBeenLastCalledWith('id-Canal A', { start: at(8), end: at(9) }))
    await waitFor(() => expect(document.querySelector('.player-video')).not.toBeNull())

    // A programação do canal que toca é lida do IndexedDB depois que ele começa a tocar; na TV um
    // programa dura minutos, aqui o "fim" é imediato — espera a leitura (não há sinal visível dela).
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100))
    })
    endVideo()
    await waitFor(() => expect(catalogApi.fetchArchivePlayback).toHaveBeenLastCalledWith('id-Canal A', { start: at(9), end: at(10) }))
    await waitFor(() => expect(document.querySelector('.player-video')).not.toBeNull())

    endVideo()
    await waitFor(() => expect(catalogApi.fetchArchivePlayback).toHaveBeenLastCalledWith('id-Canal A', { start: at(10), end: at(11) }))
    await waitFor(() => expect(document.querySelector('.player-video')).not.toBeNull())

    endVideo() // o atual "termina" no agora → ao vivo do mesmo canal
    await waitFor(() => expect(catalogApi.fetchPlayback).toHaveBeenCalledWith('id-Canal A'))
    expect(await db.userStates.where('sourceId').equals(SOURCE_ID).count()).toBe(0)
  })

  it('arquivo que não responde: "Ao vivo" do erro volta ao ao vivo do canal', async () => {
    vi.mocked(catalogApi.fetchArchivePlayback).mockRejectedValue(new catalogApi.CatalogApiError(409, 'Item sem fonte de reprodução disponível.'))
    renderLive()
    await openGuideAt('Antes A')
    tap('Enter')
    await waitFor(() => expect(document.querySelector('.player-action.tv-focus')?.textContent).toBe('Ao vivo'))
    // O teclado (`useRemoteNav`) troca os handlers num efeito depois do render: deixa assentar antes da tecla.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    tap('Enter')
    await waitFor(() => expect(catalogApi.fetchPlayback).toHaveBeenCalledWith('id-Canal A'))
  })

  it('a prévia mostra o selo "Arquivo · N dias" só no canal com arquivo, sem nada focável novo (T037)', async () => {
    renderLive()
    tap('Enter') // entra na categoria: foco no Canal A
    await waitFor(() => expect(document.querySelector('.live-hero-name')?.textContent).toBe('Canal A'))
    const badge = document.querySelector('.live-hero-archive')
    expect(badge?.textContent).toBe('Arquivo · 3 dias')
    expect(badge?.closest('button')).toBeNull()
    expect(document.querySelectorAll('.tv-focus')).toHaveLength(1)

    tap('ArrowDown') // Canal B, sem arquivo
    await waitFor(() => expect(document.querySelector('.live-hero-name')?.textContent).toBe('Canal B'))
    expect(document.querySelector('.live-hero-archive')).toBeNull()
  })

  it('"Do início" toca o programa atual desde o começo; RETURN volta ao ao vivo sem fechar o player', async () => {
    let resolveLive: ((value: Awaited<ReturnType<typeof catalogApi.fetchPlayback>>) => void) | null = null
    vi.mocked(catalogApi.fetchPlayback).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLive = resolve
        }),
    )
    renderLive()
    tap('Enter') // entra na categoria
    tap('Enter') // toca o Canal A ao vivo
    await waitFor(() => expect(catalogApi.fetchPlayback).toHaveBeenCalledWith('id-Canal A'))
    await act(async () => {
      resolveLive?.({ ...archivePlayback(), kind: 'channel', url: 'http://exemplo.invalid/ao-vivo.ts' })
      await new Promise((resolve) => setTimeout(resolve, 100)) // a programação do canal é lida do IndexedDB
    })
    playVideo()
    tap('ArrowRight') // revela a linha (foco em "Guia")
    tap('ArrowRight') // "Do início"
    await waitFor(() => expect(document.querySelector('.player-chrome-button.tv-focus')?.getAttribute('aria-label')).toBe('Do início'))
    tap('Enter')
    await waitFor(() => expect(catalogApi.fetchArchivePlayback).toHaveBeenCalledWith('id-Canal A', { start: at(10), end: at(11) }))

    vi.mocked(catalogApi.fetchPlayback).mockClear()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    tap('Escape')
    await waitFor(() => expect(catalogApi.fetchPlayback).toHaveBeenCalledWith('id-Canal A'))
    expect(document.querySelector('.player-overlay')).not.toBeNull()
  })

  it('CH± no arquivo vai ao ao vivo do vizinho', async () => {
    renderLive()
    await openGuideAt('Antes A')
    tap('Enter')
    await waitFor(() => expect(document.querySelector('.player-video')).not.toBeNull())
    playVideo()
    tap('ChannelDown', 428)
    await waitFor(() => expect(catalogApi.fetchPlayback).toHaveBeenCalledWith('id-Canal B'))
    expect(catalogApi.fetchArchivePlayback).toHaveBeenCalledTimes(1)
  })
})
