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

  it('cadastrar uma fonte de provedor dispara o pipeline local e não faz requisição', async () => {
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

    // Xtream Codes já vem selecionado (feature 037, FR-015).
    fireEvent.change(screen.getByLabelText('Nome da lista'), { target: { value: 'Meu Provedor' } })
    fireEvent.change(screen.getByLabelText('Servidor'), { target: { value: 'http://provedor.test' } })
    fireEvent.change(screen.getByLabelText('Usuário'), { target: { value: 'testuser' } })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'testpass' } })

    fireEvent.click(screen.getByRole('button', { name: 'Conectar e sincronizar' }))

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
// Feature 023, US4 (T034/T037), redesenhada na feature 037 (T027): cadastro no
// formato do `sourceSetup()` — mesmo formulário real, campos da feature 022,
// painel "Conectar com celular" como mock "Em breve".
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

function chooseM3u() {
  fireEvent.click(screen.getByRole('button', { name: /Lista M3U/ }))
}

describe('AddSourceScreen — cadastro no formato do protótipo (features 023 e 037)', () => {
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

  it('estrutura do `sourceSetup()`: título, "Como funciona" sem passo concluído, "Adicionar serviço", id do título preservado (D-002)', () => {
    render(<AddSourceScreen onSourceCreated={vi.fn()} onBack={vi.fn()} />, { wrapper: createWrapper() })

    expect(document.getElementById('add-source-title')).toHaveTextContent('Conecte sua lista IPTV')
    expect(screen.getByText('Configuração inicial')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Como funciona' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '1Escolha o tipoXtream Codes ou Lista M3U',
      '2Digite os dadosServidor e login, ou a URL da lista',
      '3Sincronizar tudoCanais, EPG, filmes e séries chegam na TV',
    ])
    expect(screen.getByRole('heading', { name: 'Adicionar serviço' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Configuração manual' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Tipo de lista' })).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument()
  })

  // Feature 028, FR-015/FR-017.
  it('todo controle tem nome acessível, nos dois tipos', () => {
    const { container } = render(<AddSourceScreen onSourceCreated={vi.fn()} onBack={vi.fn()} />, {
      wrapper: createWrapper(),
    })
    expect(findUnnamedControls(container).map((f) => f.description)).toEqual([])
    chooseM3u()
    expect(findUnnamedControls(container).map((f) => f.description)).toEqual([])
  })

  it('cada campo declara o teclado certo para a TV: inputmode/type/autocomplete por finalidade (FR-034, DS §37)', () => {
    render(<AddSourceScreen onSourceCreated={vi.fn()} onBack={vi.fn()} />, { wrapper: createWrapper() })

    const name = screen.getByLabelText('Nome da lista')
    expect(name).not.toHaveAttribute('inputmode')
    expect(name).toHaveAttribute('type', 'text')

    const dns = screen.getByLabelText('Servidor')
    expect(dns).toHaveAttribute('inputmode', 'url')
    expect(dns).toHaveAttribute('type', 'url')
    expect(screen.getByLabelText('Usuário')).toHaveAttribute('autocomplete', 'username')
    const password = screen.getByLabelText('Senha')
    expect(password).toHaveAttribute('type', 'password')
    expect(password).toHaveAttribute('autocomplete', 'current-password')

    chooseM3u()
    const url = screen.getByLabelText('URL M3U')
    expect(url).toHaveAttribute('inputmode', 'url')
    expect(url).toHaveAttribute('type', 'url')
  })

  it('rótulo é permanente, nunca placeholder: nenhum campo usa placeholder, nos dois tipos (DS §37)', () => {
    render(<AddSourceScreen onSourceCreated={vi.fn()} onBack={vi.fn()} />, { wrapper: createWrapper() })
    for (const input of document.querySelectorAll('input')) {
      expect(input).not.toHaveAttribute('placeholder')
    }
    chooseM3u()
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
    // Sem seletor de tipo, sem celular e sem "Como funciona" ao editar (D-015).
    expect(screen.queryByRole('group', { name: 'Tipo de lista' })).not.toBeInTheDocument()
    expect(screen.queryByText('Conectar com celular')).not.toBeInTheDocument()

    expect(screen.getByLabelText('Nome da lista')).toHaveValue('Meu Provedor')
    expect(screen.getByLabelText('Servidor')).toHaveValue('http://prov.test')

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
    expect(screen.getByLabelText('URL M3U')).toHaveValue('')
    expect(screen.getByText('Deixe em branco para manter a URL atual')).toBeVisible()
  })

  it('"Conectar com celular" é um mock: anuncia "Em breve", não navega e não sai do formulário (FR-035, FR-013)', () => {
    vi.useFakeTimers()
    const onBack = vi.fn()
    const onSourceCreated = vi.fn()
    render(
      <RegionHost>
        <AddSourceScreen onSourceCreated={onSourceCreated} onBack={onBack} />
      </RegionHost>,
      { wrapper: createWrapper() },
    )

    expect(screen.getByRole('heading', { name: 'Conectar com celular' })).toBeInTheDocument()
    const message = getComingSoon('pair-phone').message
    fireEvent.click(screen.getByRole('button', { name: message }))
    vi.advanceTimersByTime(20)

    expect(document.querySelector('.announcer-region .sr-only')?.textContent).toBe(`Em breve — ${message}`)
    expect(document.getElementById('add-source-title')).toBeInTheDocument()
    expect(onBack).not.toHaveBeenCalled()
    expect(onSourceCreated).not.toHaveBeenCalled()
  })

  it('abre com o foco em "Xtream Codes" e ↑ alcança o mock do celular, anterior no DOM (D-009, FR-042)', () => {
    render(<AddSourceScreen onSourceCreated={vi.fn()} onBack={vi.fn()} />, { wrapper: createWrapper() })

    expect(screen.getByRole('button', { name: /Xtream Codes/ })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'ArrowUp' })
    expect(screen.getByRole('button', { name: getComingSoon('pair-phone').message })).toHaveFocus()
  })

  it('as setas percorrem tipos → campos → Voltar → "Conectar e sincronizar", na ordem visual', () => {
    render(<AddSourceScreen onSourceCreated={vi.fn()} onBack={vi.fn()} />, { wrapper: createWrapper() })

    const expected = ['Lista M3U', 'Nome da lista', 'Servidor', 'Usuário', 'Senha', 'Voltar', 'Conectar e sincronizar']
    const seen: string[] = []
    for (let i = 0; i < expected.length; i += 1) {
      fireEvent.keyDown(document, { key: 'ArrowDown' })
      const active = document.activeElement as HTMLElement
      seen.push(
        active.tagName === 'INPUT'
          ? (active as HTMLInputElement).labels![0].textContent!
          : (active.querySelector('b')?.textContent ?? active.textContent!),
      )
    }
    expect(seen).toEqual(expected)
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

  it('RETURN com o foco num campo também sai da tela (FR-019)', () => {
    const onBack = vi.fn()
    render(<AddSourceScreen onSourceCreated={vi.fn()} onBack={onBack} />, { wrapper: createWrapper() })

    const field = screen.getByLabelText('Senha')
    field.focus()
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('"Voltar" chama onBack, sem salvar nada (FR-019)', async () => {
    const onBack = vi.fn()
    render(<AddSourceScreen onSourceCreated={vi.fn()} onBack={onBack} />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(await db.sources.count()).toBe(0)
  })

  it('a validação de sempre continua — só o texto de nome vazio mudou (FR-018)', async () => {
    render(<AddSourceScreen onSourceCreated={vi.fn()} onBack={vi.fn()} />, { wrapper: createWrapper() })
    const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Conectar e sincronizar' }))

    submit()
    expect(screen.getByRole('alert')).toHaveTextContent('Informe um nome para a lista.')

    fireEvent.change(screen.getByLabelText('Nome da lista'), { target: { value: 'Casa' } })
    submit()
    expect(screen.getByRole('alert')).toHaveTextContent('Informe endereço do servidor, usuário e senha.')

    fireEvent.change(screen.getByLabelText('Servidor'), { target: { value: 'http://prov.test' } })
    fireEvent.change(screen.getByLabelText('Usuário'), { target: { value: 'u' } })
    submit()
    expect(screen.getByRole('alert')).toHaveTextContent('Informe endereço do servidor, usuário e senha.')

    chooseM3u()
    submit()
    expect(screen.getByRole('alert')).toHaveTextContent('Informe a URL da lista M3U.')

    expect(await db.sources.count()).toBe(0)
  })

  it('OK duplo em "Conectar e sincronizar" cria uma lista só; o botão segue focável durante o envio', async () => {
    const onSourceCreated = vi.fn()
    render(<AddSourceScreen onSourceCreated={onSourceCreated} onBack={vi.fn()} />, { wrapper: createWrapper() })

    chooseM3u()
    fireEvent.change(screen.getByLabelText('Nome da lista'), { target: { value: 'Casa' } })
    fireEvent.change(screen.getByLabelText('URL M3U'), { target: { value: 'http://lista.exemplo/playlist.m3u' } })
    const submit = screen.getByRole('button', { name: 'Conectar e sincronizar' })
    fireEvent.click(submit)
    const pending = await screen.findByRole('button', { name: 'Conectando…' })
    expect(pending).not.toBeDisabled()
    fireEvent.click(pending)

    await waitFor(() => expect(onSourceCreated).toHaveBeenCalledTimes(1))
    expect(await db.sources.count()).toBe(1)
  })
})
