import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRef, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/catalog/db'
import { storeCategories } from '../../lib/catalog/catalogRepository'
import { listManagedCategories, listVisibleCategories, notifyCategoryAccessChanged } from '../../lib/catalog/categoryAccess'
import { enableParentalControl, hasPin, verifyPin } from '../../lib/parental/listPin'
import { findUnnamedControls } from '../../testing/accessibleNames'
import { ParentalTab } from './tabs/ParentalTab'
import type { ListSettingsTabProps, SettingsTabHandle } from './tabs/settingsTab'
import type { SourceOut } from '../import/importApi'

const SOURCE = 'fonte-aba-066'
const OTHER = 'outra-aba-067'
const sourceOut = (id: string, name: string) => ({ id, display_name: name }) as SourceOut

async function seed() {
  await db.sources.put({ id: SOURCE, type: 'm3u_url', displayName: 'Sala', connectionState: 'synced', activeGeneration: 1, createdAt: 0, updatedAt: 0 })
  await storeCategories(
    [
      { sourceId: SOURCE, generation: 1, kind: 'channel', fetchMode: 'eager', name: 'Notícias', order: 0 },
      { sourceId: SOURCE, generation: 1, kind: 'channel', fetchMode: 'eager', name: 'Esportes', order: 1 },
      { sourceId: SOURCE, generation: 1, kind: 'movie', fetchMode: 'eager', name: 'Ação', order: 0, providerCategoryId: '7' },
    ],
    db,
  )
}

function renderTab(overrides: Partial<ListSettingsTabProps> = {}) {
  const handle = createRef<SettingsTabHandle>()
  const props: ListSettingsTabProps = {
    focused: true,
    source: sourceOut(SOURCE, 'Sala'),
    activeSourceId: SOURCE,
    navigation: { onEditSource: vi.fn(), onResyncStarted: vi.fn(), onOpenEpg: vi.fn(), onSourceDeleted: vi.fn() },
    exitToTabs: vi.fn(),
    showToast: vi.fn(),
    handleRef: handle,
    ...overrides,
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  render(<ParentalTab {...props} />, { wrapper: Wrapper })
  const press = (action: (current: SettingsTabHandle) => void) => act(() => action(handle.current as SettingsTabHandle))
  return { props, press }
}

/** Nome do que tem o foco: o nome acessível (interruptor, células) ou o texto. */
const focusedText = () => { const el = document.querySelector('.parental-panel .tv-focus'); return el?.getAttribute('aria-label') ?? el?.textContent }
const typePin = async (pin: string) => {
  await act(async () => {
    for (const digit of pin) fireEvent.keyDown(document.body, { key: digit, bubbles: true })
  })
}

beforeEach(async () => {
  await seed()
})

afterEach(async () => {
  cleanup()
  await Promise.all([db.categories.clear(), db.sources.clear(), db.table('categoryPreferences').clear(), db.table('parentalPins').clear()])
  notifyCategoryAccessChanged() // a regra guardada em memória não vê limpeza direta das tabelas
})

describe('ParentalTab — gestão de categorias (feature 066, US1)', () => {
  it('lista as categorias da seção na ordem da lista; mover nas seções troca a seção', async () => {
    const { press } = renderTab()
    await screen.findByText('Notícias')
    expect([...document.querySelectorAll('.parental-row-name')].map((el) => el.textContent)).toEqual(['Notícias', 'Esportes'])
    expect(focusedText()).toBe('Controle parental: Desligado')

    press((h) => h.onDirection('down'))
    expect(focusedText()).toBe('Canais')
    press((h) => h.onDirection('right'))
    await screen.findByText('Ação')
    expect(focusedText()).toBe('Filmes')
    expect(screen.queryByText('Notícias')).toBeNull()
  })

  it('OK esconde a categoria focada, o foco fica na mesma linha (por id) e a trilha não a mostra mais', async () => {
    const { press } = renderTab()
    await screen.findByText('Esportes')
    for (let i = 0; i < 3; i += 1) press((h) => h.onDirection('down')) // controle -> seções -> Notícias -> Esportes
    expect(document.querySelector('.parental-row .tv-focus')?.getAttribute('aria-label')).toBe('Esportes: Visível')

    press((h) => h.onSelect())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Esportes: Escondida' })).toHaveClass('tv-focus'))
    expect((await listVisibleCategories(SOURCE, 'channel')).map((category) => category.name)).toEqual(['Notícias'])

    press((h) => h.onSelect())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Esportes: Visível' })).toHaveClass('tv-focus'))
  })

  it('↑ na primeira categoria volta às seções, ↑ de novo ao controle (sem topbar na tela da lista, fica nele); ← sai para a coluna de abas', async () => {
    const { props, press } = renderTab()
    await screen.findByText('Notícias')
    press((h) => h.onDirection('down'))
    press((h) => h.onDirection('down'))
    press((h) => h.onDirection('up'))
    expect(focusedText()).toBe('Canais')
    press((h) => h.onDirection('up'))
    expect(focusedText()).toBe('Controle parental: Desligado')
    press((h) => h.onDirection('up'))
    expect(focusedText()).toBe('Controle parental: Desligado')
    press((h) => h.onDirection('left'))
    expect(props.exitToTabs).toHaveBeenCalledTimes(1)
  })

  it('seção sem categorias: explica, e as seções continuam focáveis; todo controle tem nome', async () => {
    const { press } = renderTab()
    await screen.findByText('Notícias')
    press((h) => h.onDirection('down'))
    press((h) => h.onDirection('right'))
    press((h) => h.onDirection('right'))
    expect(await screen.findByText('Esta lista ainda não tem categorias nesta seção.')).toBeInTheDocument()
    expect(focusedText()).toBe('Séries')
    expect(findUnnamedControls(document.body).map((f) => f.description)).toEqual([])
  })

  it('067 (D-005): numa lista que não é a ativa, a gestão mostra e altera as categorias DESSA lista, sem tocar a ativa', async () => {
    await db.sources.put({ id: OTHER, type: 'm3u_url', displayName: 'Quarto', connectionState: 'synced', activeGeneration: 1, createdAt: 0, updatedAt: 0 })
    await storeCategories([{ sourceId: OTHER, generation: 1, kind: 'channel', fetchMode: 'eager', name: 'Desenhos', order: 0 }], db)
    const { press } = renderTab({ source: sourceOut(OTHER, 'Quarto') })
    await screen.findByText('Desenhos')
    expect(screen.queryByText('Notícias')).toBeNull()
    press((h) => h.onDirection('down'))
    press((h) => h.onDirection('down'))
    press((h) => h.onSelect())
    await waitFor(async () => expect((await listVisibleCategories(OTHER, 'channel')).map((category) => category.name)).toEqual([]))
    expect((await listVisibleCategories(SOURCE, 'channel')).map((category) => category.name)).toEqual(['Notícias', 'Esportes'])
  })
})

describe('ParentalTab — bloquear com PIN (feature 066, US2)', () => {
  it('bloquear sem PIN cria o PIN (duas vezes iguais) e bloqueia a categoria; cancelar não grava nada', async () => {
    const { press } = renderTab()
    await screen.findByText('Notícias')
    press((h) => h.onDirection('down'))
    press((h) => h.onDirection('down'))
    press((h) => h.onDirection('right'))
    expect(document.querySelector('.parental-row .tv-focus')?.getAttribute('aria-label')).toBe('Notícias: Livre')

    // Ligar começa pela sugestão adulta (nenhuma nesta lista): Confirmar focado. Cancelar o PIN depois não grava nada.
    press((h) => h.onSelect())
    expect(await screen.findByText('Nenhuma categoria adulta encontrada nesta lista.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar' })).toHaveClass('tv-focus')
    fireEvent.keyDown(document.body, { key: 'Enter', bubbles: true })
    expect(await screen.findByRole('dialog', { name: 'Crie um PIN de 4 dígitos' })).toBeInTheDocument()
    fireEvent.keyDown(document.body, { key: 'Escape', bubbles: true })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await hasPin(SOURCE)).toBe(false)

    press((h) => h.onSelect())
    await screen.findByRole('button', { name: 'Confirmar' })
    fireEvent.keyDown(document.body, { key: 'Enter', bubbles: true })
    await screen.findByRole('dialog', { name: 'Crie um PIN de 4 dígitos' })
    await typePin('1357')
    await screen.findByRole('dialog', { name: 'Digite o PIN de novo' })
    await typePin('2468')
    expect(await screen.findByText('Os PINs não são iguais. Comece de novo.')).toBeInTheDocument()
    await typePin('1357')
    await screen.findByRole('dialog', { name: 'Digite o PIN de novo' })
    await typePin('1357')

    await waitFor(() => expect(screen.getByRole('button', { name: 'Notícias: Bloqueada' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Controle parental: Ligado' })).toHaveAttribute('aria-pressed', 'true')
    expect(await verifyPin(SOURCE, '1357')).toBe(true)
    expect((await listManagedCategories(SOURCE, 'channel')).find((category) => category.name === 'Notícias')?.locked).toBe(true)
  })

  it('com PIN, a aba pede o PIN ao entrar; errado avisa, certo libera; desligar pede o PIN e mantém escondidas', async () => {
    await enableParentalControl(SOURCE, '2580', [])
    const { props, press } = renderTab()
    expect(await screen.findByText('Digite o PIN para gerenciar as categorias e o controle parental.')).toBeInTheDocument()
    expect(screen.queryByText('Notícias')).toBeNull()

    press((h) => h.onEnter())
    await screen.findByRole('dialog', { name: 'Digite o PIN' })
    await typePin('0000')
    expect(await screen.findByText('PIN incorreto')).toBeInTheDocument()
    await typePin('2580')
    await screen.findByText('Notícias')
    expect(focusedText()).toBe('Controle parental: Ligado')
    press((h) => h.onDirection('right'))
    expect(focusedText()).toBe('Trocar PIN')

    // O interruptor ligado desliga (pedindo o PIN atual).
    press((h) => h.onDirection('left'))
    press((h) => h.onSelect())
    await screen.findByRole('dialog', { name: 'Digite o PIN atual' })
    await typePin('2580')
    await waitFor(() => expect(props.showToast).toHaveBeenCalledWith('Controle parental desligado. As categorias escondidas continuam escondidas.'))
    expect(await hasPin(SOURCE)).toBe(false)
  })
})
