/**
 * Feature 031, US2 — navegar no tempo: abas Hoje/Amanhã, barra ↔ grade, CH±
 * (`onPage`), reconciliação quando a programação muda com o guia aberto.
 * Testes da fase, fora da trava.
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

const saved: Record<string, PropertyDescriptor | undefined> = {}
beforeAll(() => {
  saved.offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
  saved.clientHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight')
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 640 })
  Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, value: 640 }) // 7 linhas de 84px
})
afterAll(() => {
  if (saved.offsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', saved.offsetHeight)
  if (saved.clientHeight) Object.defineProperty(Element.prototype, 'clientHeight', saved.clientHeight)
})

vi.mock('../../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../catalog/catalogApi')>()
  return { ...actual, useCategoryContent: vi.fn(), useFavoritesContent: vi.fn(), useAggregatedItems: vi.fn(), useEpgPrograms: vi.fn() }
})

const SOURCE_ID = 'source-guia-nav'
const at = (day: number, hour: number, minute = 0) => new Date(2026, 8, day, hour, minute, 0, 0).getTime()
const CATEGORY: CatalogCategory = { id: 1, kind: 'channel', name: 'Notícias', order: 0, count: 10, fetchMode: 'on_demand', providerCategoryId: '1' }

const channel = (n: number): CatalogItemOut => ({
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
})
const CHANNELS = Array.from({ length: 10 }, (_, index) => channel(index + 1))

type RawProgram = { channelKey: string; start: number; end: number; title: string }
function lookupOf(programs: RawProgram[]): EpgLookup {
  const byKey = new Map<string, RawProgram[]>()
  for (const program of programs) byKey.set(program.channelKey, [...(byKey.get(program.channelKey) ?? []), program])
  return { byKey, offsetMs: 0 } as unknown as EpgLookup
}

const basePrograms = (): RawProgram[] =>
  CHANNELS.flatMap((item) => [
    { channelKey: item.epg_channel_id!, start: at(29, 10), end: at(29, 11), title: `Agora ${item.name}` },
    { channelKey: item.epg_channel_id!, start: at(30, 8), end: at(30, 9), title: `Amanhã ${item.name}` },
  ])

function mockData(programs: RawProgram[]) {
  vi.mocked(catalogApi.useCategoryContent).mockReturnValue({
    data: { items: CHANNELS, totalCount: CHANNELS.length, outcome: 'fresh' },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryContent>)
  vi.mocked(catalogApi.useFavoritesContent).mockReturnValue({ data: { items: [], unresolved: 0 }, isLoading: false, isError: false } as unknown as ReturnType<typeof catalogApi.useFavoritesContent>)
  vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({ items: [], coveredCategories: 0, totalCategories: 1, isLoading: false })
  vi.mocked(catalogApi.useEpgPrograms).mockReturnValue({ data: lookupOf(programs) } as unknown as ReturnType<typeof catalogApi.useEpgPrograms>)
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
    handleRef: handle,
    ...overrides,
  }
  const view = render(<EpgGuide {...props} />, { wrapper: Wrapper })
  await screen.findByRole('tablist') // o corpo só vira grade depois que a fonte carrega
  return { handle, props, rerender: () => view.rerender(<EpgGuide {...props} />) }
}

const press = (handle: { current: EpgGuideHandle | null }, ...directions: ('up' | 'down' | 'left' | 'right')[]) =>
  directions.forEach((direction) => act(() => handle.current!.onDirection(direction))) // uma `act` por tecla: o handle só atualiza a cada render
const focusedBlock = () => document.querySelector('.epg-guide-block.tv-focus')?.textContent ?? ''
const detailChannel = () => document.querySelector('.epg-guide-detail-channel')?.textContent ?? ''
const activeTab = () => document.querySelector('.epg-guide-tab.is-active')?.textContent ?? null
const barFocus = () => document.querySelector('.epg-guide-bar .tv-focus')?.textContent ?? null

describe('EpgGuide — navegação no tempo (US2)', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(at(29, 10, 30))
    await db.sources.put({
      id: SOURCE_ID,
      type: 'provider_credentials',
      displayName: 'Fonte',
      providerDns: 'http://painel.test',
      providerUsername: 'u',
      providerPassword: 'p',
      connectionState: 'synced',
      activeGeneration: 1,
      epgLastSyncAt: at(29, 10),
      createdAt: 0,
      updatedAt: 0,
    })
    mockData(basePrograms())
  })
  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    vi.useRealTimers()
    await db.sources.delete(SOURCE_ID)
  })

  it('abre em "Hoje"; ↑ da 1ª linha vai à barra e ↓ volta ao mesmo bloco', async () => {
    const { handle } = await setup()
    expect(activeTab()).toBe('Hoje')
    expect(focusedBlock()).toContain('Agora Canal 1')

    press(handle, 'up')
    expect(barFocus()).toBe('Notícias') // o seletor de lista
    expect(document.querySelectorAll('.tv-focus')).toHaveLength(1)

    press(handle, 'down')
    expect(focusedBlock()).toContain('Agora Canal 1')
    expect(document.querySelectorAll('.tv-focus')).toHaveLength(1)
  })

  it('aba "Amanhã" leva ao primeiro programa de amanhã (a janela o alcança) e "Hoje" volta ao programa atual', async () => {
    const { handle } = await setup()

    press(handle, 'up', 'right', 'right') // seletor → Hoje → Amanhã
    expect(barFocus()).toBe('Amanhã')
    act(() => handle.current!.onSelect())

    expect(activeTab()).toBe('Amanhã')
    expect(focusedBlock()).toContain('Amanhã Canal 1') // visível: a janela foi até as 08:00
    expect(document.querySelector('.epg-guide-detail-channel')?.textContent).toBe('Canal 1')

    press(handle, 'up', 'left') // barra → Hoje
    expect(barFocus()).toBe('Hoje')
    act(() => handle.current!.onSelect())
    expect(activeTab()).toBe('Hoje')
    expect(focusedBlock()).toContain('Agora Canal 1')
  })

  it('a aba ativa acompanha a hora focada ao andar com → até o dia seguinte', async () => {
    const { handle } = await setup()
    expect(activeTab()).toBe('Hoje')
    press(handle, 'right') // próximo programa de Canal 1: amanhã 08:00
    expect(focusedBlock()).toContain('Amanhã Canal 1')
    expect(activeTab()).toBe('Amanhã')
  })

  // A virada da meia-noite (`dayOfTime`) é coberta pelo contrato 1 (`guideGrid`); o `useNow` tica
  // por timer real, que este arquivo não falsifica.

  it('onPage (CH±) salta linhas visíveis − 1, satura nas pontas e preserva a coluna de tempo', async () => {
    const { handle } = await setup()
    expect(detailChannel()).toBe('Canal 1')

    act(() => handle.current!.onPage('next')) // 7 linhas visíveis → salta 6
    expect(detailChannel()).toBe('Canal 7')
    act(() => handle.current!.onPage('next'))
    expect(detailChannel()).toBe('Canal 10') // satura
    act(() => handle.current!.onPage('next'))
    expect(detailChannel()).toBe('Canal 10')
    expect(focusedBlock()).toContain('Agora Canal 10') // mesma coluna de tempo

    act(() => handle.current!.onPage('previous'))
    expect(detailChannel()).toBe('Canal 4')
    act(() => handle.current!.onPage('previous'))
    act(() => handle.current!.onPage('previous'))
    expect(detailChannel()).toBe('Canal 1')
  })

  it('onPage não age na barra nem com o seletor aberto', async () => {
    const { handle } = await setup()
    press(handle, 'up')
    act(() => handle.current!.onPage('next'))
    expect(barFocus()).toBe('Notícias')

    act(() => handle.current!.onSelect()) // abre o seletor
    act(() => handle.current!.onPage('next'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('reconcilia por id + início quando o programa focado some: reancora no mais próximo do mesmo canal', async () => {
    const { handle, rerender } = await setup()
    press(handle, 'down') // Canal 2, "Agora Canal 2"
    expect(focusedBlock()).toContain('Agora Canal 2')

    // A programação é reescrita: some o programa focado, entra outro na mesma hora.
    mockData([
      { channelKey: 'c2.br', start: at(29, 10, 15), end: at(29, 12), title: 'Novo Canal 2' },
      ...basePrograms().filter((program) => program.channelKey !== 'c2.br'),
    ])
    act(() => rerender())

    expect(detailChannel()).toBe('Canal 2') // o canal não muda
    expect(focusedBlock()).toContain('Novo Canal 2')
    expect(document.querySelectorAll('.tv-focus')).toHaveLength(1)
  })

  it('programa que terminou fica esmaecido e OK avisa em vez de tocar', async () => {
    const onNotify = vi.fn()
    mockData([{ channelKey: 'c1.br', start: at(29, 8), end: at(29, 10), title: 'Já acabou' }, ...basePrograms().filter((program) => program.channelKey !== 'c1.br')])
    const { handle, props } = await setup({ onNotify, initialChannelId: 'id-1' })

    press(handle, 'left', 'left') // qualquer movimento; o foco de abertura já é o mais próximo
    const past = [...document.querySelectorAll('.epg-guide-block.is-past')].map((el) => el.textContent)
    expect(past.some((text) => text?.includes('Já acabou'))).toBe(true)

    // Foca-o explicitamente e ativa.
    while (!focusedBlock().includes('Já acabou') && document.querySelector('.epg-guide-block.tv-focus')) {
      const before = focusedBlock()
      press(handle, 'left')
      if (focusedBlock() === before) break
    }
    act(() => handle.current!.onSelect())
    expect(onNotify).toHaveBeenCalledWith('Este programa já terminou.')
    expect(props.onWatch).not.toHaveBeenCalled()
  })
})
