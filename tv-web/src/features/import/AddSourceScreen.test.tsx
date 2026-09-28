import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddSourceScreen } from './AddSourceScreen'
import type { SourceOut } from './importApi'
import { db } from '../../lib/catalog/db'
import * as importPipeline from '../../lib/catalog/importPipeline'
import { AnnouncerContext } from '../../lib/announcer'
import { getComingSoon } from '../../lib/comingSoon'
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

describe('AddSourceScreen', () => {
  beforeEach(() => {
    // O espião sem implementação chama a rede de verdade: a importação que o
    // cadastro dispara fica tentando alcançar um host inexistente, e o
    // arquivo de teste termina com ela ainda correndo. Recusar na hora faz a
    // importação fracassar e se encerrar dentro do teste.
    vi.mocked(globalThis.fetch).mockRejectedValue(new TypeError('Failed to fetch'))
  })

  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    await db.sources.clear()
    await db.importRuns.clear()
  })

  it('cadastrar uma fonte de provedor dispara o pipeline local e n\u00e3o faz requisi\u00e7\u00e3o', async () => {
    const onSourceCreated = vi.fn()
    const onBack = vi.fn()
    
    const startImportSpy = vi.spyOn(importPipeline, 'startImport')

    render(
      <AddSourceScreen
        onSourceCreated={onSourceCreated}
        onBack={onBack}
      />,
      { wrapper: createWrapper() }
    )

    fireEvent.click(screen.getByRole('tab', { name: /Endereço, usuário e senha/i }))

    fireEvent.change(screen.getByLabelText(/Nome de exibição/i), { target: { value: 'Meu Provedor' } })
    fireEvent.change(screen.getByLabelText(/Endereço do servidor/i), { target: { value: 'http://provedor.test' } })
    fireEvent.change(screen.getByLabelText(/Usuário/i), { target: { value: 'testuser' } })
    fireEvent.change(screen.getByLabelText(/Senha/i), { target: { value: 'testpass' } })

    fireEvent.click(screen.getByRole('button', { name: /Adicionar lista/i }))

    await waitFor(() => {
      expect(onSourceCreated).toHaveBeenCalled()
    })

    const fetchMock = globalThis.fetch as any
    const calledUrls = fetchMock.mock.calls.map((c: any) => c[0] as string)
    expect(calledUrls.some((url: string) => url.startsWith('/sources'))).toBe(false)
    expect(startImportSpy).toHaveBeenCalled()

    const sources = await db.sources.toArray()
    expect(sources.length).toBe(1)
    expect(sources[0].displayName).toBe('Meu Provedor')
  })
})

// ---------------------------------------------------------------------------
// Feature 023, US4 (T034/T037): onboarding V14 — mesmo formulário real, campos
// da feature 022, cartão "Conectar pelo celular" como mock "Em breve".
// ---------------------------------------------------------------------------

/** Região de anúncio (feature 021) para ler o que `ComingSoon` anuncia — mesmo padrão de `ComingSoon.test.tsx`. */
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

function makeProviderSource(overrides: Partial<SourceOut> = {}): SourceOut {
  return {
    id: 'src-prov',
    type: 'provider_credentials',
    display_name: 'Meu Provedor',
    connection_state: 'synced',
    last_successful_sync_at: null,
    provider_import_mode: 'xtream_api',
    limited_reason: null,
    provider_dns: 'http://prov.test',
    last_truncated_by_storage: false,
    last_discarded_by_type: 0,
    ...overrides,
  }
}

describe('AddSourceScreen — onboarding V14 (feature 023)', () => {
  beforeEach(() => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new TypeError('Failed to fetch'))
  })

  afterEach(async () => {
    cleanup()
    vi.clearAllMocks()
    vi.useRealTimers()
    await db.sources.clear()
    await db.importRuns.clear()
  })

  it('preserva os rótulos, o id do título e o botão que os E2E e a pessoa já conhecem (D-006)', () => {
    render(<AddSourceScreen onSourceCreated={vi.fn()} onBack={vi.fn()} />, { wrapper: createWrapper() })

    expect(document.getElementById('add-source-title')).toHaveTextContent('Adicionar lista')
    expect(screen.getByLabelText('Nome de exibição')).toBeInTheDocument()
    expect(screen.getByLabelText('URL da lista M3U')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adicionar lista' })).toBeInTheDocument()
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Forma de entrada' })).toBeInTheDocument()
  })

  // Feature 028, FR-015/FR-017.
  it('todo controle tem nome acessível', () => {
    const { container } = render(<AddSourceScreen onSourceCreated={vi.fn()} onBack={vi.fn()} />, {
      wrapper: createWrapper(),
    })
    expect(findUnnamedControls(container).map((f) => f.description)).toEqual([])
  })

  it('cada campo declara o teclado certo para a TV: inputmode/type/autocomplete por finalidade (FR-034, DS §37)', () => {
    render(<AddSourceScreen onSourceCreated={vi.fn()} onBack={vi.fn()} />, { wrapper: createWrapper() })

    const name = screen.getByLabelText('Nome de exibição')
    expect(name).not.toHaveAttribute('inputmode')
    expect(name).toHaveAttribute('type', 'text')

    const url = screen.getByLabelText('URL da lista M3U')
    expect(url).toHaveAttribute('inputmode', 'url')
    expect(url).toHaveAttribute('type', 'url')

    fireEvent.click(screen.getByRole('tab', { name: /Endereço, usuário e senha/i }))

    const dns = screen.getByLabelText('Endereço do servidor (DNS do provedor)')
    expect(dns).toHaveAttribute('inputmode', 'url')
    expect(dns).toHaveAttribute('type', 'url')
    expect(screen.getByLabelText('Usuário')).toHaveAttribute('autocomplete', 'username')
    const password = screen.getByLabelText('Senha')
    expect(password).toHaveAttribute('type', 'password')
    expect(password).toHaveAttribute('autocomplete', 'current-password')
  })

  it('rótulo é permanente, nunca placeholder: nenhum campo usa placeholder (DS §37)', () => {
    render(<AddSourceScreen onSourceCreated={vi.fn()} onBack={vi.fn()} />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole('tab', { name: /Endereço, usuário e senha/i }))
    for (const input of document.querySelectorAll('input')) {
      expect(input).not.toHaveAttribute('placeholder')
    }
  })

  it('na edição, "deixe em branco" vira `hint` visível ligado ao campo — e usuário/senha seguem em branco (D-013)', () => {
    render(<AddSourceScreen existingSource={makeProviderSource()} onSourceCreated={vi.fn()} onBack={vi.fn()} />, {
      wrapper: createWrapper(),
    })

    expect(document.getElementById('add-source-title')).toHaveTextContent('Editar lista')
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeInTheDocument()
    // Sem abas e sem o cartão do celular: nada disso faz sentido ao editar.
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryByText('Conectar pelo celular')).not.toBeInTheDocument()

    expect(screen.getByLabelText('Nome de exibição')).toHaveValue('Meu Provedor')
    expect(screen.getByLabelText('Endereço do servidor (DNS do provedor)')).toHaveValue('http://prov.test')

    const username = screen.getByLabelText('Usuário')
    const password = screen.getByLabelText('Senha')
    expect(username).toHaveValue('')
    expect(password).toHaveValue('')
    expect(screen.getByText('Deixe em branco para manter o usuário atual')).toBeVisible()
    expect(screen.getByText('Deixe em branco para manter a senha atual')).toBeVisible()
    expect(document.getElementById(password.getAttribute('aria-describedby')!)).toHaveTextContent(
      'Deixe em branco para manter a senha atual',
    )
  })

  it('editar uma lista M3U: o hint da URL aparece e o campo começa em branco', () => {
    const m3u = makeProviderSource({ type: 'm3u_url', provider_dns: null, display_name: 'Minha M3U' })
    render(<AddSourceScreen existingSource={m3u} onSourceCreated={vi.fn()} onBack={vi.fn()} />, {
      wrapper: createWrapper(),
    })
    expect(screen.getByLabelText('URL da lista M3U')).toHaveValue('')
    expect(screen.getByText('Deixe em branco para manter a URL atual')).toBeVisible()
  })

  it('"Conectar pelo celular" é um mock: anuncia "Em breve", não navega e não sai do formulário (FR-035)', () => {
    vi.useFakeTimers()
    const onBack = vi.fn()
    const onSourceCreated = vi.fn()
    render(
      <RegionHost>
        <AddSourceScreen onSourceCreated={onSourceCreated} onBack={onBack} />
      </RegionHost>,
      { wrapper: createWrapper() },
    )

    expect(screen.getByRole('heading', { name: 'Conectar pelo celular' })).toBeInTheDocument()
    const message = getComingSoon('pair-phone').message
    fireEvent.click(screen.getByRole('button', { name: message }))
    vi.advanceTimersByTime(20)

    expect(document.querySelector('.announcer-region .sr-only')?.textContent).toBe(`Em breve — ${message}`)
    expect(document.getElementById('add-source-title')).toBeInTheDocument()
    expect(onBack).not.toHaveBeenCalled()
    expect(onSourceCreated).not.toHaveBeenCalled()
  })

  it('o cartão do celular é alcançável só com o controle remoto: setas percorrem os focáveis até ele (FR-042)', () => {
    render(<AddSourceScreen onSourceCreated={vi.fn()} onBack={vi.fn()} />, { wrapper: createWrapper() })

    const pairButton = screen.getByRole('button', { name: getComingSoon('pair-phone').message })
    // Ao montar, o foco começa no primeiro focável — a primeira aba.
    expect(screen.getByRole('tab', { name: /URL da lista M3U/i })).toHaveFocus()

    for (let presses = 0; presses < 12 && document.activeElement !== pairButton; presses += 1) {
      fireEvent.keyDown(document, { key: 'ArrowDown' })
    }
    expect(pairButton).toHaveFocus()
  })

  it('RETURN chama onBack, sem salvar nada (FR-036)', async () => {
    const onBack = vi.fn()
    const onSourceCreated = vi.fn()
    render(<AddSourceScreen onSourceCreated={onSourceCreated} onBack={onBack} />, { wrapper: createWrapper() })

    fireEvent.keyDown(document.body, { key: 'Escape' })

    expect(onBack).toHaveBeenCalledTimes(1)
    expect(onSourceCreated).not.toHaveBeenCalled()
    expect(await db.sources.count()).toBe(0)
  })

  it('a validação de sempre continua: nome em branco e URL em branco geram o alerta, sem criar nada', async () => {
    render(<AddSourceScreen onSourceCreated={vi.fn()} onBack={vi.fn()} />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar lista' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Informe um nome de exibição para a fonte.')

    fireEvent.change(screen.getByLabelText('Nome de exibição'), { target: { value: 'Casa' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar lista' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Informe a URL da lista M3U.')

    expect(await db.sources.count()).toBe(0)
  })
})
