/**
 * Contrato da feature 031 (EPG — Guia completo) — travado em
 * `sdd/specs/031-epg-guia-completo/contract-tests.lock`. O sdd-execute só
 * pode fazê-lo passar, nunca editá-lo.
 *
 * Seletores fixados por este contrato (fonte de verdade — o plan.md não os
 * repete em prosa):
 * - `.epg-guide`: raiz do guia.
 * - `.epg-guide-row`: uma linha de canal; dentro dela, `.epg-guide-channel-name`.
 * - `.epg-guide-block`: um bloco de programa; modificadores `.is-now` (em
 *   exibição), `.is-past` (encerrado, esmaecido) e `.is-empty` (o bloco
 *   "Sem programação" de um canal sem EPG). O foco de estado é `.tv-focus`.
 * - `.epg-guide-detail`: o painel de detalhe do topo.
 * - `.epg-guide-now-line`: a linha vertical da hora atual.
 *
 * O guia não registra teclado: o contrato o aciona pelo `EpgGuideHandle`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { createRef, type ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { EpgGuide, type EpgGuideHandle, type EpgGuideProps } from './EpgGuide'
import * as catalogApi from '../../catalog/catalogApi'
import type { CatalogCategory, CatalogItemOut } from '../../catalog/catalogApi'
import { db } from '../../../lib/catalog/db'
import { deleteEpgForSource, writeEpgPrograms } from '../../../lib/epg/epgRepository'

// jsdom não faz layout, e as linhas do guia são virtualizadas (mesmos mocks dos contratos da Live TV).
const saved: Record<string, PropertyDescriptor | undefined> = {}
beforeAll(() => {
  saved.offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
  saved.offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
  saved.clientHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight')
  saved.scrollHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight')
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 640 })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 1344 })
  Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, value: 640 })
  Object.defineProperty(Element.prototype, 'scrollHeight', { configurable: true, value: 1_000_000 })
})
afterAll(() => {
  if (saved.offsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', saved.offsetHeight)
  if (saved.offsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', saved.offsetWidth)
  if (saved.clientHeight) Object.defineProperty(Element.prototype, 'clientHeight', saved.clientHeight)
  if (saved.scrollHeight) Object.defineProperty(Element.prototype, 'scrollHeight', saved.scrollHeight)
})

vi.mock('../../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../catalog/catalogApi')>()
  return {
    ...actual,
    useCategoryContent: vi.fn(),
    useFavoritesContent: vi.fn(),
    useAggregatedItems: vi.fn(),
    // `useEpgPrograms` (feature 030) e `useSources`: reais, contra `db` (fake-indexeddb).
  }
})

const SOURCE_ID = 'source-guia'
const at = (hour: number, minute = 0) => new Date(2026, 8, 29, hour, minute, 0, 0).getTime()

const channel = (name: string, epgId: string | null): CatalogItemOut => ({
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
})

const CHANNELS = [channel('Canal A', 'a.br'), channel('Canal B', 'b.br'), channel('Canal Sem Guia', null)]
const CATEGORY: CatalogCategory = { id: 1, kind: 'channel', name: 'Notícias', order: 0, count: 3, fetchMode: 'on_demand', providerCategoryId: '1' }

function mockLists() {
  vi.mocked(catalogApi.useCategoryContent).mockReturnValue({
    data: { items: CHANNELS, totalCount: CHANNELS.length, outcome: 'fresh' },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryContent>)
  vi.mocked(catalogApi.useFavoritesContent).mockReturnValue({
    data: { items: [], unresolved: 0 },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof catalogApi.useFavoritesContent>)
  vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({ items: [], coveredCategories: 0, totalCategories: 1, isLoading: false })
}

function renderGuide() {
  const handle = createRef<EpgGuideHandle>()
  const onWatch = vi.fn<EpgGuideProps['onWatch']>()
  const onClose = vi.fn<EpgGuideProps['onClose']>()
  const onNotify = vi.fn<NonNullable<EpgGuideProps['onNotify']>>()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  render(
    <Wrapper>
      <EpgGuide
        sourceId={SOURCE_ID}
        categories={[CATEGORY]}
        initialList={{ kind: 'category', id: 1 }}
        initialChannelId="id-Canal A"
        onWatch={onWatch}
        onClose={onClose}
        onNotify={onNotify}
        handleRef={handle}
      />
    </Wrapper>,
  )
  return { handle, onWatch, onClose, onNotify }
}

const press = (handle: { current: EpgGuideHandle | null }, direction: 'up' | 'down' | 'left' | 'right') =>
  act(() => handle.current!.onDirection(direction))

const focusedBlock = () => document.querySelector<HTMLElement>('.epg-guide-block.tv-focus')
const detailText = () => document.querySelector('.epg-guide-detail')?.textContent ?? ''
const blockNamed = (title: string) =>
  [...document.querySelectorAll<HTMLElement>('.epg-guide-block')].find((el) => el.textContent?.includes(title))

describe('EpgGuide — contrato da feature 031', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(at(10, 30))
    mockLists()
    await db.sources.put({
      id: SOURCE_ID,
      type: 'provider_credentials',
      displayName: 'Fonte com EPG',
      // Credencial de painel: é o que faz o EPG contar como "vinculado" (feature 030) — sem ela o guia mostraria a tela de "sem programação".
      providerDns: 'http://painel.test',
      providerUsername: 'usuario-teste',
      providerPassword: 'senha-teste',
      connectionState: 'synced',
      activeGeneration: 1,
      epgLastSyncAt: at(10),
      createdAt: 0,
      updatedAt: 0,
    })
    await writeEpgPrograms(SOURCE_ID, [
      { channelKey: 'a.br', start: at(10), end: at(10, 20), title: 'Boletim' },
      { channelKey: 'a.br', start: at(10, 20), end: at(11), title: 'Jornal da Manhã', description: 'Resumo do dia.' },
      { channelKey: 'a.br', start: at(11), end: at(12), title: 'Esporte Total' },
      { channelKey: 'b.br', start: at(10), end: at(12), title: 'Cinema em Casa' },
    ])
  })

  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    vi.useRealTimers()
    await deleteEpgForSource(SOURCE_ID).catch(() => {})
    await db.sources.delete(SOURCE_ID)
  })

  // US1/AC1-AC3, US2/AC5-AC6, FR-002, FR-003, FR-005, FR-006, FR-007, FR-008, FR-020, FR-021, FR-012, FR-019, Constitution: "Foco Visível e Sem Becos Sem Saída"
  it('abre no programa atual do canal de origem, marca o agora, esmaece o encerrado, alcança o canal sem EPG, e OK/RETURN agem', async () => {
    const { handle, onWatch, onClose, onNotify } = renderGuide()
    await waitFor(() => expect(blockNamed('Jornal da Manhã')).toBeDefined())

    // Foco inicial: o programa em exibição do canal de origem, com o detalhe dele no painel do topo (FR-006/FR-009).
    expect(focusedBlock()?.textContent).toContain('Jornal da Manhã')
    expect(document.querySelectorAll('.tv-focus')).toHaveLength(1) // um único foco visível
    expect(detailText()).toContain('Jornal da Manhã')
    expect(detailText()).toContain('Canal A')
    expect(detailText()).toContain('Agora')
    expect(detailText()).toContain('Resumo do dia.')

    // Marcador "Agora" no programa em exibição de cada canal, linha da hora atual, encerrado esmaecido (FR-002/FR-003).
    expect(blockNamed('Jornal da Manhã')?.classList.contains('is-now')).toBe(true)
    expect(blockNamed('Cinema em Casa')?.classList.contains('is-now')).toBe(true)
    expect(blockNamed('Boletim')?.classList.contains('is-past')).toBe(true)
    expect(blockNamed('Esporte Total')?.classList.contains('is-past')).toBe(false)
    expect(document.querySelector('.epg-guide-now-line')).not.toBeNull()

    // ↓ ↓: o canal sem EPG tem um único bloco focável "Sem programação" (FR-007) — a linha não é pulada.
    await press(handle, 'down')
    expect(focusedBlock()?.textContent).toContain('Cinema em Casa')
    await press(handle, 'down')
    expect(focusedBlock()?.classList.contains('is-empty')).toBe(true)
    expect(focusedBlock()?.textContent).toContain('Sem programação')
    expect(document.querySelectorAll('.tv-focus')).toHaveLength(1)

    // OK nele assiste o canal, entregando a lista exibida como vizinhança (FR-020).
    act(() => handle.current!.onSelect())
    expect(onWatch).toHaveBeenCalledTimes(1)
    const [watched, list, listKey] = onWatch.mock.calls[0]
    expect(watched.name).toBe('Canal Sem Guia')
    expect(list.map((item) => item.name)).toEqual(['Canal A', 'Canal B', 'Canal Sem Guia'])
    expect(listKey).toEqual({ kind: 'category', id: 1 })

    // OK num programa já encerrado não abre nada — só um retorno discreto (FR-021).
    await press(handle, 'up')
    await press(handle, 'up') // volta ao Canal A
    await press(handle, 'left') // Jornal → Boletim (encerrado)
    expect(focusedBlock()?.textContent).toContain('Boletim')
    act(() => handle.current!.onSelect())
    expect(onWatch).toHaveBeenCalledTimes(1)
    expect(onNotify).toHaveBeenCalledWith('Este programa já terminou.')

    // RETURN na camada base fecha o guia (FR-012).
    act(() => handle.current!.onBack())
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
