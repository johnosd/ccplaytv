import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import App from './App'
import { readLastSourceId } from './navigation/lastSource'
const fixture = vi.hoisted(() => ({ allowed: true, sourceAccess: false, openSource: vi.fn(),
  denied: new Set<(sourceId?: string) => void>(), listeners: new Set<() => void>(),
  decision: { allowed: true, reason: 'valid' } }))
const source = { id: 'licensed-source', type: 'm3u_url', display_name: 'Minha lista', connection_state: 'synced',
  last_successful_sync_at: null, provider_import_mode: null, limited_reason: null, provider_dns: null,
  last_truncated_by_storage: false, last_discarded_by_type: 0 }
vi.mock('./lib/licensing/licenseRuntime', () => ({ commercialBuild: true, licenseAuthority: vi.fn(),
  licenseMonitor: { start: () => () => {}, check: () => fixture.decision, getSnapshot: () => ({ decision: fixture.decision }),
    subscribe: (listener: () => void) => { fixture.listeners.add(listener); return () => { fixture.listeners.delete(listener) } } },
  allowListEntry: (sourceId?: string) => { if (fixture.allowed) return true; for (const listener of fixture.denied) listener(sourceId); return false },
  onListEntryDenied: (listener: (sourceId?: string) => void) => { fixture.denied.add(listener); return () => { fixture.denied.delete(listener) } },
}))
vi.mock('./lib/portal/portalRuntime', () => ({ getPortalConnection: () => { throw new Error('fixture_unconfigured') },
  registerPortalRefresh: () => () => {}, refreshPortal: async () => ({ ok: false }) }))
vi.mock('./lib/catalog/sourceAccount', () => ({ decideSourceAccess: () => ({ action: fixture.sourceAccess ? 'check' : 'open' }) }))
vi.mock('./features/import/importApi', () => ({ TERMINAL_STATUSES: [],
  useSources: () => ({ isSuccess: true, data: { sources: [source] } }), useImportJob: () => ({ data: undefined }),
  useOpenSource: () => ({ mutate: fixture.openSource }), useResyncSource: () => ({ mutate: vi.fn() }),
}))
vi.mock('./features/splash/SplashScreen', () => ({ SplashScreen: ({ onFinished }: { onFinished(): void }) => {
  useEffect(onFinished, [onFinished]); return null
} }))
vi.mock('./features/profiles/ProfilesScreen', () => ({ ADD_LIST_FOCUS_ID: '__add__',
  ProfilesScreen: ({ onChooseSource, onBack, onManageSources, initialFocusSourceId }: { initialFocusSourceId?: string; onChooseSource(value: unknown): void; onBack(): void; onManageSources(): void }) =>
    <><span data-testid="profile-focus">{initialFocusSourceId}</span><button onClick={() => onChooseSource(source)}>entrar fixture</button><button onClick={onBack}>retornar fixture</button><button onClick={onManageSources}>configurar fixture</button></>
}))
vi.mock('./features/home/HomeScreen', () => ({ HomeScreen: ({ onOpenProfiles }: { onOpenProfiles(): void }) =>
  <><span>lista aberta fixture</span><button onClick={() => onOpenProfiles()}>sair fixture</button></>
}))
vi.mock('./navigation/routeModules', () => ({ useRouteWarmup: () => {},
  SourceAccessRoute: ({ onOpen }: { onOpen(value: unknown): void }) => <button onClick={() => onOpen(source)}>provedor autorizado fixture</button>,
  AddSourceScreen: () => null, ImportProgressScreen: () => null, LiveScreen: () => null, VodShowcaseScreen: () => null,
  MovieDetailScreen: () => null, SeriesDetailScreen: () => null, SearchScreen: () => null, VodCategoryScreen: () => null, PersonScreen: () => null,
}))
vi.mock('./navigation/settingsRoutes', () => ({ openListSettings: vi.fn(), renderSettingsRoute: () => <span>configurações fixture</span> }))
vi.mock('./features/catalog/prefetchApi', () => ({ usePrefetchForSource: () => {}, wakePrefetch: vi.fn() }))
vi.mock('./features/catalog/categoryAccessApi', () => ({ useCategoryAccessLifecycle: () => {} }))
vi.mock('./features/import/useRefreshOnForeground', () => ({ useRefreshOnForeground: () => {} }))
afterEach(() => { cleanup(); fixture.allowed = true; fixture.sourceAccess = false; fixture.decision = { allowed: true, reason: 'valid' }; fixture.denied.clear(); fixture.listeners.clear(); vi.clearAllMocks(); window.localStorage.clear() })
function setup() {
  window.localStorage.clear()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><App /></QueryClientProvider>)
}
function expire() { act(() => { fixture.allowed = false; fixture.decision = { allowed: false, reason: 'expired' }; for (const listener of fixture.listeners) listener() }) }
it('licença vencida impede entrada antes de atualização/importação da lista', async () => {
  fixture.allowed = false; fixture.decision = { allowed: false, reason: 'expired' }
  setup()
  fireEvent.click(await screen.findByRole('button', { name: 'entrar fixture' }))
  expect(screen.getByRole('dialog', { name: 'Licença necessária para abrir a lista' })).toBeInTheDocument()
  expect(screen.queryByText('lista aberta fixture')).not.toBeInTheDocument()
  expect(fixture.openSource).not.toHaveBeenCalled()
  expect(readLastSourceId()).toBeFalsy()
  fireEvent.keyDown(document.body, { key: 'Escape', bubbles: true })
  expect(screen.getByTestId('profile-focus')).toHaveTextContent('licensed-source')
  fireEvent.click(screen.getByRole('button', { name: 'configurar fixture' }))
  expect(screen.getByText('configurações fixture')).toBeInTheDocument()
})
it('vence dentro da lista e continua; sair impede nova escolha e RETURN para a lista anterior', async () => {
  setup()
  fireEvent.click(await screen.findByRole('button', { name: 'entrar fixture' }))
  expect(await screen.findByText('lista aberta fixture')).toBeInTheDocument()
  expire()
  expect(screen.getByText('lista aberta fixture')).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'sair fixture' }))
  fireEvent.click(screen.getByRole('button', { name: 'retornar fixture' }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.queryByText('lista aberta fixture')).not.toBeInTheDocument()
  fireEvent.keyDown(document.body, { key: 'Escape', bubbles: true })
  fireEvent.click(screen.getByRole('button', { name: 'entrar fixture' }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})
it('verificação de provedor não contorna vencimento antes de concluir a entrada', async () => {
  fixture.sourceAccess = true
  setup()
  fireEvent.click(await screen.findByRole('button', { name: 'entrar fixture' }))
  await screen.findByRole('button', { name: 'provedor autorizado fixture' })
  expire()
  fireEvent.click(screen.getByRole('button', { name: 'provedor autorizado fixture' }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.queryByText('lista aberta fixture')).not.toBeInTheDocument()
  expect(fixture.openSource).not.toHaveBeenCalled()
})

it('reabrir o app revalida; renovação válida permite entrar novamente', async () => {
  const view = setup()
  fireEvent.click(await screen.findByRole('button', { name: 'entrar fixture' }))
  await screen.findByText('lista aberta fixture')
  expire()
  view.unmount()
  setup()
  fireEvent.click(await screen.findByRole('button', { name: 'entrar fixture' }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.queryByText('lista aberta fixture')).not.toBeInTheDocument()
  act(() => { fixture.allowed = true; fixture.decision = { allowed: true, reason: 'valid' }; for (const listener of fixture.listeners) listener() })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'entrar fixture' }))
  expect(await screen.findByText('lista aberta fixture')).toBeInTheDocument()
})
