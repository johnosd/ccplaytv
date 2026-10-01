/**
 * Feature 030, US1 — "Agora" na lista de canais além do contrato travado:
 * "Todos", virada de programa com o tempo (FR-028) e nenhuma rede ao mover
 * o foco (FR-029). Testes da fase, fora da trava.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render } from '@testing-library/react'
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
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 640 })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 400 })
  Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, value: 640 })
  Object.defineProperty(Element.prototype, 'scrollHeight', { configurable: true, value: 1_000_000 })
})
afterAll(() => {
  if (saved.offsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', saved.offsetHeight)
  if (saved.offsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', saved.offsetWidth)
  if (saved.clientHeight) Object.defineProperty(Element.prototype, 'clientHeight', saved.clientHeight)
  if (saved.scrollHeight) Object.defineProperty(Element.prototype, 'scrollHeight', saved.scrollHeight)
})

vi.mock('../catalog/catalogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalog/catalogApi')>()
  return {
    ...actual,
    useCategoryList: vi.fn(),
    useCategoryContent: vi.fn(),
    useCategoryFocusPrefetch: vi.fn(),
    fetchPlayback: vi.fn(),
    useAggregatedItems: vi.fn(),
  }
})

const SOURCE_ID = 'source-epg-extra'
const at = (hour: number, minute = 0) => Date.UTC(2026, 8, 29, hour, minute, 0)

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

function mockCatalog(items: CatalogItemOut[]) {
  const category: CatalogCategory = { id: 1, kind: 'channel', name: 'Notícias', order: 0, count: 0, fetchMode: 'on_demand', providerCategoryId: '1' }
  vi.mocked(catalogApi.useCategoryList).mockReturnValue({ data: [category], isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof catalogApi.useCategoryList>)
  vi.mocked(catalogApi.useCategoryContent).mockReturnValue({
    data: { items: [], totalCount: 0, outcome: 'fresh' },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof catalogApi.useCategoryContent>)
  vi.mocked(catalogApi.useAggregatedItems).mockReturnValue({ items, coveredCategories: 1, totalCategories: 1, isLoading: false })
}

function renderLive() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  render(
    <Wrapper>
      <LiveScreen sourceId={SOURCE_ID} onBack={vi.fn()} onResync={vi.fn()} />
    </Wrapper>,
  )
  return queryClient
}

function tap(key: string) {
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    document.body.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
  })
}

/**
 * Deixa a leitura de IndexedDB e os efeitos assentarem, sem depender de
 * `waitFor` (que usa `setInterval`, falsificado aqui). Com `check`, espera
 * até ele ser verdadeiro (até ~4 s, contado em iterações — `Date` também está
 * falsificado, então não dá para medir prazo pelo relógio); sem `check`, uma
 * espera curta. A espera condicional é o que mantém o teste estável quando a
 * suíte inteira disputa a CPU.
 */
const settle = async (check?: () => boolean) => {
  const iterations = check ? 80 : 1
  for (let i = 0; i < iterations; i += 1) {
    if (check?.()) return
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, check ? 50 : 60))
    })
  }
}

const previewIncludes = (text: string) => () => document.querySelector('.live-preview-panel')?.textContent?.includes(text) ?? false

function nowText(name: string): string | null {
  const nameEl = [...document.querySelectorAll<HTMLElement>('.live-item-name')].find((el) => el.textContent === name)
  return nameEl?.closest('.channel-row')?.querySelector('.channel-row-now')?.textContent ?? null
}

describe('LiveScreen — "Agora" (feature 030, US1)', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(at(10, 30))
    vi.mocked(catalogApi.fetchPlayback).mockImplementation(() => new Promise(() => {}))
    await db.sources.put({ id: SOURCE_ID, type: 'provider_credentials', displayName: 'Fonte', connectionState: 'synced', activeGeneration: 1, createdAt: 0, updatedAt: 0 })
    await writeEpgPrograms(SOURCE_ID, [
      { channelKey: 'a.br', start: at(10), end: at(11), title: 'Jornal da Manhã', description: 'Resumo das notícias do dia.' },
      { channelKey: 'a.br', start: at(11), end: at(12), title: 'Esporte Total' },
      { channelKey: 'a.br', start: at(13), end: at(14), title: 'Cinema em Casa' },
    ])
  })

  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    await deleteEpgForSource(SOURCE_ID).catch(() => {})
    await db.sources.delete(SOURCE_ID)
  })

  it('"Todos" também mostra o programa atual (FR-024)', async () => {
    mockCatalog([channel('Canal Com Guia', 'a.br'), channel('Canal Sem Guia', null)])
    renderLive()
    tap('ArrowUp') // da 1ª categoria real para "Todos"
    tap('ArrowRight') // entra
    await settle(() => nowText('Canal Com Guia') === 'Jornal da Manhã')

    expect(nowText('Canal Com Guia')).toBe('Jornal da Manhã')
    expect(nowText('Canal Sem Guia')).toBe('')
  })

  it('o programa vira quando o horário passa, sem sair da tela (FR-028)', async () => {
    mockCatalog([channel('Canal Com Guia', 'a.br')])
    renderLive()
    tap('ArrowUp')
    tap('ArrowRight')
    await settle(() => nowText('Canal Com Guia') === 'Jornal da Manhã')
    expect(nowText('Canal Com Guia')).toBe('Jornal da Manhã')

    await act(async () => {
      vi.setSystemTime(at(11, 5))
      vi.advanceTimersByTime(30_000)
    })
    await settle(() => nowText('Canal Com Guia') === 'Esporte Total')

    expect(nowText('Canal Com Guia')).toBe('Esporte Total')
  })

  it('depois que o último programa acaba, o slot esvazia — nunca fica o programa encerrado (FR-030)', async () => {
    mockCatalog([channel('Canal Com Guia', 'a.br')])
    renderLive()
    tap('ArrowUp')
    tap('ArrowRight')
    await settle(() => nowText('Canal Com Guia') === 'Jornal da Manhã')

    await act(async () => {
      vi.setSystemTime(at(15)) // depois do último programa (13:00–14:00)
      vi.advanceTimersByTime(30_000)
    })
    await settle(() => nowText('Canal Com Guia') === '')

    expect(nowText('Canal Com Guia')).toBe('')
    expect(document.querySelector('.channel-row-progress')).toBeNull()
  })

  it('mover o foco entre canais nunca dispara rede (FR-029)', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    mockCatalog([channel('Canal A', 'a.br'), channel('Canal B', 'a.br'), channel('Canal C', null)])
    renderLive()
    tap('ArrowUp')
    tap('ArrowRight')
    await settle(() => nowText('Canal A') === 'Jornal da Manhã')

    tap('ArrowDown')
    tap('ArrowDown')
    tap('ArrowUp')
    await settle()

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  // US3 (FR-025): preview do canal em foco.
  it('preview: "Agora" com título, horário, barra e sinopse, e "A seguir" com título e horário', async () => {
    mockCatalog([channel('Canal Com Guia', 'a.br')])
    renderLive()
    tap('ArrowUp')
    tap('ArrowRight')
    await settle(previewIncludes('A seguir'))

    const preview = document.querySelector('.live-preview-panel') as HTMLElement
    expect(preview).not.toBeNull()
    expect(preview.textContent).toContain('Agora')
    expect(preview.textContent).toContain('Jornal da Manhã')
    expect(preview.textContent).toContain('Resumo das notícias do dia.')
    expect(preview.textContent).toContain('A seguir')
    expect(preview.textContent).toContain('Esporte Total')
    const times = [...preview.querySelectorAll('.live-epg-time')].map((el) => el.textContent)
    expect(times).toHaveLength(2)
    for (const range of times) expect(range).toMatch(/^\d{2}:\d{2} – \d{2}:\d{2}$/)
    expect(preview.querySelector('.live-epg-progress-fill')).not.toBeNull()
  })

  it('preview numa lacuna: só "A seguir", sem "Agora" nem barra (FR-030)', async () => {
    vi.setSystemTime(at(12, 30))
    mockCatalog([channel('Canal Com Guia', 'a.br')])
    renderLive()
    tap('ArrowUp')
    tap('ArrowRight')
    await settle(previewIncludes('Cinema em Casa'))

    const preview = document.querySelector('.live-preview-panel') as HTMLElement
    expect(preview.textContent).not.toContain('Agora')
    expect(preview.textContent).toContain('A seguir')
    expect(preview.textContent).toContain('Cinema em Casa')
    expect(preview.querySelector('.live-epg-progress')).toBeNull()
  })

  it('preview de canal sem EPG: área vazia, nenhum rótulo solto', async () => {
    mockCatalog([channel('Canal Sem Guia', null)])
    renderLive()
    tap('ArrowUp')
    tap('ArrowRight')
    await settle(() => nowText('Canal Sem Guia') !== null)
    await settle()

    const preview = document.querySelector('.live-preview-panel') as HTMLElement
    expect(preview).not.toBeNull()
    expect(preview.textContent).not.toContain('Agora')
    expect(preview.textContent).not.toContain('A seguir')
    expect(preview.querySelector('.live-channel-now')?.textContent).toBe('')
  })

  it('EPG desativado (programação apagada): slots vazios, sem erro', async () => {
    await deleteEpgForSource(SOURCE_ID)
    mockCatalog([channel('Canal Com Guia', 'a.br')])
    renderLive()
    tap('ArrowUp')
    tap('ArrowRight')
    await settle(() => nowText('Canal Com Guia') !== null)
    await settle()

    expect(nowText('Canal Com Guia')).toBe('')
  })
})
