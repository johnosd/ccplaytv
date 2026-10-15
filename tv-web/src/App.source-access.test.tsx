import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { checkSourceAccount } from './lib/catalog/accountCheck'
import { readLastSourceId } from './navigation/lastSource'
import type { SourceOut } from './features/import/importApi'

/**
 * Feature 034 (US2, T022): o roteamento do `App` ao escolher uma lista —
 * `open` entra no Início; conta vencida/recusada ou por verificar passa pela
 * tela de acesso; M3U avulsa e Modo limitado nunca passam (FR-022). As telas
 * pesadas ficam mockadas (já têm cobertura própria); a tela de acesso é a
 * real, com a consulta à conta mockada.
 */

vi.mock('./lib/tizenColorKey', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/tizenColorKey')>()),
  registerFavoriteColorKey: vi.fn(),
  registerRemoveColorKey: vi.fn(() => false),
}))

vi.mock('./lib/catalog/accountCheck', () => ({ checkSourceAccount: vi.fn() }))

vi.mock('./features/splash/SplashScreen', () => ({
  SplashScreen: ({ onFinished }: { onFinished: () => void }) => {
    onFinished()
    return null
  },
}))

let chosen: unknown = null

vi.mock('./features/profiles/ProfilesScreen', () => ({
  ADD_LIST_FOCUS_ID: '__add__',
  ProfilesScreen: ({
    onChooseSource,
    initialFocusSourceId,
  }: {
    onChooseSource: (source: unknown) => void
    initialFocusSourceId?: string | null
  }) => (
    <div>
      <span data-testid="profiles-initial-focus">{String(initialFocusSourceId ?? 'sem-foco')}</span>
      <button type="button" onClick={() => onChooseSource(chosen)}>
        escolher-fonte
      </button>
    </div>
  ),
}))

vi.mock('./features/import/AddSourceScreen', () => ({
  AddSourceScreen: ({ onBack }: { onBack: () => void }) => (
    <button type="button" onClick={onBack}>
      voltar-cadastro
    </button>
  ),
}))

vi.mock('./features/home/HomeContent', () => ({
  HomeContent: () => <span data-testid="inicio">inicio-aberto</span>,
}))

const NOW = Date.now()

function makeSource(overrides: Partial<SourceOut> = {}): SourceOut {
  return {
    id: 'src-x',
    type: 'provider_credentials',
    display_name: 'Lista X',
    connection_state: 'synced',
    last_successful_sync_at: null,
    provider_import_mode: 'xtream_api',
    limited_reason: null,
    provider_dns: 'painel.exemplo.test',
    last_truncated_by_storage: false,
    last_discarded_by_type: 0,
    ...overrides,
  }
}

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  )
}

const choose = () => fireEvent.click(screen.getByRole('button', { name: 'escolher-fonte' }))

beforeEach(() => {
  window.localStorage.clear()
  vi.mocked(checkSourceAccount).mockReset()
})

afterEach(cleanup)

describe('App — acesso à lista ao escolhê-la (feature 034, US2)', () => {
  it('M3U avulsa e Modo limitado abrem o Início, mesmo com "recusada" guardado (FR-022)', async () => {
    chosen = makeSource({ type: 'm3u_url', provider_import_mode: null, account: { status: 'refused', checkedAt: NOW } })
    renderApp()
    choose()
    expect(await screen.findByTestId('inicio')).toBeInTheDocument()
    expect(checkSourceAccount).not.toHaveBeenCalled()
  })

  it('Xtream com conta ativa e verificação recente: abre o Início sem consultar o painel (FR-008)', async () => {
    chosen = makeSource({ account: { status: 'active', expiresAt: NOW + 86_400_000 * 90, checkedAt: NOW - 60_000 } })
    renderApp()
    choose()
    expect(await screen.findByTestId('inicio')).toBeInTheDocument()
    expect(checkSourceAccount).not.toHaveBeenCalled()
  })

  it('credencial recusada guardada: mostra a tela de acesso, nunca o Início; RETURN volta aos perfis com o foco na lista', async () => {
    chosen = makeSource({ account: { status: 'refused', checkedAt: NOW - 60_000 } })
    renderApp()
    choose()
    expect(await screen.findByText('O provedor recusou o usuário ou a senha desta lista.')).toBeInTheDocument()
    expect(screen.queryByTestId('inicio')).not.toBeInTheDocument()
    // Nada de "última lista usada" enquanto o acesso não abriu (D-004/D-007).
    expect(readLastSourceId()).toBeFalsy()

    fireEvent.keyDown(document.body, { key: 'Escape', bubbles: true })
    expect(await screen.findByTestId('profiles-initial-focus')).toHaveTextContent('src-x')
  })

  it('nunca verificada: "Verificando…" e, com a conta válida, o Início abre', async () => {
    vi.mocked(checkSourceAccount).mockResolvedValue({
      fresh: true,
      account: { status: 'active', expiresAt: NOW + 86_400_000 * 90, checkedAt: NOW },
    })
    chosen = makeSource()
    renderApp()
    choose()
    expect(await screen.findByTestId('inicio')).toBeInTheDocument()
    expect(checkSourceAccount).toHaveBeenCalledWith('src-x')
  })

  it('"Editar lista" abre a edição; voltar da edição retorna à tela de acesso, que refaz a decisão', async () => {
    chosen = makeSource({ account: { status: 'active', expiresAt: NOW - 86_400_000 * 3, checkedAt: NOW - 60_000 } })
    renderApp()
    choose()
    const edit = await screen.findByRole('button', { name: 'Editar lista' })
    await act(async () => {
      fireEvent.click(edit)
    })
    fireEvent.click(await screen.findByRole('button', { name: 'voltar-cadastro' }))
    expect(await screen.findByRole('button', { name: 'Editar lista' })).toBeInTheDocument()
    expect(screen.queryByTestId('inicio')).not.toBeInTheDocument()
  })
})
