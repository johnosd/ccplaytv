/**
 * Teste de CONTRATO da feature 060 (Home no layout "Vitrine expandida"). Travado em
 * `sdd/specs/060-home-vitrine-expandida/contract-tests.lock`. O sdd-execute só pode fazê-lo passar, nunca editá-lo.
 *
 * Seletores fixados por este contrato (fonte de verdade):
 * - `section.home-hero[data-state]`: o billboard; `data-state="expanded"` com o foco nele, `"collapsed"` com o foco nas
 *   fileiras.
 * - `section.home-row[aria-label]`: cada fileira; o elemento focado tem `tv-focus` (um só na tela) e fica dentro da raiz
 *   do card, que carrega `data-item-id` = id do item no catálogo.
 * - `.home-ambient img`: o fundo ambiente; quando existe imagem, o `src` é o backdrop do item focado já guardado no
 *   aparelho (`titleMetadata`).
 * Teclas: setas e Enter disparados no `document.body` (como os outros testes da Home).
 */
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { HomeContent, type HomeContentProps } from './HomeContent'
import { AnnouncerContext } from '../../lib/announcer'
import { db } from '../../lib/catalog/db'
import { buildStableId, updateProgress } from '../../lib/catalog/userStateRepository'
import { PROVIDER_FIELDS_VERSION } from '../../lib/metadata/titleMetadataStore'

const SOURCE_ID = 'source-home-060'
const BETA_BACKDROP = 'https://img.example.org/beta-backdrop.jpg'

let restoreOffsetWidth: PropertyDescriptor | undefined
beforeAll(() => {
  restoreOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 1600 })
})
afterAll(() => {
  if (restoreOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', restoreOffsetWidth)
})

afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await db.sources.delete(SOURCE_ID)
  await db.channels.where('sourceId').equals(SOURCE_ID).delete()
  await db.userStates.where('sourceId').equals(SOURCE_ID).delete()
  await db.titleMetadata.where('sourceId').equals(SOURCE_ID).delete()
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

const movieStableId = (streamId: string) => buildStableId({ sourceId: SOURCE_ID, kind: 'movie', providerStreamId: streamId })

/** Dois filmes em "Continuar assistindo"; só o Beta tem backdrop guardado no aparelho (aberto antes num detalhe). */
async function seedContinue(): Promise<{ alphaId: number; betaId: number }> {
  await seedSource()
  const alphaId = await seedMovie('Alpha', 'a1')
  const betaId = await seedMovie('Beta', 'b1')
  await updateProgress(movieStableId('a1'), SOURCE_ID, 300, db)
  await updateProgress(movieStableId('b1'), SOURCE_ID, 600, db)
  await db.titleMetadata.put({
    stableId: movieStableId('b1'),
    sourceId: SOURCE_ID,
    kind: 'movie',
    provider: { backdropUrl: BETA_BACKDROP },
    providerFetchedAt: Date.now(),
    providerVersion: PROVIDER_FIELDS_VERSION,
  })
  return { alphaId, betaId }
}

function press(key: string) {
  fireEvent.keyDown(document.body, { key, bubbles: true })
}

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
  render(<HomeContent {...props} />, { wrapper: Wrapper })
  return props
}

const billboard = () => document.querySelector('section.home-hero')
const focused = () => document.querySelector('.home-content .tv-focus')
const focusedRow = () => focused()?.closest('section.home-row')?.getAttribute('aria-label') ?? null
const focusedItemId = () => focused()?.closest('[data-item-id]')?.getAttribute('data-item-id') ?? null

describe('HomeContent — contrato da feature 060', () => {
  // US1/AC1, US1/AC3, US1/AC5; FR-003, FR-006, FR-019
  it('abre no billboard expandido com o foco em "Continuar"; ↓ recolhe o billboard e foca o 1º card da 1ª fileira; ↑ volta à ação e expande', async () => {
    await seedContinue()
    renderHome()

    await waitFor(() => expect(screen.getByRole('button', { name: /Continuar/ })).toHaveClass('tv-focus'))
    await waitFor(() => expect(document.querySelector('section.home-row[aria-label="Continuar assistindo"]')).not.toBeNull())
    expect(billboard()?.getAttribute('data-state')).toBe('expanded')

    press('ArrowDown')
    expect(billboard()?.getAttribute('data-state')).toBe('collapsed')
    expect(focusedRow()).toBe('Continuar assistindo')
    expect(document.querySelectorAll('.home-content .tv-focus')).toHaveLength(1)

    press('ArrowUp')
    expect(billboard()?.getAttribute('data-state')).toBe('expanded')
    expect(screen.getByRole('button', { name: /Continuar/ })).toHaveClass('tv-focus')
  })

  // US1/AC4; FR-007, FR-022, SC-004; Constitution: "Foco Visível e Sem Becos Sem Saída" (focar não reproduz nem consulta)
  it('andar pelos cards não reproduz nem faz requisição; o fundo ambiente passa a ser o backdrop guardado do card em que o foco para', async () => {
    const { betaId } = await seedContinue()
    const props = renderHome()
    await waitFor(() => expect(screen.getByRole('button', { name: /Continuar/ })).toHaveClass('tv-focus'))
    await waitFor(() => expect(document.querySelector('section.home-row[aria-label="Continuar assistindo"]')).not.toBeNull())

    // Depois do carregamento inicial: daqui em diante só o foco se move.
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    press('ArrowDown')
    // Para no card do Beta, seja qual for a ordem da fileira.
    if (focusedItemId() !== String(betaId)) press('ArrowRight')
    expect(focusedItemId()).toBe(String(betaId))

    await waitFor(() => expect(document.querySelector('.home-ambient img')?.getAttribute('src')).toBe(BETA_BACKDROP))
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(props.onPlay).not.toHaveBeenCalled()
    expect(props.onOpenItem).not.toHaveBeenCalled()
  })

  // US1/AC6; FR-020; Constitution: "Voltar Restaura Foco e Posição" (por id, não por índice)
  it('voltando com o foco num card (por id), a Home abre já com o billboard recolhido e o mesmo card focado', async () => {
    const { betaId } = await seedContinue()
    renderHome({ initialFocus: { zone: 'rail', rail: 'continue', itemId: String(betaId) } })

    await waitFor(() => expect(focusedItemId()).toBe(String(betaId)))
    expect(focusedRow()).toBe('Continuar assistindo')
    expect(billboard()?.getAttribute('data-state')).toBe('collapsed')
    expect(document.querySelectorAll('.home-content .tv-focus')).toHaveLength(1)
  })
})
