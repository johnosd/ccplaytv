/**
 * Feature 058 (T030, `logic/arquivo.md` §8): o Guia com arquivo — marca só nos
 * programas encerrados disponíveis, OK toca, fora dos dias explica, sem arquivo
 * mantém o texto da 031, focar não dispara nada, e reabre no programa.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import { createRef, type ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { EpgGuide, type EpgGuideHandle, type EpgGuideProps } from './EpgGuide'
import * as catalogApi from '../../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut } from '../../catalog/catalogApi'
import { db } from '../../../lib/catalog/db'
import type { EpgLookup } from '../../../lib/epg/types'

// A grade é virtualizada: sem altura no jsdom nenhuma linha é desenhada (mesmo recurso de `EpgGuide.nav.test.tsx`).
const saved: Record<string, PropertyDescriptor | undefined> = {}
beforeAll(() => {
  saved.offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
  saved.clientHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight')
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 640 })
  Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, value: 640 })
})
afterAll(() => {
  if (saved.offsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', saved.offsetHeight)
  if (saved.clientHeight) Object.defineProperty(Element.prototype, 'clientHeight', saved.clientHeight)
})

vi.mock('../../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../catalog/catalogApi')>()
  return { ...actual, useCategoryContent: vi.fn(), useFavoritesContent: vi.fn(), useAggregatedItems: vi.fn(), useEpgPrograms: vi.fn() }
})

const SOURCE_ID = 'source-guia-arquivo'
const at = (hour: number, minute = 0) => new Date(2026, 8, 29, hour, minute, 0, 0).getTime()
const CATEGORY: CatalogCategory = { id: 1, kind: 'channel', name: 'Notícias', order: 0, count: 3, fetchMode: 'on_demand', providerCategoryId: '1' }

const channel = (n: number, archiveDays: number | null): CatalogItemOut => ({
  id: `id-${n}`,
  kind: 'channel',
  name: `Canal ${n}`,
  original_group: 'Notícias',
  published: true,
  playable: true,
  source_id: SOURCE_ID,
  provider_stream_id: String(n),
  original_name: `Canal ${n}`,
  epg_channel_id: `c${n}.br`,
  archive_days: archiveDays,
})
// Canal 1: 3 dias de arquivo. Canal 2: sem arquivo. Canal 3: arquivo de ~1 h (o programa das 8 h já saiu).
const CHANNELS = [channel(1, 3), channel(2, null), channel(3, 0.05)]

function lookup(): EpgLookup {
  const byKey = new Map<string, { channelKey: string; start: number; end: number; title: string }[]>()
  for (const item of CHANNELS) {
    const key = item.epg_channel_id!
    byKey.set(key, [
      { channelKey: key, start: at(8), end: at(9), title: `Manhã ${item.name}` },
      { channelKey: key, start: at(9), end: at(10), title: `Antes ${item.name}` },
      { channelKey: key, start: at(10), end: at(11), title: `Agora ${item.name}` },
    ])
  }
  return { byKey, offsetMs: 0 } as unknown as EpgLookup
}

async function setup(overrides: Partial<EpgGuideProps> = {}) {
  const handle = createRef<EpgGuideHandle>()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  const props: EpgGuideProps = {
    sourceId: SOURCE_ID,
    categories: [CATEGORY],
    initialList: { kind: 'category', id: 1 },
    initialChannelId: 'id-1',
    onWatch: vi.fn(),
    onClose: vi.fn(),
    onNotify: vi.fn(),
    onWatchArchive: vi.fn(),
    handleRef: handle,
    ...overrides,
  }
  render(<EpgGuide {...props} />, { wrapper: Wrapper })
  await screen.findByRole('tablist')
  return { handle, props }
}

const press = (handle: { current: EpgGuideHandle | null }, ...directions: ('up' | 'down' | 'left' | 'right')[]) =>
  directions.forEach((direction) => act(() => handle.current!.onDirection(direction)))
const select = (handle: { current: EpgGuideHandle | null }) => act(() => handle.current!.onSelect())
const focusedBlock = () => document.querySelector('.epg-guide-block.tv-focus')
/** ← até o foco cair no bloco `title` (a janela do guia rola junto); falha se não chegar. */
function leftUntil(handle: { current: EpgGuideHandle | null }, title: string) {
  for (let i = 0; i < 6 && !focusedBlock()?.textContent?.includes(title); i += 1) press(handle, 'left')
  expect(focusedBlock()?.textContent).toContain(title)
}
const blockOf = (title: string) => Array.from(document.querySelectorAll('.epg-guide-block')).find((el) => el.textContent?.includes(title))

describe('EpgGuide — arquivo (feature 058)', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(at(10, 30))
    await db.sources.put({
      id: SOURCE_ID,
      type: 'provider_credentials',
      displayName: 'Fonte',
      providerDns: 'http://painel.test',
      providerUsername: 'u',
      providerPassword: 'p',
      connectionState: 'synced',
      activeGeneration: 1,
      epgLastSyncAt: at(10),
      createdAt: 0,
      updatedAt: 0,
    })
    vi.mocked(catalogApi.useCategoryContent).mockReturnValue({
      data: { items: CHANNELS, totalCount: CHANNELS.length, outcome: 'fresh' },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof catalogApi.useCategoryContent>)
    vi.mocked(catalogApi.useFavoritesContent).mockReturnValue({ data: { items: [], unresolved: 0 }, isLoading: false, isError: false } as unknown as ReturnType<typeof catalogApi.useFavoritesContent>)
    vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({ items: [], coveredCategories: 0, totalCategories: 1, isLoading: false })
    vi.mocked(catalogApi.useEpgPrograms).mockReturnValue({ data: lookup() } as unknown as ReturnType<typeof catalogApi.useEpgPrograms>)
  })
  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    vi.useRealTimers()
    await db.sources.delete(SOURCE_ID)
  })

  it('marca só os encerrados disponíveis no arquivo; continuam `is-past`, sem aria-disabled', async () => {
    const { handle } = await setup()
    leftUntil(handle, 'Antes Canal 1') // traz as 9 h para a janela
    const archived = blockOf('Antes Canal 1')!
    expect(archived).toHaveClass('is-past', 'is-archive')
    expect(archived).not.toHaveAttribute('aria-disabled')
    expect(blockOf('Antes Canal 2')).not.toHaveClass('is-archive')
    expect(blockOf('Antes Canal 2')).toHaveAttribute('aria-disabled', 'true')
    expect(blockOf('Agora Canal 1')).not.toHaveClass('is-archive')
  })

  it('sem onWatchArchive (contrato da 031) nada muda: nenhuma marca', async () => {
    await setup({ onWatchArchive: undefined })
    expect(document.querySelectorAll('.epg-guide-block.is-archive')).toHaveLength(0)
  })

  it('OK num encerrado disponível chama onWatchArchive com o programa; focar não chama nada', async () => {
    const { handle, props } = await setup()
    leftUntil(handle, 'Antes Canal 1')
    expect(props.onWatchArchive).not.toHaveBeenCalled()
    expect(props.onNotify).not.toHaveBeenCalled()
    expect(screen.getByText('Disponível no arquivo · OK para assistir')).toBeInTheDocument()
    select(handle)
    expect(props.onWatchArchive).toHaveBeenCalledWith(
      CHANNELS[0],
      expect.objectContaining({ start: at(9), end: at(10), title: 'Antes Canal 1' }),
      CHANNELS,
      { kind: 'category', id: 1 },
    )
    expect(props.onWatch).not.toHaveBeenCalled()
  })

  it('canal sem arquivo mantém "Este programa já terminou."; fora dos dias explica o arquivo', async () => {
    const { handle, props } = await setup()
    press(handle, 'down')
    leftUntil(handle, 'Manhã Canal 2')
    select(handle)
    expect(props.onNotify).toHaveBeenLastCalledWith('Este programa já terminou.')

    press(handle, 'down')
    leftUntil(handle, 'Manhã Canal 3')
    select(handle)
    expect(props.onNotify).toHaveBeenLastCalledWith('Este programa já saiu do arquivo deste canal.')
    expect(props.onWatchArchive).not.toHaveBeenCalled()
  })

  it('reabre com o foco no programa de origem (volta do arquivo)', async () => {
    await setup({ initialChannelId: 'id-1', initialProgramStart: at(9) })
    expect(focusedBlock()?.textContent).toContain('Antes Canal 1')
  })
})
