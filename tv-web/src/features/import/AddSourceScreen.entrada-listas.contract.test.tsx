import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddSourceScreen } from './AddSourceScreen'
import { db } from '../../lib/catalog/db'
import { AnnouncerContext } from '../../lib/announcer'
import { findUnnamedControls } from '../../testing/accessibleNames'

vi.spyOn(globalThis, 'fetch')

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

/** Região de anúncio (feature 021) — mesmo padrão de `AddSourceScreen.test.tsx`. */
function RegionHost({ children }: { children: ReactNode }) {
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

describe('AddSourceScreen — contrato da feature 037', () => {
  beforeEach(() => {
    // Emenda aprovada (feature 045, R-003): o cadastro agora confirma a conexão antes de criar a
    // lista, então a rede precisa servir um M3U mínimo — só o mock mudou, nenhuma asserção.
    vi.mocked(globalThis.fetch).mockImplementation(() =>
      Promise.resolve(new Response('#EXTM3U\n#EXTINF:-1 group-title="Canais",Canal\nhttp://lista.exemplo/1.ts\n')),
    )
  })

  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    vi.useRealTimers()
    await db.sources.clear()
    await db.importRuns.clear()
  })

  // US2/AC1-AC4, FR-012, FR-015, FR-016, FR-017, FR-018
  it('abre em Xtream Codes (selecionado e em foco); trocar para Lista M3U mantém o nome e "Conectar e sincronizar" cria a lista', async () => {
    const onSourceCreated = vi.fn()
    render(<AddSourceScreen onSourceCreated={onSourceCreated} onBack={vi.fn()} />, { wrapper: createWrapper() })

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Conecte sua lista IPTV')

    const xtream = screen.getByRole('button', { name: /Xtream Codes/ })
    const m3u = screen.getByRole('button', { name: /Lista M3U/ })
    expect(xtream).toHaveAttribute('aria-pressed', 'true')
    expect(m3u).toHaveAttribute('aria-pressed', 'false')
    expect(xtream).toHaveFocus()

    expect(screen.getByLabelText('Nome da lista')).toBeInTheDocument()
    expect(screen.getByLabelText('Servidor')).toBeInTheDocument()
    expect(screen.getByLabelText('Usuário')).toBeInTheDocument()
    expect(screen.getByLabelText('Senha')).toBeInTheDocument()
    expect(screen.queryByLabelText('URL M3U')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Nome da lista'), { target: { value: 'Casa' } })
    fireEvent.click(m3u)

    expect(screen.getByRole('button', { name: /Lista M3U/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Xtream Codes/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByLabelText('Nome da lista')).toHaveValue('Casa')
    expect(screen.queryByLabelText('Servidor')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('URL M3U'), { target: { value: 'http://lista.exemplo/playlist.m3u' } })
    fireEvent.click(screen.getByRole('button', { name: 'Conectar e sincronizar' }))

    await waitFor(() => expect(onSourceCreated).toHaveBeenCalledTimes(1))
    const sources = await db.sources.toArray()
    expect(sources).toHaveLength(1)
    expect(sources[0].displayName).toBe('Casa')
  })

  // FR-013, FR-014, FR-023, SC-005 — mocks "Em breve", nunca dado inventado (ADR-011)
  it('"Conectar com celular" é mock honesto: "Em breve", sem "Recomendado", sem código/QR/endereço inventados, e só anuncia ao ativar', () => {
    vi.useFakeTimers()
    const onBack = vi.fn()
    const onSourceCreated = vi.fn()
    const { container } = render(
      <RegionHost>
        <AddSourceScreen onSourceCreated={onSourceCreated} onBack={onBack} />
      </RegionHost>,
      { wrapper: createWrapper() },
    )

    expect(screen.getByRole('heading', { name: 'Conectar com celular' })).toBeInTheDocument()
    expect(screen.getAllByText(/Em breve/i).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Recomendado/i)).not.toBeInTheDocument()

    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/\b\d{3}\s?\d{3}\b/)
    expect(text).not.toMatch(/ccplay\.tv/i)

    const pair = screen.getByRole('button', { name: /celular/i })
    expect(pair).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(pair)
    vi.advanceTimersByTime(20)
    expect(document.querySelector('.announcer-region .sr-only')?.textContent).toMatch(/^Em breve/)
    expect(onBack).not.toHaveBeenCalled()
    expect(onSourceCreated).not.toHaveBeenCalled()

    expect(findUnnamedControls(container).map((f) => f.description)).toEqual([])
  })
})
